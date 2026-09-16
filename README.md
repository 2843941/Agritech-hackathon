# Nuru Field

Nuru Field is a hackathon-ready web prototype for smallholder and first-time farmers. It provides a user-controlled location field profile with live weather and a seasonal weather signal, photo-based soil observations via Gemini, and a plain-language AI farming adviser.

## Run it locally

Open two terminals from the project folder.

**Terminal 1 — API**

```powershell
cd backend
Copy-Item .env.example .env
# Put your Gemini key in backend/.env (do not paste it into frontend files , if you need the key check it on .env back end DUDU BOYS HEHE)
.\venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8000
```

If the included virtual environment does not work on your computer, create a new one and install the requirements:

```powershell
py -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Terminal 2 — website**

```powershell
cd frontend
npm install
npm run dev
```

Open the local address Vite prints, normally `http://localhost:5173`.

## Product note

The field profile uses Open-Meteo forecast and modelled historical weather. Its seasonal card is deliberately **not** a verified flood or drought event record. Before a production launch, connect a validated South African agricultural and disaster-history source, add user accounts/rate limiting to the API, and get agronomy review for recommendations.
