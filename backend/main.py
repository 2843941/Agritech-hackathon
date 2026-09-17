"""Nuru Field API: weather context plus a server-side Gemini proxy and Supabase backend.

Keep GEMINI_API_KEY, WEATHERAPI_KEY, SUPABASE_URL, and SUPABASE_SERVICE_KEY in
backend/.env or the host's environment. They are intentionally never exposed
to the React application or committed to source control.
"""

import asyncio
import base64
import os
from datetime import date
from pathlib import Path
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from supabase import create_client, Client


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
    allow_headers=['Content-Type', 'Authorization'],
)

GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash')

# WeatherAPI.com setup
WEATHERAPI_KEY = os.getenv('WEATHERAPI_KEY', '')
WEATHERAPI_BASE = 'https://api.weatherapi.com/v1'

# --- Supabase Initialization (Lazy/Graceful) --------------------------------
# Initialized on demand to allow health checks even if credentials aren't set yet.
_supabase_client: Client | None = None


def get_supabase() -> Client:
    global _supabase_client
    if _supabase_client is None:
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_service_key = os.getenv("SUPABASE_SERVICE_KEY")
        if not supabase_url or not supabase_service_key:
            raise HTTPException(
                status_code=503,
                detail="Database is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_KEY to backend/.env."
            )
        _supabase_client = create_client(supabase_url, supabase_service_key)
    return _supabase_client


# JWT Auth Dependency for Protected User Routes
async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    try:
        supabase = get_supabase()
        user_response = supabase.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid session or expired token")
        return user_response.user
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")


FARMER_SYSTEM_PROMPT = """You are Nuru, a thoughtful agricultural field adviser for smallholder and first-time farmers, with a focus on South Africa while remaining useful globally.
Give practical, concise, plain-language advice. Explain uncertainty. You are not a substitute for a local agronomist, soil laboratory, veterinarian, or pesticide label. Never invent local records, disease diagnoses, exact chemical rates, soil nutrient values, or legal requirements. For potentially serious plant disease, pesticide, fertiliser, livestock, food-safety, or weather-risk questions, clearly say when to consult a local extension officer, certified agronomist, or other appropriate professional. Use metric units. Keep answers to a short helpful paragraph followed by 3–5 next steps when useful."""


class Coordinates(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class SoilRequest(BaseModel):
    image: str = Field(min_length=100, max_length=7_000_000)
    mimeType: Literal['image/jpeg', 'image/png', 'image/webp'] = 'image/jpeg'
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

    history_dates = [
        f'{year}-{today.month:02d}-15'
        for year in range(start_year, end_year + 1)
    ]

    try:
        async with httpx.AsyncClient(timeout=18.0) as client:
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

    temperature = current.get('temp_c')
    wind_kph = current.get('wind_kph')
    condition = current.get('condition', {}).get('text', 'Local conditions')

    chance_of_rain = 0
    if forecast_days:
        chance_of_rain = forecast_days[0].get('day', {}).get('daily_chance_of_rain', 0) or 0

    next_rain = 0.0
    if len(forecast_days) > 1:
        next_rain = forecast_days[1].get('day', {}).get('totalprecip_mm', 0.0) or 0.0

    historic_temps = []
    historic_rain = []
    for resp in history_responses:
        if isinstance(resp, Exception):
            continue
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

_genai_client = None


def get_genai_client():
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


async def gemini_answer(
    contents: list[dict],
    *,
    temperature: float = 0.35,
    max_output_tokens: int = 650,
) -> str:
    from google.genai import types

    client = get_genai_client()

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
                        temperature=temperature,
                        max_output_tokens=max_output_tokens,
                    ),
                )
                text = (response.text or '').strip()
                if text:
                    return text
                last_error = 'empty response'
                break
            except Exception as error:
                last_error = str(error)
                if '503' in str(error) or '429' in str(error):
                    delay = 2 ** attempt
                    await asyncio.sleep(delay)
                    continue
                break

    raise HTTPException(
        status_code=502,
        detail=f'The AI service is temporarily overloaded. Last error: {last_error}',
    )


# --- GENERAL ENDPOINTS ---

@app.get('/api/health')
async def health() -> dict:
    return {
        'status': 'ok',
        'aiConfigured': bool(os.getenv('GEMINI_API_KEY')),
        'dbConfigured': bool(os.getenv('SUPABASE_URL') and os.getenv('SUPABASE_SERVICE_KEY'))
    }


@app.post('/api/field-profile')
async def field_profile(coordinates: Coordinates) -> dict:
    return await fetch_weather(coordinates.latitude, coordinates.longitude)


@app.post('/api/soil-analysis')
async def soil_analysis(request: SoilRequest) -> dict:
    try:
        base64.b64decode(request.image, validate=True)
    except ValueError as error:
        raise HTTPException(status_code=422, detail='That photo could not be read. Please take a new JPG or PNG photo.') from error
    prompt = f"""You are Nuru, an expert agricultural soil advisor. Analyze this soil photo and provide a concise visual assessment. Do not write lengthy disclaimers; jump straight into the insights.

Location: {request.location}
Weather Context: {request.weatherContext or 'not provided'}

Format the output concisely using exactly these markdown bullet points:
* **Soil Texture**: Observation on the sand, clay, and loam balance.
* **Moisture & Organic Matter**: Darkness, moisture, drainage, and organic matter indicators.
* **Recommended Action**: One practical step for planting preparation.

Only describe what can be visually supported by the image. Do not claim exact pH, nutrient levels, salinity, contamination, or a definitive diagnosis."""
    answer = await gemini_answer(
        [{'role': 'user', 'parts': [{'text': prompt}, {'inlineData': {'mimeType': request.mimeType, 'data': request.image}}]}],
        temperature=0.4,
        max_output_tokens=1000,
    )
    return {'answer': answer}


@app.post('/api/farm-chat')
async def farm_chat(request: ChatRequest) -> dict:
    context = f'Field context supplied by the farmer: {request.fieldContext or "No field context has been supplied."}'
    contents = []
    for message in request.history[:-1]:
        contents.append({'role': 'model' if message.role == 'assistant' else 'user', 'parts': [{'text': message.text}]})
    contents.append({'role': 'user', 'parts': [{'text': f'{context}\n\nFarmer question: {request.message}'}]})
    return {'answer': await gemini_answer(contents)}


# --- DATASET & USER ENDPOINTS (SUPABASE) ---

@app.get("/api/crops")
def get_crop_recommendations():
    """Fetch reference crops for recommendations"""
    supabase = get_supabase()
    response = supabase.table("crop_reference").select("*").execute()
    return {"status": "success", "crops": response.data}


@app.get("/api/market-snapshot")
def get_market_snapshot():
    """Fetch market reference price benchmarks"""
    supabase = get_supabase()
    response = supabase.table("market_reference").select("*").execute()
    return {"status": "success", "market": response.data}


@app.get('/api/plants')
def get_user_plants(user=Depends(get_current_user)):
    """Fetch the authenticated user's tracked plants."""
    supabase = get_supabase()
    response = supabase.table("plants").select("*").eq("user_id", user.id).execute()
    return response.data


@app.post('/api/plants')
def create_user_plant(plant_data: dict, user=Depends(get_current_user)):
    """Add a plant owned by the authenticated user."""
    supabase = get_supabase()
    new_plant = {
        "user_id": user.id,
        "name": plant_data.get("name"),
        "crop_type": plant_data.get("crop_type"),
    }
    response = supabase.table("plants").insert(new_plant).execute()
    return response.data