# Research: Frontend Served by the Backend (TS-11)

Phase 0 of the plan. Each item records the decision, why, and the alternatives rejected. The spec
Clarifications already fixed the main choices; this file captures the technical grounding.

## R1 — How FastAPI serves the build and routes between API and SPA

- **Decision**: Register the API routers first (`/health` and the auth router mounted under `/api`,
  giving `/api/auth/login` and `/api/me`; see R9), then add a static layer that (a) serves real
  files out of `backend/app/static/` and (b) for any other **GET** that is not a real file, returns
  `index.html`. Implement the fallback as an explicit catch-all GET route (`/{full_path:path}`)
  added **after** all API routers, backed by a small helper in `app/static_serving.py`. Mount
  Starlette `StaticFiles` for the hashed assets directory (e.g. `/assets`) so those are served with
  correct content types and a real 404 for a missing asset.
- **Rationale**: Route order gives API routes priority without path-prefix guessing. A missing
  file under the assets mount returns a genuine 404 (AC/FR-005), while unknown top-level GETs fall
  back to the shell (FR-003). Non-GET methods never hit the fallback because the catch-all is
  declared for GET only (FR-006). An unknown path under `/api` (e.g. `/api/nope`) is matched by no
  router, so FastAPI returns the API's JSON 404, not the catch-all (FR-004); see R9 for why the
  `/api` prefix makes this automatic.
- **Alternatives rejected**:
  - `StaticFiles(html=True)` mounted at `/` — it serves `index.html` for a directory but returns
    404 (not the shell) for unknown deep paths, so client-route refresh (AC2) would fail; and
    mounting at `/` can shadow API routes depending on order. Rejected.
  - A custom middleware that rewrites paths — more moving parts than a single catch-all route;
    harder to keep API priority explicit. Rejected (Principle XII).
  - A separate web server / reverse proxy for static files — violates the one-App-Service model
    (D-39) and adds infrastructure. Rejected.

## R2 — No new dependency

- **Decision**: Use `starlette.staticfiles.StaticFiles` and `FileResponse`, both already available
  through FastAPI (`fastapi==0.162.4`, which depends on Starlette). Add nothing to
  `backend/requirements.txt`.
- **Rationale**: Principle XII (simplicity) and the CI dependency-audit gate (fewer deps, less
  audit surface). Static serving is a built-in capability.
- **Alternatives rejected**: `aiofiles`/`whitenoise`/a CDN package — unnecessary for a tiny build
  on Free F1. Rejected.

## R3 — Where the build lands and git-ignore

- **Decision**: Build into `backend/app/static/` (clarified). Add `backend/app/static/` to the
  root `.gitignore`. FastAPI resolves the directory relative to the `app` package at import time.
- **Rationale**: TS-10's `deploy.yml` ships `package: backend`, so the build must be inside
  `backend/` to travel with the deploy; putting it under `app/` keeps it next to the code that
  serves it. Git-ignoring it keeps build artifacts out of the repo (no noisy diffs, no stale
  bundle committed).
- **Alternatives rejected**: `backend/static/` (top of package) — works, but `app/static/` keeps
  the serving code and its files co-located and the path import trivial. Committing the build —
  rejected (stale artifacts, large diffs, defeats reproducible build).

## R4 — Backend must start with no build present (local dev)

- **Decision**: On startup, resolve the static directory path; if it does not exist (normal local
  dev, where Vite's dev server serves the UI), skip mounting `StaticFiles` and let the catch-all
  return a small 404/placeholder for `/`. The API always mounts. Guard the mount with a directory
  existence check.
- **Rationale**: FR-010 — the backend must run for local API work and for the test suite without a
  build. `StaticFiles(directory=...)` raises at construction if the directory is missing, so the
  existence check avoids a crash.
- **Alternatives rejected**: Always creating an empty `static/` dir — would commit an empty dir or
  require a placeholder file; the existence check is simpler. Rejected.

## R5 — Production API base = relative, local default unchanged

- **Decision**: Keep `API_BASE_URL` in `frontend/src/api/client.js`. Change the resolution so that
  when `VITE_API_BASE_URL` is **defined** (even as an empty string) it is used verbatim after
  trimming/trailing-slash cleanup — an empty value yields `''`, i.e. same-origin relative requests
  (`fetch('' + path)` hits the current origin). When the variable is **undefined** (no `.env`,
  local dev, test run), fall back to `http://localhost:8000`. The production build sets
  `VITE_API_BASE_URL=` (empty) via a `.env.production` file so the deployed app uses the relative
  base.
- **Rationale**: FR-007 + AC5/AC6/SC-004/SC-007. Distinguishing "undefined" from "set empty" lets
  the deployed build opt into same-origin while the existing test (no env var → `http://localhost:8000`)
  keeps passing. `fetch` resolves a relative path against the document origin, which is exactly the
  App Service URL in production.
- **Alternatives rejected**:
  - Hard-coding `''` always — breaks local dev where the dev server (5173) must reach the API on
    8000. Rejected.
  - A runtime `window.location`-based switch — more code; the build-time env var is the idiomatic
    Vite approach. Rejected.
  - `import.meta.env.PROD` branch — works, but keying off the explicit `VITE_API_BASE_URL` keeps a
    single source of truth and stays overridable. Chosen approach subsumes it.

## R6 — Deploy builds the frontend into the package

- **Decision**: In `deploy.yml`, before the `azure/webapps-deploy@v3` step, add: `actions/setup-node@v7`
  with `node-version: "26"` and `cache: npm`; `npm ci` and `npm run build` in `frontend` (with
  `VITE_API_BASE_URL=` empty via `.env.production`); then copy/emit the Vite output into
  `backend/app/static/`. Keep `package: backend` so the one deploy step ships both. OIDC auth, the
  migration step and the `if:`/`workflow_run` gating are unchanged.
- **Rationale**: FR-009/AC7. Node 26 matches the CI frontend job for a reproducible build. One
  deploy step, one credential, one host (D-39, Principle IX/XII).
- **Alternatives rejected**: Building during Azure's Oryx deploy (`SCM_DO_BUILD...`) — Oryx builds
  the Python app, not a separate Node app reliably; explicit build in the workflow is clearer.
  Rejected. A second `azure/webapps-deploy` for a separate frontend host — rejected (D-39).

## R7 — CSP already allows the build

- **Decision**: Leave the TS-10 CSP as is: `default-src 'self'; frame-ancestors 'none'; base-uri
  'self'; object-src 'none'`. Vite's production build emits external hashed `.js`/`.css` under the
  same origin, which `default-src 'self'` permits. Verify at the e2e check that no asset is blocked.
  Only if the build emitted an inline script/style (it does not by default) would a minimal CSP
  adjustment be needed.
- **Rationale**: FR-011/AC8/SC-006. Same-origin assets load under `'self'`; the framing/base/object
  protections stay. The `security_headers.py` comment already anticipated this TS-11 revisit.
- **Alternatives rejected**: Adding `'unsafe-inline'` — weakens the policy for no reason, since the
  build has no inline scripts. Rejected.

## R8 — End-to-end check on the deployed URL

- **Decision**: After the deploy step, run a small check (curl/PowerShell in the workflow, or a
  documented manual step) asserting: `GET /` → 200 `text/html`; a deep client route (e.g.
  `/patients/PAT-001`) → 200 `text/html` (shell, not 404); `GET /health` → 200 JSON with
  `status`/`version`/`database`; with one retry to allow Neon to wake from scale-to-zero (as TS-10).
- **Rationale**: FR-012/SC-001–003. Proves the three behaviours that define "served correctly".
- **Alternatives rejected**: A full browser/E2E runner (Playwright) in CI — heavyweight for an
  academic prototype; HTTP assertions cover the acceptance criteria. Rejected (Principle XII).

## R9 — All API routes under `/api` (except `/health`)

- **Decision**: Move every API route under an `/api` prefix, keeping `/health` at `/health`. In
  `backend/app/main.py`, change `app.include_router(auth.router)` to
  `app.include_router(auth.router, prefix="/api")`, so the unchanged `@router.post("/auth/login")`
  and `@router.get("/me")` decorators serve `/api/auth/login` and `/api/me`. Every future API
  router is included under `/api`. `/health` stays a top-level `@app.get("/health")`. In
  `frontend/src/api/client.js`, update the paths to `/api/auth/login`, `/api/me` (and `/api/...`
  generally); `getHealth()` keeps calling `/health`. The SPA fallback then only needs to let
  `/api/...` and `/health` through to the API; everything else is a page or a static file.
- **Rationale**: A single prefix cleanly separates API paths from browser pages (the user's
  requested routing model), so the SPA catch-all never has to enumerate every API route — it
  excludes `/api/...` and `/health`. An unknown `/api/...` path is matched by no router, so FastAPI
  returns its JSON 404 (not the shell), satisfying FR-004/AC4 without special-casing. Mounting with
  `prefix=` avoids editing the route decorators or the auth logic, limiting the change to the mount
  point, the client paths and the tests (FR-004a).
- **Trade-off / cost**: This changes the TS-06 paths (`/auth/login` → `/api/auth/login`). The
  backend tests that call the old paths (`test_auth.py`, `test_cors.py`, `test_login_rate_limit.py`,
  `test_security_headers.py`, and `test_seed_demo_users.py` if it references a path) and the
  frontend client/tests must be updated. No functional story depends on the old paths yet, and a
  technical story is the right place to make a foundation change (constitution III). The merged
  TS-06 spec keeps its history; D-44 records the new layout.
- **Alternatives rejected**:
  - Keep API routes at the root and have the fallback enumerate/skip each API path — brittle, must
    change whenever a route is added; the `/api` prefix is the simpler, stable rule. Rejected.
  - Put `/health` under `/api` too — the deploy docs, the TS-10 `/health` check and D-30 all use
    `/health`; moving it would churn TS-10. Kept at `/health` (as the user specified).
  - A redirect from the old paths to `/api/...` — adds dead surface for paths nothing uses yet.
    Rejected (YAGNI).
