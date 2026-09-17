# Nuru Field

A hackathon-built farming assistant for smallholder and first-time farmers in South Africa. Nuru combines live weather, historical seasonal data, soil and pest photo analysis, and AI-guided crop recommendations into one plain-language web app — so a farmer can make a confident planting decision without an agronomist on call.

---

## The problem we're solving

Smallholder and first-time farmers in South Africa often lack access to localized weather history and climate risk data. They don't know which crops suit their specific soil and climate, and have no easy way to check whether their area has a history of floods or droughts — leading to poor planting decisions, crop loss, and wasted resources.

## How Nuru solves it

An app that combines live weather forecasting with a historical database of local climate patterns, tied to specific locations. Farmers pick their field on a map, and Nuru recommends suitable crops based on that area's climate history, current season, and the farmer's own observations (soil photos, plant health). Everything is served in plain language, with clear caveats about when to consult a professional.

## Why it matters

Smallholder farmers are especially vulnerable to unpredictable weather and often farm without formal agricultural training. Better crop-planting decisions mean higher yields, less crop loss, improved food security, and stronger livelihoods for farming communities.

---

## How the app works

### The flow, end to end

1. **Land on the hero page.** Explains the product. No login required to look around.
2. **Pick your field.** Either tap "Use my location" (browser geolocation) or drop a pin on the map.
3. **Nuru fetches a field profile** — live weather, recent soil moisture, and a 10-year same-month seasonal signal from Open-Meteo.
4. **Crop recommendations appear** — 3–5 crops that suit your province and the current month, pulled from our curated dataset of South African crops.
5. **Scan your soil or your plants.** Take a photo, and Gemini returns a plain-language visual observation with practical next steps. These are framed as field guides, not lab results.
6. **Talk to Nuru.** A chat adviser that knows your field context (location, weather, season) and can answer follow-up questions.
7. **Track your plants** (in progress). Add what you've planted, see a growth timeline, log waterings.

### Architecture

```
┌─────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│  Open-Meteo     │      │  Supabase        │      │  Google Gemini   │
│  (live + 10y    │      │  (plants,        │      │  (photo analysis │
│   historical)   │      │   crops, users)  │      │   + chat)        │
└────────┬────────┘      └────────┬─────────┘      └────────┬─────────┘
         │                        │                          │
         └────────────┬───────────┴──────────────────────────┘
                      │
              ┌───────▼────────┐
              │  FastAPI       │  ← backend/main.py
              │  (Python)      │    backend/recommender.py
              └───────┬────────┘    backend/db.py
                      │
              ┌───────▼────────┐
              │  React PWA     │  ← frontend/src/App.jsx
              │  (Vite)        │    frontend/src/components/*
              └────────────────┘
```

### Data sources

| Source | What it provides | Where it's used |
|---|---|---|
| [Open-Meteo](https://open-meteo.com) | Live weather + 10-year historical archive | `/api/field-profile` |
| [Supabase](https://supabase.com) | Postgres for plants, watering logs, crop reference | `backend/db.py`, `backend/models.py` |
| [Google Gemini](https://ai.google.dev) | Photo analysis (soil, pests) + chat adviser | `/api/soil-analysis`, `/api/pest-analysis`, `/api/farm-chat` |
| Curated SA crop dataset | Province × season → recommended crops | `backend/data/crops.json` |

### API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness + AI-config check |
| POST | `/api/field-profile` | Weather + 10y seasonal signal for a lat/lon |
| POST | `/api/soil-analysis` | Photo → soil observation (Gemini) |
| POST | `/api/farm-chat` | Chat with Nuru (Gemini) |
| POST | `/api/pest-analysis` | Photo → pest/disease observation (Gemini) |
| GET | `/api/crops?province=&month=` | Crop recommendations |
| POST | `/api/plants` | Save a plant |
| GET | `/api/plants` | List all saved plants |
| POST | `/api/plants/{id}/watered` | Log a watering |

---

## Repository rules — read before you commit

We are three people shipping together. These rules exist so nothing breaks when we merge.

### 1. Only append — never edit existing lines

The two highest-risk files are `frontend/src/App.jsx` and `frontend/src/App.css`. Multiple people need to add to them. The rule:

- **Add** new imports at the top of `App.jsx`. Don't reorder existing ones.
- **Add** new JSX inside `App.jsx` in a new section, not by editing existing sections.
- **Append** new CSS rules at the bottom of `App.css`. Don't touch existing selectors.

If you break this rule, you get merge conflicts. If you follow it, three people can merge in sequence without a single conflict.

### 2. Stay in your lane

Each track owns specific files. **If you find a bug outside your lane, tell the owner — do not fix it yourself.** The cost of a cross-lane edit is a merge conflict at merge time.

### 3. Branch, then push. Never commit directly to `main`.

```powershell
& "C:\Program Files\Git\bin\git.exe" checkout main
& "C:\Program Files\Git\bin\git.exe" pull
& "C:\Program Files\Git\bin\git.exe" checkout -b <your-branch-name>
```

Branch naming: `<yourname>/<what>` — e.g. `banele/db-backend`, `thabo/map-crops`.

### 4. Commit early, commit often

Small commits with clear messages. `git add .` then `git commit -m "what you did"`. Don't sit on uncommitted work for hours — you lose it if something breaks.

### 5. Push your branch when you're done, or when you hit a blocker

```powershell
& "C:\Program Files\Git\bin\git.exe" push -u origin <your-branch-name>
```

Then tell the merger (Banele) to merge it into `main`. Merges happen one at a time, in a fixed order.

### 6. Never commit secrets

`.env` is gitignored. **Never** paste API keys into any file that gets committed. If you need a key for your local testing, put it in `backend/.env` (which stays local). Ask Banele for the Gemini key on a private channel — not in the repo, not in the group chat history.

### 7. Nothing gets merged without a local smoke test

Before you push: `npm run dev` and `uvicorn main:app --reload` both need to start clean. If either fails, fix it before pushing. A broken `main` blocks everyone.

### 8. `main` is sacred

`main` should always be in a runnable state. Every merge into `main` requires:
- The branch's own tests passing (backend starts, frontend builds)
- The merge applying cleanly (fast-forward or trivial merge)
- A quick `npm run dev` + backend restart after the merge

If `main` breaks, the person who broke it fixes it immediately. No exceptions.

---

## The three tracks

Each track is independent. Track owners do not touch each other's files.

### Track A — Database + Backend (owner: **Banele**)

- **Branch:** `banele/db-backend`
- **Files:** `backend/db.py`, `backend/models.py`, `backend/recommender.py`, `backend/schema.sql`, `backend/data/crops.json`, `backend/.env.example`, and **appends to** `backend/main.py`
- **Delivers:** Supabase schema, `/api/crops`, `/api/plants` CRUD, crop reference seed data
- **Blocks:** Track B needs `/api/crops` — until then, Track B stubs the response

### Track B — Frontend: Map + Crop UI (owner: **TBD**)

- **Branch:** `<name>/map-crops`
- **Files:** `frontend/src/components/FieldMap.jsx`, `frontend/src/components/CropRecommendations.jsx`, and **appends to** `App.jsx` + `App.css`
- **Delivers:** Interactive Leaflet map, click-to-pick-a-field, crop recommendation cards
- **Does not touch:** any backend file, `SoilScanner`, `AdviserChat`, `Hero`, `Footer`, `Icon`, `FieldDashboard`

### Track C — Pest Scanner + Deploy + Pitch (owner: **TBD**)

- **Branch:** `<name>/pest-deploy`
- **Files:** `frontend/src/components/PestScanner.jsx`, `render.yaml`, `vercel.json`, `README.md`, and **appends to** `backend/main.py` (`/api/pest-analysis` only), `App.jsx` + `App.css`
- **Delivers:** Pest photo analysis, live deploy URLs on Render + Vercel, pitch script
- **Does not touch:** Track A's endpoints, Track B's map/crop components

---

## Running locally

### Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
# Put your GEMINI_API_KEY into .env, then:
uvicorn main:app --reload
```

API runs at `http://localhost:8000`. Health check: `http://localhost:8000/api/health`.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`. It reads `VITE_API_BASE_URL` from `frontend/.env` if present, otherwise defaults to `http://localhost:8000`.

### Required environment variables

**`backend/.env`:**

```
GEMINI_API_KEY=<ask Banele on a private channel>
GEMINI_MODEL=gemini-2.5-flash
CORS_ORIGINS=http://localhost:5173
SUPABASE_URL=<from Supabase dashboard>
SUPABASE_KEY=<anon key from Supabase dashboard>
```

**`frontend/.env` (optional, for pointing at a deployed backend):**

```
VITE_API_BASE_URL=http://localhost:8000
```

---

## Deploy targets

| Service | Hosts | URL |
|---|---|---|
| Backend | Render (free tier) | `<fill in after deploy>` |
| Frontend | Vercel (free tier) | `<fill in after deploy>` |

Deployment is Track C's responsibility. The backend must be live before the frontend is, so `VITE_API_BASE_URL` has something to point at.

---

## Who to ask for what

| Question | Ask |
|---|---|
| Supabase keys, DB schema, backend endpoints | Banele (Track A) |
| Map, crops UI, `App.jsx` composition | Track B owner |
| Deploy URLs, Gemini key, pitch script | Track C owner |
| "Should I edit this file?" | Whoever owns the file — ask, don't guess |

---

## License & disclaimers

This is a hackathon project built for the Wits Developer Society Creative Chaos 2026.

Nuru's guidance is informational only. Crop, chemical, and irrigation decisions should always be verified with a local agricultural professional. Nuru never invents local records, disease diagnoses, or chemical application rates.