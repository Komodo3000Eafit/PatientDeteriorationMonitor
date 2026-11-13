# Quickstart: React App Skeleton (TS-04)

Validation guide for the story. All commands are Windows PowerShell. Contracts: [contracts/health-ui.md](contracts/health-ui.md) and [contracts/cors-config.md](contracts/cors-config.md). Settings: [data-model.md](data-model.md).

Prerequisites: Node.js 26 LTS (`node -v`), the backend set up as in `backend/README.md` (virtual environment, `backend/.env` with `DATABASE_URL`).

## 1. Install the frontend — AC1

```powershell
cd frontend
npm install
```

Expected: no errors; `node_modules/` created (git-ignored).

## 2. Automated tests and build (no backend, no network) — AC1, AC8, AC9, SC-003

```powershell
# still in frontend/
npm test
npm run build
cd ..\backend
.\.venv\Scripts\Activate.ps1
python -m pytest
```

Expected: `npm test` runs once and all tests pass in under 30 s, including ok, database unavailable, unreachable and timeout; `npm run build` writes `frontend/dist/` (git-ignored) with no errors; `pytest` passes, including `tests/test_cors.py`, with no `backend/.env` needed. Running `npm test` and `npm run build` on a team laptop also shows that Smart App Control allows the Vite/Vitest binaries (research R2).

## 3. Manual browser check, backend on — AC11, AC2, AC6

Terminal 1 (backend, default settings: make sure `CORS_ORIGINS` is not set in this terminal or in `backend/.env`):

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
Remove-Item Env:CORS_ORIGINS -ErrorAction SilentlyContinue
python -m uvicorn app.main:app --reload --port 8000
```

Terminal 2 (frontend, no `frontend/.env` needed):

```powershell
cd frontend
npm run dev
```

Open **<http://localhost:5173>** (use `localhost`, not `127.0.0.1`: that is a different origin and is not allowed by default). Open the browser developer tools (F12) → **Console**.

Expected: `Comprobando la conexión con el servidor…` briefly, then `API: funcionando`, `Versión: 0.1.0` and `Base de datos: disponible` (or `no disponible` if Neon can't be reached). **No CORS error** in the console. In the **Network** tab, exactly one request to `/health`.

## 4. Manual browser check, backend off — AC11, AC4, SC-002

In terminal 1 press **Ctrl+C** to stop the backend, then reload the page.

Expected: within 10 seconds the page shows `No se puede conectar con el servidor.` and `Recarga la página para volver a comprobar.`; it never stays on `Comprobando…`.

Record steps 3 and 4 in the PR (one line each: what was shown, no CORS error), plus the `npm test` and `pytest` output (D-27).

## 5. CORS rule from the command line (optional) — AC6

With the backend running again (step 3, terminal 1):

```powershell
(Invoke-WebRequest http://127.0.0.1:8000/health -Headers @{ Origin = "http://localhost:5173" } -UseBasicParsing).Headers["access-control-allow-origin"]
(Invoke-WebRequest http://127.0.0.1:8000/health -Headers @{ Origin = "http://evil.example" } -UseBasicParsing).Headers["access-control-allow-origin"]
```

Expected: the first prints `http://localhost:5173`; the second prints nothing.

## 6. `*` stops startup (optional) — AC7, FR-006

Stop the backend (Ctrl+C), then in terminal 1:

```powershell
$env:CORS_ORIGINS = "*"
python -m uvicorn app.main:app --port 8000
Remove-Item Env:CORS_ORIGINS
```

Expected: uvicorn exits with `ValueError: CORS_ORIGINS must not contain '*'; list the allowed origins explicitly`.

**PowerShell note**: in Windows PowerShell 5.1, `$env:CORS_ORIGINS = ""` **deletes** the variable instead of setting it to empty. To try the "blank value" case, use `$env:CORS_ORIGINS = " "` (one space); both cases give the default origin. Remove the variable afterwards with `Remove-Item Env:CORS_ORIGINS`.
