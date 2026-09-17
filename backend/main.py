"""Nuru Field API: weather context plus a server-side Gemini proxy.

Keep GEMINI_API_KEY and WEATHERAPI_KEY in backend/.env or the host's
environment. They are intentionally never exposed to the React application
or committed to source control.
"""

import asyncio
import base64
import os
from datetime import date
from pathlib import Path
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


def load_local_env() -> None:
    """Tiny .env reader so the hackathon project has no extra runtime dependency."""
    env_file = Path(__file__).with_name('.env')
    if not env_file.exists():
        return
    for raw_line in env_file.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_local_env()

app = FastAPI(title='Nuru Field API', version='1.0.0')
origins = os.getenv('CORS_ORIGINS', 'http://localhost:5173').split(',')
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in origins],
    allow_credentials=False,
    allow_methods=['POST', 'GET'],
    allow_headers=['Content-Type'],
)

GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash')

# WeatherAPI.com — see fetch_weather() for why we use this instead of
# Open-Meteo. The key must be set in backend/.env and on Render.
WEATHERAPI_KEY = os.getenv('WEATHERAPI_KEY', '')
WEATHERAPI_BASE = 'https://api.weatherapi.com/v1'

FARMER_SYSTEM_PROMPT = """You are Nuru, a thoughtful agricultural field adviser for smallholder and first-time farmers, with a focus on South Africa while remaining useful globally.
Give practical, concise, plain-language advice. Explain uncertainty. You are not a substitute for a local agronomist, soil laboratory, veterinarian, or pesticide label. Never invent local records, disease diagnoses, exact chemical rates, soil nutrient values, or legal requirements. For potentially serious plant disease, pesticide, fertiliser, livestock, food-safety, or weather-risk questions, clearly say when to consult a local extension officer, certified agronomist, or other appropriate professional. Use metric units. Keep answers to a short helpful paragraph followed by 3–5 next steps when useful."""


class Coordinates(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class SoilRequest(BaseModel):
    image: str = Field(min_length=100, max_length=7_000_000)
    mimeType: Literal['image/jpeg', 'image/png', 'image/webp']
    location: str = Field(default='not provided', max_length=120)
    weatherContext: str = Field(default='', max_length=2000)


class ChatMessage(BaseModel):
    role: Literal['user', 'assistant']
    text: str = Field(min_length=1, max_length=2500)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2500)
    history: list[ChatMessage] = Field(default_factory=list, max_length=6)
    fieldContext: str = Field(default='', max_length=2500)


def mean(values: list[float | int | None]) -> float:
    usable = [float(value) for value in values if value is not None]
    return round(sum(usable) / len(usable), 1) if usable else 0.0


# --- Weather fetch via WeatherAPI.com ---------------------------------------
# We previously used Open-Meteo. Their free tier rate-limits by IP address,
# and Render's shared outbound IPs constantly hit "429 Too Many Requests".
# WeatherAPI gives each user a personal key with a real quota, so the 429
# problem goes away entirely.
#
# Return shape is intentionally identical to the old version so the frontend
# and crop-recommendation endpoint don't need any changes.

async def fetch_weather(latitude: float, longitude: float) -> dict:
    """Return a live snapshot and a same-month, 10-year seasonal weather signal."""
    if not WEATHERAPI_KEY:
        raise HTTPException(
            status_code=503,
            detail='Weather is not configured. Add WEATHERAPI_KEY to backend/.env.',
        )

    today = date.today()
    start_year = today.year - 10
    end_year = today.year - 1
    query = f'{latitude},{longitude}'

    # WeatherAPI's history endpoint takes a single date per call. We sample
    # the 15th of the current month for each of the last 10 years — that's
    # enough to compute a same-month average without making 365 calls.
    history_dates = [
        f'{year}-{today.month:02d}-15'
        for year in range(start_year, end_year + 1)
    ]

    try:
        async with httpx.AsyncClient(timeout=18.0) as client:
            # Fire the forecast and all 10 history calls in parallel so the
            # total wall-clock time is one round trip, not eleven.
            forecast_response = await client.get(
                f'{WEATHERAPI_BASE}/forecast.json',
                params={'key': WEATHERAPI_KEY, 'q': query, 'days': 2, 'aqi': 'no'},
            )
            forecast_response.raise_for_status()

            history_responses = await asyncio.gather(*[
                client.get(
                    f'{WEATHERAPI_BASE}/history.json',
                    params={'key': WEATHERAPI_KEY, 'q': query, 'dt': d},
                )
                for d in history_dates
            ], return_exceptions=True)
    except httpx.HTTPError as error:
        # Log the real error so future failures are diagnosable in Render's
        # logs — otherwise we only see a generic 502 and have to guess.
        import traceback
        print(f'[fetch_weather] httpx error: {type(error).__name__}: {error}', flush=True)
        traceback.print_exc()
        raise HTTPException(
            status_code=502,
            detail='Weather data is temporarily unavailable. Please try again shortly.',
        ) from error

    forecast = forecast_response.json()
    current = forecast.get('current', {})
    forecast_days = forecast.get('forecast', {}).get('forecastday', [])
    location_info = forecast.get('location', {})

    # --- Live values ---
    temperature = current.get('temp_c')
    wind_kph = current.get('wind_kph')
    condition = current.get('condition', {}).get('text', 'Local conditions')

    # Chance of rain for today from the daily forecast block.
    chance_of_rain = 0
    if forecast_days:
        chance_of_rain = forecast_days[0].get('day', {}).get('daily_chance_of_rain', 0) or 0

    # Tomorrow's total rainfall.
    next_rain = 0.0
    if len(forecast_days) > 1:
        next_rain = forecast_days[1].get('day', {}).get('totalprecip_mm', 0.0) or 0.0

    # --- 10-year same-month averages from history ---
    historic_temps = []
    historic_rain = []
    for resp in history_responses:
        if isinstance(resp, Exception):
            continue  # skip failed years quietly — we only need an average
        try:
            day = resp.json()['forecast']['forecastday'][0]['day']
            historic_temps.append(day.get('avgtemp_c'))
            historic_rain.append(day.get('totalprecip_mm') or 0.0)
        except (KeyError, IndexError, ValueError):
            continue

    history_temp = round(mean(historic_temps), 1) if historic_temps else 0.0
    history_rain = round(sum(historic_rain) / len(historic_rain), 1) if historic_rain else 0.0
    month_name = today.strftime('%B')

    summary = (
        f'Approximate field coordinates: {latitude:.3f}, {longitude:.3f}. '
        f'Live conditions: {condition.lower()}, {temperature}°C, '
        f'wind {wind_kph} km/h. '
        f'{month_name} seasonal signal ({start_year}–{end_year}): '
        f'average temperature {history_temp}°C and average rainfall {history_rain} mm.'
    )

    return {
        'location': {
            'label': location_info.get('name') or f'Your field · {latitude:.3f}, {longitude:.3f}',
            'latitude': latitude,
            'longitude': longitude,
        },
        'weather': {
            'temperature': round(temperature) if temperature is not None else '--',
            'condition': condition,
            'wind': f'{round(wind_kph)} km/h' if wind_kph is not None else '--',
            'rainChance': f'{round(chance_of_rain)}%',
            # WeatherAPI doesn't expose soil moisture — this stays unknown
            # until we wire a separate data source.
            'soilMoisture': '--',
            'nextRain': f'{next_rain:.1f} mm forecast tomorrow.' if next_rain else 'No meaningful rain forecast tomorrow.',
        },
        'history': {
            'period': f'{month_name} · {start_year}–{end_year}',
            'rainfall': history_rain,
            'note': f'Average {month_name.lower()} rainfall and temperature from modelled historical weather. This is not a flood or drought record.',
        },
        'summary': summary,
    }


# --- Gemini client (lazy singleton) ------------------------------------------
# We use the official google-genai SDK instead of raw httpx calls because it
# handles the new AQ.-prefixed API keys and version routing automatically.
# The client is created once on first use and reused for every request.

_genai_client = None


def get_genai_client():
    """Create the Gemini client on first use.

    Lazy because /api/health needs to respond even when the key isn't set yet.
    """
    global _genai_client
    if _genai_client is None:
        from google import genai
        api_key = os.getenv('GEMINI_API_KEY')
        if not api_key:
            raise HTTPException(
                status_code=503,
                detail='AI is not configured yet. Add GEMINI_API_KEY to backend/.env, then restart the API.',
            )
        _genai_client = genai.Client(api_key=api_key)
    return _genai_client


async def gemini_answer(contents: list[dict]) -> str:
    """Send a multimodal prompt to Gemini and return the response text.

    Handles transient 503s from Gemini (which happen during peak demand on
    new model launches) by retrying with exponential backoff. Falls back to
    a secondary model if the primary stays unavailable.
    """
    from google.genai import types

    client = get_genai_client()

    # Convert our internal {role, parts} dict shape into SDK types.
    sdk_contents = []
    for item in contents:
        sdk_parts = []
        for part in item.get('parts', []):
            if 'text' in part:
                sdk_parts.append(types.Part.from_text(text=part['text']))
            elif 'inlineData' in part:
                inline = part['inlineData']
                sdk_parts.append(types.Part.from_bytes(
                    data=base64.b64decode(inline['data']),
                    mime_type=inline['mimeType'],
                ))
        sdk_contents.append(types.Content(role=item.get('role', 'user'), parts=sdk_parts))

    # Try primary model, then fall back to a lighter one on persistent overload.
    models_to_try = [GEMINI_MODEL, 'gemini-3.5-flash', 'gemini-2.5-flash-lite']

    max_attempts = 4
    last_error = None

    for model_name in models_to_try:
        for attempt in range(max_attempts):
            try:
                response = await asyncio.to_thread(
                    client.models.generate_content,
                    model=model_name,
                    contents=sdk_contents,
                    config=types.GenerateContentConfig(
                        system_instruction=FARMER_SYSTEM_PROMPT,
                        temperature=0.35,
                        max_output_tokens=650,
                    ),
                )
                text = (response.text or '').strip()
                if text:
                    return text
                last_error = 'empty response'
                break
            except Exception as error:
                last_error = str(error)
                # Only retry on 503 (overloaded) and 429 (rate limited).
                if '503' in str(error) or '429' in str(error):
                    delay = 2 ** attempt
                    await asyncio.sleep(delay)
                    continue
                break

    raise HTTPException(
        status_code=502,
        detail=f'The AI service is temporarily overloaded. Last error: {last_error}',
    )


@app.get('/api/health')
async def health() -> dict:
    return {'status': 'ok', 'aiConfigured': bool(os.getenv('GEMINI_API_KEY'))}


@app.post('/api/field-profile')
async def field_profile(coordinates: Coordinates) -> dict:
    return await fetch_weather(coordinates.latitude, coordinates.longitude)


@app.post('/api/soil-analysis')
async def soil_analysis(request: SoilRequest) -> dict:
    try:
        base64.b64decode(request.image, validate=True)
    except ValueError as error:
        raise HTTPException(status_code=422, detail='That photo could not be read. Please take a new JPG or PNG photo.') from error
    prompt = f"""Review this photo of soil as an initial visual field observation, not a laboratory test.
Location shared by the farmer: {request.location}.
Optional weather context: {request.weatherContext or 'none'}.
Describe only visually supportable clues about colour, texture, compaction, stones, residue, moisture or drainage. Then give 3 practical low-cost next checks or actions. Clearly state that pH, nutrients, salinity and contamination cannot be determined from a photo. Keep it under 190 words."""
    answer = await gemini_answer([{'role': 'user', 'parts': [{'text': prompt}, {'inlineData': {'mimeType': request.mimeType, 'data': request.image}}]}])
    return {'answer': answer}


@app.post('/api/farm-chat')
async def farm_chat(request: ChatRequest) -> dict:
    context = f'Field context supplied by the farmer: {request.fieldContext or "No field context has been supplied."}'
    contents = []
    for message in request.history[:-1]:
        contents.append({'role': 'model' if message.role == 'assistant' else 'user', 'parts': [{'text': message.text}]})
    contents.append({'role': 'user', 'parts': [{'text': f'{context}\n\nFarmer question: {request.message}'}]})
    return {'answer': await gemini_answer(contents)}
class PestRequest(BaseModel):
    image: str = Field(min_length=100, max_length=7_000_000)
    mimeType: Literal['image/jpeg', 'image/png', 'image/webp']
    location: str = Field(default='not provided', max_length=120)
    weatherContext: str = Field(default='', max_length=2000)
    crop: str = Field(default='not specified', max_length=120)


@app.post('/api/pest-analysis')
async def pest_analysis(request: PestRequest) -> dict:
    try:
        base64.b64decode(request.image, validate=True)
    except ValueError as error:
        raise HTTPException(
            status_code=422,
            detail='That photo could not be read. Please take a new JPG or PNG photo.',
        ) from error

    prompt = f"""Review this photo of a plant leaf, stem or fruit as an initial visual field observation, not a laboratory diagnosis.
Crop the farmer says this is: {request.crop}.
Location shared by the farmer: {request.location}.
Optional weather context: {request.weatherContext or 'none'}.
Identify only what is visually supportable: leaf discolouration, spots, holes, wilting, mould, insects, eggs or frass. Name the most likely pest or disease group only if the visual evidence is clear, and say plainly when it is not. Then give 3 practical low-cost next steps a smallholder farmer can take this week. State clearly that a photo cannot confirm a disease, and that chemical treatment must follow the product label and local extension advice. Do not invent pesticide names or application rates. Keep it under 190 words."""

    answer = await gemini_answer([{
        'role': 'user',
        'parts': [
            {'text': prompt},
            {'inlineData': {'mimeType': request.mimeType, 'data': request.image}},
        ],
    }])
    return {'answer': answer}