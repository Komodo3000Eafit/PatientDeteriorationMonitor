# Implementation Plan: Frontend Served by the Backend

**Branch**: `011-frontend-served-by-backend` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-frontend-served-by-backend/spec.md`

## Summary

Make the FastAPI backend serve the React production build so the whole product lives at one Azure
App Service and one public URL. All API routes move under an `/api` prefix (except `/health`), so
API paths are cleanly separated from browser pages: the auth router is mounted with `prefix="/api"`
(`/api/auth/login`, `/api/me`), and `/health` stays at `/health`. The build is written into
`backend/app/static/` (git-ignored) by the deploy workflow and served by FastAPI: API routes
(`/health`, `/api/...`) keep priority, real static files are served with their content type, and
any other safe GET falls back to `index.html` so client routes (TS-13: `/login`, `/patients`, …)
resolve on a fresh load or refresh. An unknown `/api/...` path returns a JSON 404, never the shell.
The production frontend calls the API with same-origin relative `/api/...` URLs, so CORS is needed
only for local development. The
existing TS-10 `deploy.yml` gains a frontend build step that feeds the single
`azure/webapps-deploy@v3` package; OIDC auth, the forward-only migration and the `main`/CI gating
are unchanged. A post-deploy end-to-end check confirms the shell, a deep client route, `/health`
and asset loading under the existing CSP.

## Technical Context

**Language/Version**: Python 3.13 (backend), Node 26 (frontend build, matching CI), React 19 + Vite 8.

**Primary Dependencies**: FastAPI 0.162, Starlette static files (`StaticFiles`, ships with FastAPI — no new dependency); Vite build; GitHub Actions (`actions/setup-node@v7`, `azure/webapps-deploy@v3`). gunicorn + uvicorn worker (unchanged from TS-10).

**Storage**: N/A for this story (serving static files; no schema change). Neon Postgres unchanged.

**Testing**: pytest with FastAPI `TestClient` (backend serving + fallback + API priority); Vitest (production API base is relative, local default unchanged).

**Target Platform**: Azure App Service (Linux, Python 3.13, Free F1, Brazil South, `rg-patient-monitor`) — the existing TS-10 host.

**Project Type**: Web application (`backend/` + `frontend/`), now served from one origin.

**Performance Goals**: No specific throughput target; serving static files on Free F1 is fine. First request after scale-to-zero may be slow (tolerated by the e2e check, as in TS-10).

**Constraints**: One App Service, one public URL, no new paid service (Principle IX, XII). Keep TS-10's security headers/CSP; keep local dev working unchanged. The deploy packages the `backend` directory only, so the build must land inside it.

**Scale/Scope**: Small academic prototype; a handful of built assets and one `index.html`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] I. Spec-driven and traceable: every task traces to an AC of TS-11; tests reference the AC they verify.
- [x] II. Small Scrum story: one technical story, serving the existing build + one deploy step; small enough to build in a short session.
- [x] III. Independence: depends only on TS-05 and TS-10 (per BACKLOG). Touches shared files (`main.py`, `deploy.yml`, `client.js`) as foundation setup, which is the role of a technical story; no functional story's code is modified.
- [x] IV. Multi-agent: tasks owned by backend-dev (serving + fallback), frontend-dev (relative API base), devops (deploy build step + e2e check), qa-tester (tests), security-reviewer (CSP/serving review); logged in `agent-log.csv`.
- [x] V. Clinical logic: no scoring/triage logic touched; N/A.
- [x] VI. Data privacy: no data; no secrets added. The static directory is git-ignored.
- [x] VII. Tests: serving behaviour and the API/fallback boundary are API critical paths (Principle VII/VIII), covered by automated tests that run in CI.
- [x] VIII. Security baseline: API input validation unchanged; TS-10 security headers/CSP preserved and verified to still allow the app; CORS kept only for local dev; no secrets in code.
- [x] IX. Deployable at low cost: one Azure App Service serves both (exactly the D-39 model); no new service; stays on Free F1.
- [x] X. Stack: Python/FastAPI + React + PostgreSQL unchanged.
- [x] XI. Language: code/docs in English; no UI text added (serves the existing ES/EN app). No new glossary term needed (reuses App Service, build, same origin).
- [x] XII. Simplicity: Starlette `StaticFiles` + one catch-all fallback; no SSR, no CDN, no new dependency.

No violations; Complexity Tracking not needed.

## Project Structure

### Documentation (this feature)

```text
specs/011-frontend-served-by-backend/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (minimal: no persistent entities)
├── quickstart.md        # Phase 1 output (validation guide)
├── contracts/           # Phase 1 output (serving + deploy contracts)
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── main.py              # EDIT: mount auth router with prefix="/api"; mount static + SPA fallback after API routers
│   ├── static_serving.py    # NEW: build-dir resolution + SPA fallback handler (keeps main.py small)
│   └── static/              # NEW (git-ignored): build output lands here at deploy/local build time
└── tests/
    ├── test_static_serving.py   # NEW: root shell, fallback, API priority (/api), non-GET, no-build-present
    ├── test_auth.py             # EDIT: /auth/login → /api/auth/login, /me → /api/me
    ├── test_cors.py             # EDIT: /api paths
    ├── test_login_rate_limit.py # EDIT: /api/auth/login
    ├── test_security_headers.py # EDIT: /api paths
    └── test_seed_demo_users.py  # EDIT: /api path if referenced

frontend/
└── src/
    └── api/
        ├── client.js        # EDIT: production base = relative/empty; local default unchanged
        └── client.test.js   # EDIT/ADD: relative base in prod, http://localhost:8000 default locally

.github/workflows/deploy.yml  # EDIT: add Node build step writing into backend/app/static before deploy
.gitignore                    # EDIT: ignore backend/app/static/
```

**Structure Decision**: Web application (Option 2). The backend gains a small `static_serving.py`
helper and a git-ignored `static/` directory; `main.py` mounts the auth router with `prefix="/api"`
and mounts static serving after the API routers so API routes keep priority. The frontend changes
its API base resolution and its API paths (`/api/...`). The deploy workflow gains a build step. The
existing backend tests are updated to the `/api` paths. No new top-level directories.

## Complexity Tracking

> No Constitution Check violations; this section is intentionally empty.
