# Feature Specification: React App Skeleton

**Feature Branch**: `004-react-app-skeleton`

**Created**: 2026-11-13

**Status**: Draft

**Input**: User description: "TS-04 — React app skeleton (technical story, depends on TS-01). As a developer, I want a React frontend skeleton that talks to the backend so that later stories can build screens on a working base. Acceptance criteria: A frontend/ project that every team member can install and run locally with documented commands (npm install, npm run dev, npm run build, npm test). One start page that calls the backend GET /health and shows the result: API status, version and database status ("ok" / "unavailable"), plus a clear message when the backend can't be reached. It must never hang: show a "checking" state and give up after a short timeout. A small shared API client that every later screen will use; the backend base URL comes from configuration (local default http://localhost:8000), never hard-coded in components. The backend allows browser requests (CORS) only from configured frontend origins (local default http://localhost:5173); no wildcard. Configured the same way as DATABASE_URL (environment variable, no secrets in code). UI text in Spanish for now (the language switch and disclaimer banner are TS-05). Automated frontend tests cover the three /health states (ok, database unavailable, backend unreachable) without a running backend or network; a backend test covers the CORS rule. frontend/README.md and DEVELOPMENT.md explain local setup. Out of scope: language switch and disclaimer (TS-05), login (TS-06), deployment (TS-11), CI (TS-09). Keep it as simple as possible (D-23). Note: Vite 8 runs fine on our laptops with Smart App Control on (checked 2026-11-13)."

## User Story *(mandatory)*

**Story ID**: TS-04

**Type**: Technical

**Story**: As a developer, I want a React frontend skeleton that talks to the backend, so that later stories can build screens on a working base.

**Depends on**: TS-01 (the `GET /health` endpoint; its `database` field comes from TS-02, already merged)

### Acceptance Criteria

1. **AC1**: **Given** a fresh clone with Node.js LTS installed, **When** a developer runs the documented commands in `frontend/` (`npm install`, then `npm run dev`), **Then** the start page opens in the browser at the documented local address; `npm run build` produces a production build without errors, and `npm test` runs the frontend tests.
2. **AC2**: **Given** the backend is running and its database is reachable, **When** the start page loads, **Then** it first shows a "checking" message and then shows, in Spanish, that the API is working, the API version reported by the backend, and that the database is available.
3. **AC3**: **Given** the backend is running but reports the database as `"unavailable"`, **When** the start page loads, **Then** it shows that the API is working, its version, and a clear Spanish message that the database is not available.
4. **AC4**: **Given** the backend is not running, cannot be reached, returns an error status or an unexpected response, or does not answer within the timeout (10 seconds), **When** the start page loads, **Then** the "checking" message is replaced by a clear Spanish message that the backend cannot be reached, and the page never stays in the "checking" state indefinitely.
5. **AC5**: **Given** the frontend code, **When** a developer looks for where the backend address is defined, **Then** it is read from configuration in one shared API client (local default `http://localhost:8000`), and no page or component contains a backend URL.
6. **AC6**: **Given** the backend with its allowed-origins setting unset, **When** a browser page at `http://localhost:5173` calls the API, **Then** the browser is allowed to read the response; **and When** a page at any other origin calls the API, **Then** the browser is not allowed to read it. The backend never allows every origin (`*`).
7. **AC7**: **Given** the allowed-origins environment variable is set to one or more origins, **When** the backend starts, **Then** exactly those origins are allowed (replacing the local default), the setting is read the same way as `DATABASE_URL` (environment variable, optionally from the git-ignored `backend/.env`), and no origin list beyond the local default is hard-coded.
8. **AC8**: **Given** a fresh clone with no running backend and no network access, **When** a developer runs `npm test` in `frontend/`, **Then** tests for the three `/health` states (ok, database unavailable, backend unreachable — including the timeout) run and pass.
9. **AC9**: **Given** no `.env` file and no network access, **When** a developer runs the backend test command, **Then** tests that check the CORS rule (default origin allowed, other origin refused, configured origins replace the default, wildcard not accepted) run and pass together with the existing backend tests.
10. **AC10**: **Given** a teammate reading `frontend/README.md` and `DEVELOPMENT.md`, **When** they set up the project locally, **Then** the docs explain the prerequisites, the four npm commands, how to set the backend address for the frontend, how to set the allowed origins on the backend, and that the backend must be running for the start page to show "ok".

### Out of Scope

- Language switch and the "academic prototype, not a certified medical device" disclaimer banner (TS-05).
- Login, protected pages or any clinical screen (TS-06 and functional stories).
- Deployment and the production API address or production origins (TS-10, TS-11).
- Running frontend tests in CI (TS-09).
- Routing between multiple pages, global state management, UI component libraries or styling frameworks.
- Automatic retry or periodic polling of `/health` (D-30: each call wakes the Neon database).

### Edge Cases

- The backend is up but slow because the Neon database is waking up (scale-to-zero): the page keeps showing "checking" until the response arrives, as long as it is within the timeout.
- The backend answers with a non-200 status or a body that is not the expected `/health` shape: treated as "backend cannot be reached / unexpected answer" — the page shows the unreachable message, never a blank page or a raw error.
- The backend reports an unknown value for `database` (neither `"ok"` nor `"unavailable"`): shown as database not available.
- The backend address setting is missing in the frontend: the local default `http://localhost:8000` is used.
- The allowed-origins setting is set but empty or blank: the local default is used. A value containing `*` is rejected (not treated as "allow all").
- Origins in the setting have extra spaces or a trailing slash: they are trimmed so `http://localhost:5173/` and `http://localhost:5173` match the same origin.
- The page is reloaded: it checks `/health` once per load; no repeated background calls.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repository MUST contain a `frontend/` React project with the scripts `npm run dev` (local development server at `http://localhost:5173`), `npm run build` (production build) and `npm test` (runs the automated tests once and exits), installable with `npm install`. Exact dependency versions MUST be locked in the committed lock file.
- **FR-002**: The frontend MUST have one start page that calls the backend `GET /health` once when it loads and shows one of four states, all with Spanish text: checking; API ok + version + database available; API ok + version + database not available; backend cannot be reached.
- **FR-003**: The call to `/health` MUST give up after 10 seconds and then show the "backend cannot be reached" state. A network error, a non-200 status or a response missing `status` or `version` MUST also show that state.
- **FR-004**: The frontend MUST have one small shared API client that every later screen uses to call the backend. It MUST read the backend base URL from build-time configuration, defaulting to `http://localhost:8000` when unset. No component or page MAY contain a backend URL.
- **FR-005**: The backend MUST allow cross-origin browser requests only from a configured list of origins, read from one environment variable (also loadable from the git-ignored `backend/.env`, as `DATABASE_URL` is), given as a comma-separated list. When unset or blank, the list MUST default to `http://localhost:5173` only.
- **FR-006**: The backend MUST NOT allow the wildcard origin `*`; if the setting contains `*`, that entry MUST be ignored (the backend still starts) and only explicit origins are allowed. Credentials (cookies) MUST NOT be enabled for cross-origin requests in this story.
- **FR-007**: The existing `GET /health` contract (D-30) MUST NOT change.
- **FR-008**: Frontend automated tests MUST cover the `/health` states ok, database unavailable and backend unreachable (network error and timeout), using a simulated backend response — no running backend and no network access.
- **FR-009**: Backend automated tests MUST verify that the default origin is allowed, an unlisted origin is refused, a configured list replaces the default, and `*` is never allowed — without a database, `.env` file or network access.
- **FR-010**: `frontend/README.md` MUST document prerequisites, install/run/build/test commands, the backend-address setting with its default, and that the backend must be running. `DEVELOPMENT.md` MUST link to it and describe running backend and frontend together locally, including the allowed-origins setting. `docs/PROJECT_STATUS.md` MUST be updated when the story is done.
- **FR-011**: No secrets, tokens or real data MAY be added to the frontend; the backend address and allowed origins are not secrets, but any local override files MUST be git-ignored, with a committed example file if one is needed.
- **FR-012**: The frontend MUST be plain and minimal: no router, state-management library, UI component library or CSS framework in this story (D-23).

### Key Entities

- **Health status (as shown to the user)**: the result of one `/health` call — API status, API version, database status (`ok` | `unavailable`) — or the fact that the backend could not be reached.
- **Allowed origins setting**: the list of frontend web addresses whose browser requests the backend accepts; default `http://localhost:5173`.
- **Backend address setting**: the base web address the frontend uses for all API calls; default `http://localhost:8000`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A teammate with Node.js installed and the backend already set up can go from a fresh clone to seeing the start page report the backend status in under 10 minutes, following only `frontend/README.md` and `DEVELOPMENT.md`.
- **SC-002**: With the backend stopped, the start page shows the "backend cannot be reached" message within 10 seconds of loading in 100% of attempts; it never stays on "checking".
- **SC-003**: 100% of frontend and backend tests pass on a machine with no running backend, no `.env` file and no network access; the frontend test run completes in under 30 seconds.
- **SC-004**: A search of `frontend/src` finds the backend address only in the shared API client's configuration, and a search of the backend finds no wildcard origin.
- **SC-005**: A request from an origin not in the list is refused by the browser in 100% of the backend CORS tests.

## Assumptions

- Build tool, test runner and project layout are chosen in the plan (simplest option, D-23); the user noted that Vite 8 runs fine on the team's laptops with Windows Smart App Control on (checked 2026-11-13), so a Vite-based React project is the expected starting point.
- The timeout is 10 seconds: longer than the backend's own database check limits (5 s connect, 5 s query, TS-02) so a slow database still shows "database not available" rather than "backend cannot be reached", but short enough that the page never appears stuck.
- The start page is a temporary home page; later stories (TS-05, TS-06, functional stories) may replace or wrap it, and reuse the API client.
- Spanish wording is hard-coded in the components for now; TS-05 moves all text into translations and adds the English switch.
- Backend address and allowed origins are configuration, not secrets; production values are set in TS-10/TS-11.
- The new backend setting name (e.g. `CORS_ORIGINS`) and the frontend setting name are fixed in the plan and documented.
- Only `GET` requests are needed now; allowing other methods and headers needed by later stories (e.g. `Authorization` for TS-06) may be decided in the plan or in those stories.
- Until TS-09 (CI) is merged, the PR includes the local `npm test` and `pytest` output (D-27).
