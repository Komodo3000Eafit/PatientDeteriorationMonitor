# Data Model: Frontend Served by the Backend (TS-11)

This story adds **no persistent data** and **no database schema change**. It serves static files
and routes requests. The "entities" are runtime/config artifacts, listed here for traceability.

## Runtime artifacts

| Artifact | What it is | Key attributes | Source / lifecycle |
|----------|-----------|----------------|--------------------|
| Static build directory | `backend/app/static/` holding `index.html` + hashed assets | existence (may be absent locally); `index.html`; `assets/*` | Produced by `npm run build` → copied in deploy; git-ignored |
| SPA fallback route | Backend catch-all GET returning `index.html` | matches any non-API, non-file GET path | Declared in `app/main.py` after API routers |
| Static files mount | Starlette `StaticFiles` for the assets directory | directory path; mounted only if the directory exists | Mounted at import time when build present |
| API prefix | `/api` mount point for all API routers except `/health` | auth router included with `prefix="/api"`; `/api/auth/login`, `/api/me`, future `/api/...` | Set in `app/main.py`; `/health` stays top-level |
| Production API base | Same-origin relative base used by the deployed frontend | `''` when `VITE_API_BASE_URL` is set (even empty); `http://localhost:8000` when undefined; API paths use `/api/...` | Resolved in `frontend/src/api/client.js`; set via `.env.production` |

## Routing precedence (behaviour, not persisted state)

Requests resolve in this order:

1. **API routers** — `/health` plus everything under `/api` (`/api/auth/login`, `/api/me`, and
   future `/api/...` routes). An unknown path under `/api` returns the API's JSON 404.
2. **Static assets mount** — existing files under the assets directory, served with their content
   type; a missing asset returns a real 404.
3. **SPA fallback** — any other **GET** returns `index.html` (HTTP 200, `text/html`).
4. **Non-GET to a non-API path** — not served the shell (no fallback match); default 404/405.

When the build directory is absent (local dev), steps 2–3 are inactive; the API (step 1) still
works and `/` returns a minimal 404/placeholder instead of crashing.

No validation rules, no state transitions, no relationships to persist.
