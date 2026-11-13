# Feature Specification: Neon Database Connection

**Feature Branch**: `002-neon-db-connection`

**Created**: 2026-11-13

**Status**: Draft

**Input**: User description: "TS-02 — Neon database connection (technical story, depends on TS-01). As a developer, I want the FastAPI backend to connect to our Neon PostgreSQL database so that later stories can store and read data. Context: the Neon project "patient-deterioration-monitor" already exists (D-28, D-29). The pooled connection string is provided only through the DATABASE_URL environment variable: locally from the git-ignored backend/.env, in CI/CD from the GitHub secret DATABASE_URL. No credentials may appear in code, logs, error messages or committed files. Acceptance criteria: the backend reads DATABASE_URL from the environment at startup; GET /health keeps reporting the app status (from TS-01) and also reports database status: "ok" when a simple query succeeds, "unavailable" when it fails or DATABASE_URL is missing; the app must still start and /health must still respond when the database is unavailable; the /health response never exposes the connection string or error details that contain credentials; automated tests cover both database states (reachable and unavailable) and do not need a real database or network access; backend/README.md and DEVELOPMENT.md explain how each team member sets up backend/.env (from Neon console → Connect, pooled string), without including any real value. Out of scope: tables and migrations (TS-03), deployment (TS-10), CI (TS-09). Keep it as simple as possible (D-23)."

## Clarifications

### Session 2026-11-13

- Q: Should every call to `/health` check the database, even though frequent automatic callers would keep the Neon database from going to sleep? → A: Yes, every call checks the database (no caching, no opt-in parameter); TS-10 must not point frequent automatic health probes at `/health` unless it accepts the compute cost.

## User Story *(mandatory)*

**Story ID**: TS-02

**Type**: Technical

**Story**: As a developer, I want the backend to connect to the project's PostgreSQL database on Neon using a connection string supplied only through the `DATABASE_URL` environment variable, and to report the database status in the health check, so that later stories can store and read data and anyone can quickly see whether the database is reachable.

**Depends on**: TS-01

### Acceptance Criteria

1. **AC1**: **Given** `DATABASE_URL` is set in the environment (locally via the git-ignored `backend/.env`, in CI/CD via the GitHub secret), **When** the backend starts, **Then** it reads the connection settings from `DATABASE_URL` and from nowhere else (loaded at startup; the connection is created on the first check).
2. **AC2**: **Given** the database is reachable, **When** a client sends `GET /health`, **Then** it receives HTTP 200 with the TS-01 fields unchanged (`status: "ok"`, `version`) plus `database: "ok"`.
3. **AC3**: **Given** the database is unreachable or a simple test query fails, **When** a client sends `GET /health`, **Then** it still receives HTTP 200 with `status: "ok"`, `version` and `database: "unavailable"`.
4. **AC4**: **Given** `DATABASE_URL` is missing or empty, **When** the backend starts and a client sends `GET /health`, **Then** the app starts normally and `/health` responds with `database: "unavailable"`.
5. **AC5**: **Given** any database state, **When** `/health` responds or the backend logs a database failure, **Then** neither the response nor the log contains the connection string, the password, or raw driver error text.
6. **AC6**: **Given** a fresh clone with no `.env` file and no network access, **When** a developer runs the documented test command, **Then** tests covering both database states (reachable and unavailable) run and pass without a real database.
7. **AC7**: **Given** a teammate following `backend/README.md` (linked from `DEVELOPMENT.md`), **When** they set up `backend/.env` from the Neon console (Connect → pooled connection string), **Then** the documentation tells them exactly where to get the value and where to put it, without showing any real value.

### Out of Scope

- Tables, schema and migrations (TS-03).
- Deployment and Azure App Service settings (TS-10).
- CI pipeline (TS-09).
- Reading or writing application data; any clinical feature.
- Connection retries, pooling tuning or a database-per-PR branching workflow.

### Edge Cases

- `DATABASE_URL` is set but malformed: `/health` reports `database: "unavailable"`; the app does not crash.
- The database is slow or asleep (Neon scale-to-zero): the database check gives up after a short limit, so `/health` still answers within the time in SC-002 and reports `"unavailable"` if the limit is reached.
- The database becomes reachable after the app started without it: the next `/health` call reports `"ok"` without restarting the app (each call checks again).
- Methods other than GET on `/health` and unknown paths keep the TS-01 behavior (405 / 404).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The backend MUST read the database connection string only from the `DATABASE_URL` environment variable; a local `backend/.env` file, if present, MUST be loaded into the environment at startup. No connection string or credential MAY appear in code or committed files.
- **FR-002**: The backend MUST start and serve requests whether or not the database is reachable or `DATABASE_URL` is set; it MUST NOT require the database at startup.
- **FR-003**: `GET /health` MUST keep the TS-01 fields `status` (`"ok"` while the app is up) and `version`, and add a `database` field whose value is exactly `"ok"` or `"unavailable"`.
- **FR-004**: The `database` value MUST be `"ok"` only when a trivial read-only query (e.g. selecting a constant) succeeds during that request; any missing configuration, connection error, timeout or query error MUST give `"unavailable"`.
- **FR-005**: `/health` MUST return HTTP 200 in both database states.
- **FR-006**: The database check MUST be limited to at most 5 seconds, so a slow or sleeping database cannot block `/health` for longer.
- **FR-007**: Responses and logs MUST NOT include the connection string, password, or raw error messages from the database driver; a failure MAY be logged only as a generic message plus the error type.
- **FR-008**: Automated tests MUST cover AC2–AC5 by simulating the database as reachable and as unreachable, MUST include a test with `DATABASE_URL` unset, and MUST NOT need a real database, a `.env` file or network access.
- **FR-009**: `backend/README.md` MUST document how to create `backend/.env` with `DATABASE_URL` (Neon console → project → Connect → pooled connection string) using only a placeholder value, and `DEVELOPMENT.md` MUST link to it. The docs MUST remind that `.env` is git-ignored and must never be committed.

### Key Entities

- **Health status** (extended from TS-01): `status` (app status, `"ok"` when up), `version` (app version), `database` (`"ok"` or `"unavailable"`).
- **Database connection setting**: the single `DATABASE_URL` value, supplied by the environment; never stored in the repository.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A teammate can configure their local database connection and see `database: "ok"` in the health check in under 5 minutes by following only the documentation.
- **SC-002**: The health check always answers within 6 seconds, even when the database is unreachable.
- **SC-003**: 100% of the tests pass on a machine with no `.env` file and no network access, and the full suite completes in under 30 seconds.
- **SC-004**: A search of the repository and of the test and log output finds zero real connection strings or passwords.

## Assumptions

- The connection string is the **pooled** Neon string (D-29); the code turns on TLS itself, and the libpq SSL parameters in the string (`sslmode`, `channel_binding`) are ignored.
- `/health` returns HTTP 200 even when the database is unavailable, because `status` describes the app and the TS-01 contract stays backward compatible; cloud health probes that need a failure code are a concern for TS-10.
- `/health` remains public (no authentication), as in TS-01; it reveals only `"ok"` / `"unavailable"`, nothing about the database.
- One database check per `/health` request is acceptable at this scale; no caching of the result. Because each call wakes the database, frequent automatic callers of `/health` (e.g. cloud health probes) would keep Neon awake and use free compute hours (constitution, cost control); TS-10 must not configure such probes on `/health` unless it accepts that cost.
- The CI/CD use of the `DATABASE_URL` GitHub secret is configured in TS-09/TS-10; this story only makes the backend read the variable.
- The concrete database driver and how `.env` is loaded are chosen in the plan (simplest option, D-23).
