# TS-11 — Frontend served by the backend

**Story:** TS-11 (technical) · **Branch:** `011-frontend-served-by-backend` → `main`
**Spec folder:** [`specs/011-frontend-served-by-backend/`](./) (spec, plan, research, data-model, contracts, tasks, checklists, agent-log.csv)
**Depends on:** TS-05 (language/disclaimer), TS-10 (backend deployment). **Decisions:** D-39, D-44.

## What this does

FastAPI now serves the React production build, so the whole product lives on **one Azure App Service at one public URL**. The frontend and the API share one origin, so CORS is needed only for local development (D-39).

Routing model (D-44):

- **All API routes live under `/api`, except `/health`.** The auth router is mounted with `prefix="/api"` (its decorators are unchanged), so login and current-user are now `/api/auth/login` and `/api/me`; `/health` stays at `/health` (the TS-10 deploy docs and checks use it). Every future API route goes under `/api` (e.g. `/api/patients`).
- **Browser pages stay at the root** (`/login`, `/patients`, `/patients/:identifier` — added in TS-13).
- **Serving precedence:** API routes (`/health`, `/api/...`) first → existing static file → otherwise a **GET-only** catch-all returns `index.html` (SPA fallback for client-route refresh). An unknown `/api/...` path returns the API's **JSON 404**, never the shell. A non-GET to a non-API path is not served the shell. If the build directory is absent (local dev), static serving is skipped and the API still runs.
- **Frontend** calls the API through `/api/...` paths in `frontend/src/api/client.js`: same-origin relative in production, `http://localhost:8000` in local dev.
- The build is written into git-ignored `backend/app/static/` by the deploy workflow and shipped inside the single `backend` deploy package; **no second host, no new dependency, CSP unchanged**.

## How it was built (multi-agent)

The orchestrator ran `/speckit-implement`, delegating each task to a specialist subagent and verifying results against the acceptance criteria. Full trail: [`agent-log.csv`](./agent-log.csv).

| Task | Owner agent | Summary |
|---|---|---|
| T001 | devops | git-ignore `backend/app/static/` |
| T002 | backend-dev | `backend/app/static_serving.py` (build-dir resolution, assets mount, SPA handler; no new dependency) |
| T002a | backend-dev | mount auth router `prefix="/api"` in `main.py`; update `test_auth`, `test_cors`, `test_login_rate_limit`, `test_security_headers` to `/api` paths |
| T003 | backend-dev | wire static serving + GET-only SPA catch-all after API routers; `/api`+`/health` exclusion model |
| T004 | frontend-dev | `client.js` base-URL rule + `/api/auth/login`, `/api/me` paths; update `client.test.js`, `fakeBackend.js`, `auth.test.jsx` |
| T005 | frontend-dev / orchestrator | `frontend/.env.production` (empty base) + `.env.example` note |
| T006 | devops | `deploy.yml`: Node 26 build (`VITE_API_BASE_URL` empty), stage `frontend/dist` into `backend/app/static` |
| T007 | devops | post-deploy e2e check step (gates the job; one retry for Neon cold start) |
| T008 | qa-tester | `backend/tests/test_static_serving.py` (serving + `/api` boundary); frontend base-rule assertions |
| T009 | backend-dev | CSP review: unchanged, external same-origin assets load under `default-src 'self'` |
| T010 | security-reviewer | read-only review (reported below) |
| T011 | devops | `DEVELOPMENT.md` §7.3; mark TS-11 done in `PROJECT_STATUS.md` and `BACKLOG.md` |
| T012 | devops | quickstart validation + agent log |

> Rework note: the branch carried an earlier partial implementation on the **old routing model** (API at the root, fallback enumerating path prefixes), and T002a had never been done. This PR reworks T003/T004/T008 and re-ran the security review to bring the code to the analyzed `/api` model (FR-004a, AC9, research R9).

## Acceptance criteria coverage

| AC | Covered by |
|---|---|
| AC1 — root returns HTML shell | `test_static_serving.py::test_root_returns_shell` |
| AC2 — deep client route returns shell | `test_client_route_returns_shell` |
| AC3 — built asset served with JS content type | `test_existing_asset_served_with_js_type` |
| AC4 — `/health` JSON; unknown `/api/...` → JSON 404 | `test_health_is_json_not_shell_when_build_present`, `test_unknown_api_path_returns_json_404_not_shell` |
| AC5 / AC6 — prod relative base; local default unchanged | `client.test.js` base-URL block; `frontend/.env.production` (empty base) |
| AC7 — one deploy ships both | `deploy.yml` Node build + stage into `backend/app/static`; single `webapps-deploy`, `package: backend` |
| AC8 — CSP allows the app, protections kept | `security_headers.py` unchanged + `test_shell_carries_csp_header`; security review |
| AC9 — API under `/api`, `/health` at root, old paths not API | auth router `prefix="/api"`; updated auth/cors/rate-limit/header tests; `test_old_unprefixed_paths_return_shell_not_api` |
| AC10 — docs/status | `DEVELOPMENT.md` §7.3, D-44, PROJECT_STATUS + BACKLOG mark TS-11 done |

## Tests / CI

- **Backend: 341 passed, 0 failed** (`python -m pytest`), verified locally. `test_static_serving.py`: 12/12. The temp `backend/app/static/` build dir is created and cleaned by the test fixture.
- **Frontend: run in CI (Node 26).** Node/npm were not available in the implementation environment, so the Vitest suite and `npm run build` were **not run locally**; the `/api`-path edits were verified by inspection and kept consistent across `client.js`, `client.test.js`, `fakeBackend.js`, `auth.test.jsx`. **Please confirm the green CI frontend job before merging.**
- **Dependency check:** no backend dependency added (`backend/requirements.txt` unchanged); no frontend dependency added. `ci.yml` is untouched (D-38).
- The post-deploy e2e check in `deploy.yml` exercises AC1/AC2/AC4 against the live URL after merge to `main`.

## Security review (T010)

Read-only review against the `/api` routing model — **7/7 PASS**: API routes keep priority, GET-only fallback, no path traversal in the assets mount or `FileResponse`, TS-10 CSP intact (`frame-ancestors 'none'`, `base-uri 'self'`, `object-src 'none'`, no `unsafe-inline`), no secret or build artifact committed (`backend/app/static/` git-ignored), CORS only for local dev, OIDC / forward-only migration / `main`-gating unchanged.

- **Resolved:** the earlier `continue-on-error: true` on the e2e step was removed (T007 rework), so a failed verification now fails the deploy job.
- **Info-only (non-security):** `deploy.yml` hardcodes the App Service hostname — a maintainability note, no secret involved.

## Files changed

**New:** `backend/app/static_serving.py`, `backend/tests/test_static_serving.py`, `frontend/.env.production`, `specs/011-frontend-served-by-backend/*`.

**Modified:** `.github/workflows/deploy.yml`, `.gitignore`, `DEVELOPMENT.md`, `backend/app/main.py`, `backend/app/security_headers.py`, `backend/tests/{test_auth,test_cors,test_login_rate_limit,test_security_headers}.py`, `docs/{BACKLOG,DECISIONS,PROJECT_STATUS}.md`, `frontend/.env.example`, `frontend/src/api/{client.js,client.test.js}`, `frontend/src/auth/auth.test.jsx`, `frontend/src/testing/fakeBackend.js`.

## Reviewer checklist

- [ ] CI green (backend tests, **frontend tests + build**, dependency check)
- [ ] `backend/app/static/` is git-ignored and no build artifact is committed
- [ ] After merge: post-deploy e2e check passes and the deployed URL serves the app (`GET /`, a deep route, `/health`)
