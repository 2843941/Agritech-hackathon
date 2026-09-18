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


# --- Province lookup --------------------------------------------------------
# Approximate bounding boxes for South Africa's 9 provinces. Order matters —
# we check in order and return the first match, so overlap regions resolve
# to whichever province is checked first. Good enough for crop filtering;
# not accurate enough for legal boundaries.
#
# Boxes are (min_lat, max_lat, min_lon, max_lon).
_PROVINCE_BOXES = [
    ('Western Cape',   -35.0, -30.0, 17.5, 24.5),
    ('Northern Cape',  -31.5, -25.5, 17.5, 25.5),
    ('Eastern Cape',   -34.5, -30.0, 24.5, 30.0),
    ('KwaZulu-Natal',  -31.5, -26.5, 28.5, 33.5),
    ('Free State',     -30.8, -26.5, 24.5, 28.5),
    ('North West',     -27.5, -24.5, 22.5, 27.5),
    ('Gauteng',        -26.9, -25.3, 27.3, 29.0),
    ('Mpumalanga',     -27.0, -24.5, 28.5, 32.0),
    ('Limpopo',        -25.5, -22.0, 26.0, 32.0),
]


def province_from_coords(lat: float, lon: float) -> str | None:
    """Return the SA province containing (lat, lon), or None if outside SA.

    Uses bounding boxes, not exact boundaries. Order in _PROVINCE_BOXES
    determines which wins for overlapping regions.
    """
    for name, min_lat, max_lat, min_lon, max_lon in _PROVINCE_BOXES:
        if min_lat <= lat <= max_lat and min_lon <= lon <= max_lon:
            return name
    return None


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


class FieldProfileSaveRequest(BaseModel):
    label: str
    latitude: float
    longitude: float
    summary: str = ""
    notes: str = ""


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

    # Add province so the frontend can display it and /api/crops can use it.
    province = province_from_coords(latitude, longitude)

    summary = (
        f'Approximate field coordinates: {latitude:.3f}, {longitude:.3f}'
        + (f' ({province})' if province else '')
        + f'. Live conditions: {condition.lower()}, {temperature}°C, '
        f'wind {wind_kph} km/h. '
        f'{month_name} seasonal signal ({start_year}–{end_year}): '
        f'average temperature {history_temp}°C and average rainfall {history_rain} mm.'
    )

    return {
        'location': {
            'label': location_info.get('name') or f'Your field · {latitude:.3f}, {longitude:.3f}',
            'latitude': latitude,
            'longitude': longitude,
            'province': province,
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


@app.get("/api/soil-scans")
async def get_soil_scans(user=Depends(get_current_user)):
    supabase = get_supabase()
    response = supabase.table("soil_scans").select("*").eq("user_id", user.id).order("created_at", desc=True).execute()
    return response.data


@app.post('/api/soil-analysis')
async def soil_analysis(request: SoilRequest, user=Depends(get_current_user)) -> dict:
    try:
        raw_image = request.image or ''
        if ',' in raw_image:
            raw_image = raw_image.split(',', 1)[1]
        image_bytes = base64.b64decode(raw_image, validate=False)
    except (TypeError, ValueError) as error:
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
        [{'role': 'user', 'parts': [{'text': prompt}, {'inlineData': {'mimeType': request.mimeType, 'data': base64.b64encode(image_bytes).decode('ascii')}}]}],
        temperature=0.4,
        max_output_tokens=1000,
    )

    supabase = get_supabase()
    try:
        db_response = supabase.table("soil_scans").insert({
            "user_id": user.id,
            "location": request.location,
            "analysis_result": answer,
            "image_url": None,
        }).execute()
        print('Supabase Insert Response:', db_response)
    except Exception as exc:
        print('Error in analyze_soil:', str(exc))
        raise HTTPException(status_code=500, detail=f'Soil vision analysis succeeded, but the database save failed: {str(exc)}') from exc

    return {'answer': answer}


@app.post('/api/farm-chat')
async def farm_chat(request: ChatRequest) -> dict:
    context = f'Field context supplied by the farmer: {request.fieldContext or "No field context has been supplied."}'
    contents = []
    for message in request.history[:-1]:
        contents.append({'role': 'model' if message.role == 'assistant' else 'user', 'parts': [{'text': message.text}]})
    contents.append({'role': 'user', 'parts': [{'text': f'{context}\n\nFarmer question: {request.message}'}]})
    return {'answer': await gemini_answer(contents)}


@app.get("/api/saved-fields")
async def get_saved_fields(user=Depends(get_current_user)):
    supabase = get_supabase()
    response = supabase.table("field_profiles").select("*").eq("user_id", user.id).order("created_at", desc=True).execute()
    return response.data


@app.post("/api/save-field")
async def save_field_profile(data: FieldProfileSaveRequest, user=Depends(get_current_user)):
    supabase = get_supabase()

    payload_variants = [
        {
            "user_id": user.id,
            "field_name": data.label,
            "location_point": {
                "type": "Point",
                "coordinates": [data.longitude, data.latitude],
            },
            "summary": data.summary,
            "notes": data.notes,
        },
        {
            "user_id": user.id,
            "field_name": data.label,
            "latitude": data.latitude,
            "longitude": data.longitude,
            "summary": data.summary,
            "notes": data.notes,
        },
        {
            "user_id": user.id,
            "label": data.label,
            "latitude": data.latitude,
            "longitude": data.longitude,
            "summary": data.summary,
            "notes": data.notes,
        },
    ]

    last_error = None
    for payload in payload_variants:
        try:
            response = supabase.table("field_profiles").insert(payload).execute()
            return response.data
        except Exception as exc:
            last_error = exc

    raise HTTPException(
        status_code=400,
        detail=f"Could not save this field profile to the database. Expected columns do not match the current field_profiles table. Last error: {last_error}",
    )


# --- DATASET & USER ENDPOINTS (SUPABASE) ---

@app.get("/api/crops")
async def get_crop_recommendations(lat: float, lon: float):
    """Return crops suited to the given coordinates.

    Filtering pipeline:
      1. Look up the province from (lat, lon) using bounding boxes.
      2. Query crop_reference rows for that province only.
      3. Narrow further by live temperature and current season.

    This gives Cape Town a Western Cape list (wheat, grapes, olives),
    Johannesburg a Gauteng list (maize, sorghum, spinach), and so on.
    Falls back to a national list if the province can't be determined
    (point outside South Africa or in a gap between boxes).
    """
    supabase = get_supabase()

    province = province_from_coords(lat, lon)

    # 1. Query by province when we know it — otherwise, get everything.
    if province:
        response = supabase.table("crop_reference").select("*").eq("province", province).execute()
    else:
        response = supabase.table("crop_reference").select("*").execute()
    candidates = response.data or []

    # 2. Pull weather for the location — if it fails, return the province
    #    list unfiltered rather than nothing.
    try:
        weather = await fetch_weather(lat, lon)
        current_temp = weather["weather"]["temperature"]
    except Exception as error:
        print(f"[/api/crops] weather lookup failed, returning province crops: {error}", flush=True)
        return {"status": "success", "province": province, "crops": candidates, "filtered": False}

    # 3. Determine current Southern Hemisphere season from the month.
    month = date.today().month
    if month in (12, 1, 2):
        current_season = 'Summer'
    elif month in (3, 4, 5):
        current_season = 'Autumn'
    elif month in (6, 7, 8):
        current_season = 'Winter'
    else:
        current_season = 'Spring'

    def crop_matches(crop: dict) -> bool:
        try:
            temp_ok = crop["min_temp"] <= current_temp <= crop["max_temp"]
        except (KeyError, TypeError):
            temp_ok = False

        season = (crop.get("growing_season") or '').strip()
        if current_season == 'Spring':
            season_ok = season in ('All Season', 'Summer')
        elif current_season == 'Autumn':
            season_ok = season in ('All Season', 'Winter')
        else:
            season_ok = season in ('All Season', current_season)

        return temp_ok and season_ok

    # 4. Filter and dedupe by name (DB has historical duplicates).
    seen_names = set()
    matching = []
    for crop in candidates:
        if not crop_matches(crop):
            continue
        name = crop.get("name")
        if name in seen_names:
            continue
        seen_names.add(name)
        matching.append(crop)

    # 5. If filtering produced nothing, return the unfiltered province list.
    if not matching:
        return {"status": "success", "province": province, "crops": candidates, "filtered": False}

    return {"status": "success", "province": province, "crops": matching, "filtered": True}


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