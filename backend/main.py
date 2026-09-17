"""Nuru Field API: weather context plus a server-side Gemini proxy.

Keep GEMINI_API_KEY in backend/.env or the host's environment. It is intentionally
never exposed to the React application or committed to source control.
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

FARMER_SYSTEM_PROMPT = """You are Nuru, a thoughtful agricultural field adviser for smallholder and first-time farmers, with a focus on South Africa while remaining useful globally.
Give practical, concise, plain-language advice. Explain uncertainty. You are not a substitute for a local agronomist, soil laboratory, veterinarian, or pesticide label. Never invent local records, disease diagnoses, exact chemical rates, soil nutrient values, or legal requirements. For potentially serious plant disease, pesticide, fertiliser, livestock, food-safety, or weather-risk questions, clearly say when to consult a local extension officer, certified agronomist, or other appropriate professional. Use metric units. Keep answers to a short helpful paragraph followed by 3â€“5 next steps when useful."""


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


WEATHER_CODES = {
    0: 'Clear and calm', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Foggy', 48: 'Icy fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
    61: 'Light rain', 63: 'Rain showers', 65: 'Heavy rain', 71: 'Light snow',
    80: 'Rain showers', 81: 'Moderate showers', 82: 'Heavy showers',
    95: 'Thunderstorms', 96: 'Storm with hail', 99: 'Severe storm with hail',
}


def mean(values: list[float | int | None]) -> float:
    usable = [float(value) for value in values if value is not None]
    return round(sum(usable) / len(usable), 1) if usable else 0.0


async def fetch_weather(latitude: float, longitude: float) -> dict:
    """Return a live snapshot and a same-month, 10-year seasonal weather signal."""
    today = date.today()
    start_year = today.year - 10
    end_year = today.year - 1
    forecast_params = {
        'latitude': latitude, 'longitude': longitude,
        'current': 'temperature_2m,weather_code,wind_speed_10m,soil_moisture_0_to_1cm',
        'hourly': 'precipitation_probability',
        'daily': 'precipitation_probability_max,precipitation_sum',
        'forecast_days': 2, 'timezone': 'auto',
    }
    archive_params = {
        'latitude': latitude, 'longitude': longitude,
        'daily': 'temperature_2m_mean,precipitation_sum',
        'start_date': f'{start_year}-01-01', 'end_date': f'{end_year}-12-31', 'timezone': 'auto',
    }
    try:
        async with httpx.AsyncClient(timeout=18.0) as client:
            forecast_response, archive_response = await asyncio.gather(
                client.get('https://api.open-meteo.com/v1/forecast', params=forecast_params),
                client.get('https://archive-api.open-meteo.com/v1/archive', params=archive_params),
            )
            forecast_response.raise_for_status()
            archive_response.raise_for_status()
    except httpx.HTTPError as error:
        # Log the underlying error before we mask it in the response.
        # Without this, all we see in Render's logs is "502 Bad Gateway"
        # with no reason â€” which is exactly what we were stuck on.
        import traceback
        print(f"[fetch_weather] httpx error: {type(error).__name__}: {error}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=502, detail='Weather data is temporarily unavailable. Please try again shortly.') from error

    forecast = forecast_response.json()
    archive = archive_response.json()
    current = forecast.get('current', {})
    daily = forecast.get('daily', {})
    hourly = forecast.get('hourly', {})
    daily_history = archive.get('daily', {})
    month = f'{today.month:02d}'
    selected_indices = [index for index, day in enumerate(daily_history.get('time', [])) if day[5:7] == month]
    historic_temperatures = [daily_history.get('temperature_2m_mean', [])[index] for index in selected_indices]
    historic_rain = [daily_history.get('precipitation_sum', [])[index] for index in selected_indices]
    precipitation_chances = [value for value in hourly.get('precipitation_probability', [])[:24] if value is not None]
    rain_chance = max(precipitation_chances, default=daily.get('precipitation_probability_max', [None])[0] or 0)
    surface_moisture = current.get('soil_moisture_0_to_1cm')
    soil_moisture = round(float(surface_moisture) * 100) if surface_moisture is not None else '--'
    condition = WEATHER_CODES.get(current.get('weather_code'), 'Local conditions')
    daily_rain = daily.get('precipitation_sum', [0, 0])
    next_rain = float(daily_rain[1] or 0) if len(daily_rain) > 1 else 0
    month_name = today.strftime('%B')
    history_rain = round(sum(float(value or 0) for value in historic_rain) / max(end_year - start_year + 1, 1))
    history_temp = mean(historic_temperatures)
    summary = (
        f'Approximate field coordinates: {latitude:.3f}, {longitude:.3f}. '
        f'Live conditions: {condition.lower()}, {current.get("temperature_2m", "unknown")}Â°C, '
        f'wind {current.get("wind_speed_10m", "unknown")} km/h. '
        f'{month_name} seasonal signal ({start_year}â€“{end_year}): average temperature {history_temp}Â°C and average rainfall {history_rain} mm.'
    )
    return {
        'location': {'label': f'Your field Â· {latitude:.3f}, {longitude:.3f}'},
        'weather': {
            'temperature': round(float(current.get('temperature_2m', 0))), 'condition': condition,
            'wind': f'{round(float(current.get("wind_speed_10m", 0)))} km/h', 'rainChance': f'{round(float(rain_chance))}%',
            'soilMoisture': soil_moisture,
            'nextRain': f'{next_rain:.1f} mm forecast tomorrow.' if next_rain else 'No meaningful rain forecast tomorrow.',
        },
        'history': {
            'period': f'{month_name} Â· {start_year}â€“{end_year}', 'rainfall': history_rain,
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
    # Order matters â€” first available wins.
    models_to_try = [GEMINI_MODEL, 'gemini-3.5-flash', 'gemini-2.5-flash-lite']

    # Total attempts across all models before giving up. With exponential
    # backoff this covers roughly a minute of retrying, which is enough to
    # ride out most transient demand spikes.
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
                break  # empty response -> try next model
            except Exception as error:
                last_error = str(error)
                # Only retry on 503 (overloaded) and 429 (rate limited).
                # Any other error is a real config problem â€” move to next model.
                if '503' in str(error) or '429' in str(error):
                    # 1s, 2s, 4s, 8s backoff
                    delay = 2 ** attempt
                    await asyncio.sleep(delay)
                    continue
                break  # non-transient error -> try next model immediately

    # Every model, every attempt failed.
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