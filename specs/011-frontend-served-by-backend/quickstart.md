# Quickstart / Validation: Frontend Served by the Backend (TS-11)

Runnable checks that prove TS-11 works, end to end. Details live in the contracts; this is the
how-to-verify guide.

## Prerequisites

- Python 3.13 with `backend/requirements.txt` installed; Node 26 for the frontend build.
- Local backend reachable at `http://localhost:8000` for the local-dev check.

## A. Local: build the frontend and have the backend serve it

```powershell
# 1. Build the React app into the directory FastAPI serves
cd frontend
npm ci
$env:VITE_API_BASE_URL = ""      # same-origin relative base, as in production
npm run build
# 2. Place the build where the backend serves it (mirrors the deploy step)
Remove-Item -Recurse -Force ..\backend\app\static -ErrorAction SilentlyContinue
Copy-Item -Recurse ..\frontend\dist ..\backend\app\static
# 3. Run the backend
cd ..\backend
gunicorn app.main:app -k uvicorn.workers.UvicornWorker --bind 127.0.0.1:8000
```

Then verify (expected results from `contracts/static-serving.md` §2):

```powershell
curl -i http://127.0.0.1:8000/               # 200 text/html, the app shell
curl -i http://127.0.0.1:8000/patients/PAT-001   # 200 text/html (SPA fallback)
curl -i http://127.0.0.1:8000/health         # 200 JSON {status, version, database}
curl -i http://127.0.0.1:8000/api/nope       # API JSON 404 (NOT the shell)
curl -i -X POST http://127.0.0.1:8000/api/auth/login  # API route under /api (422/401, JSON — not the shell)
```

Open `http://127.0.0.1:8000/` in a browser; the console shows **0** CSP violations (AC8/SC-006).

## B. Local dev without a build present (API still works)

```powershell
Remove-Item -Recurse -Force backend\app\static -ErrorAction SilentlyContinue
cd backend
uvicorn app.main:app --port 8000
curl -i http://127.0.0.1:8000/health         # 200 JSON — backend starts fine with no build (FR-010)
```

The Vite dev server keeps serving the UI in this mode:

```powershell
cd frontend
npm run dev                                   # http://localhost:5173, calls API at :8000 via CORS
```

## C. Automated tests

```powershell
# Backend: serving + fallback + API priority + no-build-present
cd backend
python -m pytest tests/test_static_serving.py -v

# Frontend: production API base relative, local default unchanged
cd ..\frontend
npm test
```

Expected: backend serving tests pass; the full backend suite still passes; the frontend
`client.test.js` confirms `API_BASE_URL === 'http://localhost:8000'` with no env var and `=== ''`
when `VITE_API_BASE_URL` is set empty.

## D. Deployed URL (after merge to `main`, CI green, deploy runs)

```powershell
$app = "https://pmd-backend-dndva3fceca5fvdy.brazilsouth-01.azurewebsites.net"
curl -i "$app/"                               # 200 text/html (shell)
curl -i "$app/patients/PAT-001"               # 200 text/html (shell, not 404)
curl -i "$app/health"                         # 200 JSON {status, version, database:"ok"}
```

One retry allowed on `/health` for Neon waking from scale-to-zero (as in TS-10). Maps to
SC-001–SC-003, SC-005.
