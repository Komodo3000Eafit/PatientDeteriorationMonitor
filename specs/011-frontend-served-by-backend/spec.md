# Feature Specification: Frontend Served by the Backend

**Feature Branch**: `011-frontend-served-by-backend`

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "TS-11. CI builds the React app and deploys it with the backend to the same Azure App Service; FastAPI serves the static files and falls back to index.html for client routes; the frontend calls the API with relative URLs (same origin, so CORS stays for local development only); end-to-end check on the deployed URL (D-39). Depends on TS-05 and TS-10. Carry-over: revisit the CSP so the served React build is not blocked."

## Clarifications

### Session 2026-11-19

- Q: Where should the React build be produced and from where should FastAPI serve it? → A: The deploy workflow (`deploy.yml`) builds the frontend with `npm ci` + `npm run build` and copies the build output into a directory the backend package includes, so the single `azure/webapps-deploy@v3` step ships both; FastAPI serves that directory as static files. No second App Service, no separate frontend host.
- Q: How should FastAPI route between the API and the single-page app? → A: API routes (`/health`, `/auth/*`, and future clinical routes) keep priority. Any other GET that is not a real static file returns `index.html` so the client router (TS-13) can handle it; a request for a path under the API prefixes that does not exist still returns the API's JSON 404, never `index.html`.
- Q: How should the frontend address the API in production vs. local development? → A: In production the frontend uses same-origin relative URLs (empty base), because the API and the build share one origin. Local development keeps the `VITE_API_BASE_URL` override (default `http://localhost:8000`) and CORS; CORS is therefore needed only for local development (D-39).
- Q: What should the end-to-end check verify on the deployed URL? → A: After a deploy, requesting the site root returns the HTML app shell (HTTP 200, `text/html`), a known deep client route also returns that shell (not a 404), `GET /health` still returns the JSON health payload, and the served HTML/JS loads under the existing Content-Security-Policy (no origin blocked).
- Q: Does serving the build require loosening the Content-Security-Policy? → A: The current CSP (`default-src 'self'`) already allows same-origin scripts and styles, so a Vite build with external `.js`/`.css` assets loads without changes. If the build emits an inline script or inline style that the policy would block, the CSP is adjusted minimally (or the build configured to avoid inline assets) so the app loads; the `frame-ancestors 'none'`, `base-uri 'self'` and `object-src 'none'` protections stay.
- Q: Where should the deploy workflow place the built React files, and is that location committed? → A: The workflow builds into `backend/app/static/` (inside the packaged `backend` directory the single `azure/webapps-deploy@v3` step ships), and FastAPI serves from that path at runtime. The directory is git-ignored: only the deploy (or a local build) produces it, so no build artifacts are committed.
- Q: How are API paths separated from browser pages so the SPA fallback never shadows the API? → A: **All API routes move under an `/api` prefix, except `/health`.** The authentication routes and `/me` become `/api/auth/login` and `/api/me`, and every future API route lives under `/api` (e.g. `/api/patients`); `/health` stays at `/health` (deploy docs and checks use it). Browser pages stay at the root (`/login`, `/patients`, `/patients/:identifier` — TS-13). The SPA fallback returns `index.html` for any GET that is not `/api/...`, not `/health` and not a static file; an unknown `/api/...` path still returns a JSON 404, never `index.html`. The backend mounts the existing auth router with `prefix="/api"` (route decorators unchanged) and the backend tests are updated to the `/api/...` paths. This is TS-11 extending the TS-06 foundation (a technical story may change architecture; D-44).

## User Story *(mandatory)*

**Story ID**: TS-11

**Type**: Technical

**Story**: As a team member, I want the React production build to be served by the FastAPI backend on the same Azure App Service, so that the graded product is reachable as one application at a single public URL, with the frontend and API sharing one origin.

**Depends on**: TS-05 (language and disclaimer; the served app is the React app from TS-04/TS-05), TS-10 (backend deployment: the App Service, the `deploy.yml` workflow and the OIDC/CI gating this story extends).

### Acceptance Criteria

<!-- Each criterion must be testable. qa-tester writes at least one test per criterion. -->

1. **AC1 — App shell at the root**: **Given** a successful deploy to the App Service, **When** anyone requests `GET /` on the Azure URL, **Then** the response is HTTP 200 with `Content-Type: text/html` and is the React app's `index.html` shell.
2. **AC2 — Client-route fallback**: **Given** the deployed app, **When** anyone requests a GET path that is not an API route and not an existing static file (for example a deep client route such as `/patients/PAT-001`), **Then** the response is HTTP 200 serving `index.html`, so the client router can render that route after load.
3. **AC3 — Static assets are served**: **Given** the deployed app, **When** the browser requests a built asset the app references (for example a hashed file under the assets path), **Then** the asset is returned with HTTP 200 and a JavaScript/CSS content type, so the page actually runs.
4. **AC4 — API routes keep priority**: **Given** the deployed app, **When** `GET /health` is requested, **Then** it returns the JSON health payload (`status`, `version`, `database`), not `index.html`; **and** when an unknown path under `/api` (for example `GET /api/does-not-exist`) is requested, **Then** the API's JSON 404 is returned, never `index.html`.
5. **AC5 — Same-origin relative API calls in production**: **Given** the production build, **When** it calls the API, **Then** it uses same-origin relative URLs (no absolute `http://…:8000` host), so no cross-origin request and no CORS header are required in production.
6. **AC6 — Local development unchanged**: **Given** a developer running the frontend dev server and the backend locally, **When** no `VITE_API_BASE_URL` is set, **Then** the frontend still reaches the backend at `http://localhost:8000` and CORS still permits the dev origin, so the local workflow from TS-04/TS-05 keeps working.
7. **AC7 — One deploy ships both**: **Given** the deploy workflow, **When** it runs after CI passes on `main`, **Then** it builds the React app and includes the build in the same package deployed by the single `azure/webapps-deploy@v3` step, with no second App Service and no separate frontend host or credential.
8. **AC8 — CSP does not block the app**: **Given** the deployed app loaded in a browser, **When** the page and its scripts/styles load, **Then** the Content-Security-Policy does not block any asset the app needs, while `frame-ancestors 'none'`, `base-uri 'self'` and `object-src 'none'` from TS-10 remain in force.
9. **AC9 — API under `/api`, pages at root**: **Given** the deployed app, **When** the API routes are inspected, **Then** the authentication login and the current-user route are reachable at `/api/auth/login` and `/api/me` (not at `/auth/login` or `/me`), every other API route lives under `/api`, and `/health` remains at `/health`; **and** the frontend reaches those endpoints through `/api/...` paths. A request to the old `/auth/login` or `/me` path is not treated as an API route (it falls through to the SPA fallback or a 404, never the JSON API).
10. **AC10 — Documentation and status**: **Given** a teammate, **When** they read the docs, **Then** `DEVELOPMENT.md` (or a deployment doc) explains that one App Service serves both the API and the build, that all API routes are under `/api` except `/health`, how the deploy builds and ships the frontend, and how the SPA fallback works; `docs/DECISIONS.md` records the TS-11 decisions (including the `/api` prefix); `docs/PROJECT_STATUS.md` and `docs/BACKLOG.md` show TS-11 as done with the single deployed URL.

### Out of Scope

- The client-side router and its routes (`/login`, `/patients`, `/patients/:identifier`, not-found page, `<RequireAuth>`): that is TS-13. TS-11 only provides the `index.html` fallback that TS-13 relies on.
- Any application feature, page or endpoint beyond serving the existing TS-04/TS-05 build and routing between API and static files.
- Creating, resizing or relocating the App Service, resource group or Neon project; and changing the OIDC setup, the CI checks or the migration step from TS-09/TS-10 (this story extends the existing `deploy.yml` with a frontend build and static serving only).
- A CDN, custom domain, separate asset host, HTTP caching policy tuning, or service worker / offline support.
- Server-side rendering or prerendering; the app is a static single-page build served as files.

### Edge Cases

- **Deep client route on a fresh load / refresh**: a direct request to `/patients/PAT-001` (no prior client navigation) must return the app shell (AC2), not a 404, so refreshing a client route works.
- **Unknown API path**: `/api/does-not-exist` returns the API's JSON 404, not the SPA shell (AC4), so a mistyped endpoint is not masked by HTML.
- **Old unprefixed path**: a request to the former `/auth/login` or `/me` (without `/api`) is no longer an API route; it is handled as a non-API path (SPA fallback for a GET, or a 404), so nothing keeps answering on the old path.
- **`/health` is not under `/api`**: `GET /health` stays at `/health` (deploy docs and checks depend on it) and is matched as an API route before the fallback.
- **Missing static asset**: a request for a non-existent file that looks like an asset (for example `/assets/missing.js`) returns a 404 for that asset rather than `index.html`, so a broken reference is visible instead of silently serving HTML as JavaScript.
- **Build directory absent in local dev**: when the backend runs without a built frontend present (normal local development, where the dev server serves the UI), the backend still starts and the API works; the static mount is simply empty or disabled, and `/` may return a minimal response rather than crashing.
- **Non-GET request to a non-API path**: a `POST`/`PUT` to a path that is not an API route is not served `index.html`; only safe GET navigations fall back to the shell.
- **CSP vs. inline assets**: if the production build emits an inline script/style the policy would block, the app would fail to load; the build is configured to avoid inline assets, or the CSP is minimally adjusted, so AC8 holds.
- **Fork or untrusted trigger**: as in TS-10, the deploy (now including the frontend build) only runs for the repository's own `main` after CI; fork pull requests never deploy.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The FastAPI backend MUST serve the React production build as static files from `backend/app/static/` (a directory inside the packaged `backend` directory), so that the frontend is reachable at the same origin and public URL as the API. The directory MUST be git-ignored so no build artifacts are committed.
- **FR-002**: `GET /` MUST return the React app's `index.html` shell with an HTML content type and HTTP 200 when the build is present.
- **FR-003**: For any GET request whose path is neither an API route (`/api/...` or `/health`) nor an existing static file, the backend MUST return `index.html` with HTTP 200 (single-page-app fallback), so client-side routes resolve after the app loads.
- **FR-004**: API routes MUST keep priority over the static/fallback handler. `GET /health` and every route under `/api` (authentication, current user and any future clinical API route) MUST be matched as API endpoints; a request to an unknown path under `/api` MUST return the API's JSON 404 (or appropriate API error), never `index.html`.
- **FR-004a**: All API routes MUST live under the `/api` prefix, **except** `/health`, which MUST stay at `/health`. The authentication login and current-user routes MUST be served at `/api/auth/login` and `/api/me` (the existing auth router is mounted with `prefix="/api"`; its route decorators are unchanged), and every new API route MUST be registered under `/api` (e.g. `/api/patients`). The backend tests MUST be updated to the `/api/...` paths. Browser pages stay at the root (`/login`, `/patients`, `/patients/:identifier` — added in TS-13).
- **FR-005**: Requests for existing built assets (for example the hashed files Vite emits under its assets path) MUST be served with their correct content type; a request for a non-existent asset MUST return a 404 for that asset, not `index.html`.
- **FR-006**: The single-page-app fallback MUST apply only to safe GET navigations; non-GET requests to non-API paths MUST NOT be served `index.html`.
- **FR-007**: The frontend MUST call the API through `/api/...` paths in `frontend/src/api/client.js` (e.g. `/api/auth/login`, `/api/me`), relative in production (same-origin, no CORS) and against `http://localhost:8000` in local development; `/health` stays at `/health`. In the production build the base is empty/relative, so no cross-origin request is made and no CORS header is required in production.
- **FR-008**: Local development MUST keep working as in TS-04/TS-05: with no `VITE_API_BASE_URL` set, the frontend reaches `http://localhost:8000`, and CORS continues to allow the local dev origin. CORS is therefore needed only for local development (D-39).
- **FR-009**: The deploy workflow (`deploy.yml`) MUST build the React app (`npm ci` then `npm run build`, pinned Node version), place the build output in `backend/app/static/`, and thereby include it in the package deployed by the existing single `azure/webapps-deploy@v3` step (which ships the `backend` directory), after the CI checks pass on `main`. It MUST NOT create a second App Service or any separate frontend host, and MUST keep TS-10's OIDC authentication, forward-only migration and `main`/CI gating unchanged.
- **FR-010**: The backend MUST still start and serve the API when no built frontend is present (local development), rather than failing because the static directory is missing.
- **FR-011**: The Content-Security-Policy from TS-10 MUST continue to allow the served build to load (same-origin scripts, styles and assets). If a blocked inline asset would otherwise break the app, the build MUST avoid inline assets or the CSP MUST be adjusted minimally; `frame-ancestors 'none'`, `base-uri 'self'` and `object-src 'none'` MUST remain.
- **FR-012**: After a successful deploy, an end-to-end check on the Azure URL MUST confirm that `GET /` returns the HTML shell, a known deep client route returns the shell (not a 404), `GET /health` still returns the JSON health payload, and the served assets load under the CSP.
- **FR-013**: Automated tests MUST cover the serving behaviour as critical paths (Principle VII and VIII — all endpoints): the root returns the HTML shell, a non-API/non-file GET falls back to `index.html`, `/health` and the `/api/...` routes are not shadowed by the fallback, an unknown `/api/...` path returns a JSON 404, a non-GET to a non-API path is not served the shell, and the backend starts without a build present. The existing backend tests MUST be updated so the auth and current-user routes are exercised at `/api/auth/login` and `/api/me` and still pass. A frontend test MUST confirm the client calls `/api/...` paths, that the production API base is same-origin/relative, and that the local default stays `http://localhost:8000`.
- **FR-014**: Documentation MUST explain the one-App-Service model (API + build at one origin), how the deploy builds and ships the frontend, and the SPA fallback; `docs/DECISIONS.md` MUST record the TS-11 decisions; `docs/PROJECT_STATUS.md` and `docs/BACKLOG.md` MUST mark TS-11 as done and record the single deployed URL.

### Key Entities *(include if feature involves data)*

- **Static build directory**: `backend/app/static/`, holding the React production build (`index.html` plus hashed assets), produced by the frontend build step and shipped inside the packaged `backend` directory; FastAPI serves it as static files. It is git-ignored (build-time only, never committed).
- **API prefix**: all API routes live under `/api` (e.g. `/api/auth/login`, `/api/me`, future `/api/patients`), except `/health` which stays at `/health`. This cleanly separates API paths from browser pages so the SPA fallback never shadows the API and an unknown `/api/...` path is a JSON 404.
- **SPA fallback route**: the backend handler that returns `index.html` for GET paths that are neither API routes (`/api/...` or `/health`) nor existing static files, so client-side routing works on direct loads and refreshes.
- **Deploy workflow (`deploy.yml`)**: the existing TS-10 workflow, extended with a frontend build step whose output is bundled into the same deployment package; it keeps the OIDC auth, forward-only migration and `main`/CI gating unchanged and still runs a single deploy step.
- **Production API base**: the same-origin relative base the production frontend uses to call the API, replacing the absolute local default in deployed builds.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the deployed Azure URL, `GET /` returns HTTP 200 with an HTML content type serving the app shell.
- **SC-002**: On the deployed Azure URL, a deep client route (for example `/patients/PAT-001`) returns HTTP 200 serving the app shell, not a 404.
- **SC-003**: On the deployed Azure URL, `GET /health` still returns HTTP 200 with the JSON payload (`status`, `version`, `database`), confirming API routes are not shadowed.
- **SC-004**: The production build makes 0 cross-origin API requests: every API call uses a same-origin relative URL, confirmed by an automated test and by the deployed app loading without CORS errors.
- **SC-005**: Exactly 1 Azure App Service and 1 public URL serve both the frontend and the API; 0 additional frontend hosts or credentials are introduced.
- **SC-006**: The deployed page and its assets load with 0 Content-Security-Policy violations in the browser console.
- **SC-007**: The local development workflow is unchanged: with no `VITE_API_BASE_URL`, the frontend still targets `http://localhost:8000`, confirmed by the existing/extended frontend tests.
- **SC-008**: Every API route except `/health` is reachable only under `/api` (`/api/auth/login`, `/api/me` respond; the old `/auth/login`, `/me` do not), and the full backend test suite passes with the `/api/...` paths.

## Assumptions

- The App Service, the Neon project, the OIDC federation and the `deploy.yml` workflow already exist from TS-10; this story extends them (adds a frontend build step and static serving) rather than creating infrastructure (D-39).
- The React app from TS-04/TS-05 builds with `npm run build` (Vite) into a standard output directory of `index.html` plus hashed assets; no router is present yet (TS-13 adds it), so TS-11's fallback is what later makes client routes work on refresh.
- Vite's default build emits external `.js`/`.css` assets (no inline scripts/styles) that load under `default-src 'self'`; if that changes, FR-011 covers the minimal adjustment.
- The simplest approach that works is preferred (Principle XII, D-23): FastAPI serves the build with its built-in static-files support and a single catch-all fallback, the frontend build is written into `backend/app/static/` during the deploy (git-ignored, so the repo stays clean), and no new service, framework or asset host is added.
- The production API base is selected at build time (an empty/relative base for the deployed build) while local development keeps the `VITE_API_BASE_URL` default; the exact mechanism is finalised in the plan.
- The App Service startup command and Python runtime from TS-10 (gunicorn with a uvicorn worker) are unchanged; serving static files needs no new runtime process.
- The Node version used to build the frontend matches the one the CI frontend-tests job already uses (pinned in the workflow), so the build is reproducible.
- Moving the API under `/api` changes the TS-06 paths (`/auth/login` → `/api/auth/login`, `/me` → `/api/me`). This is acceptable in a technical story (TS-xx stories set up architecture) and is done by mounting the existing auth router with `prefix="/api"`, so the route decorators and auth logic are unchanged; only the mount point, the frontend client paths and the backend tests change. No functional story depends on the old paths yet. The merged TS-06 spec keeps its original `/auth/login`/`/me` wording as history; D-44 records the change (constitution governance: later decisions take precedence over merged-spec wording).
