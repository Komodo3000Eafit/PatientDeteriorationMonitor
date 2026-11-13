# Research: Neon Database Connection (TS-02)

The technical context had no open questions: the stack came with the `/speckit-plan` input. This file records the decisions and the reasons for them.

## R1. Database library and driver

- **Decision**: SQLAlchemy 2.x **Core** (`create_engine` + `text()`), driver **psycopg 3** (`psycopg[binary]`). No ORM models in this story.
- **Rationale**: TS-03 will most likely use Alembic, which is built on SQLAlchemy, so the same engine and URL serve both stories. psycopg 3 is the maintained PostgreSQL driver; the `binary` extra ships a pre-built libpq, so Windows laptops need no compiler or PostgreSQL install.
- **Alternatives considered**: plain psycopg without SQLAlchemy (simplest today, but TS-03 would have to add SQLAlchemy and rewire the connection), asyncpg / async SQLAlchemy (async adds complexity the app doesn't need; FastAPI runs sync endpoints in a thread pool), psycopg2 (older driver, in maintenance mode).

## R2. Pinned versions (latest on PyPI, 2026-11-13)

| Package | Version | Why |
|---|---|---|
| sqlalchemy | 2.1.8 | Engine and `text()` queries; base for Alembic in TS-03 |
| psycopg[binary] | 3.3.9 | PostgreSQL driver with bundled libpq |
| python-dotenv | 1.2.4 | Loads `backend/.env` for local development |

- **Decision**: Added to the single `backend/requirements.txt` with `==` pins, as in TS-01 (R1/R2 of TS-01).

## R3. Connection string format

- **Decision**: The team pastes the Neon **pooled** string unchanged (`postgresql://user:password@host-pooler.region.aws.neon.tech/neondb?sslmode=require&channel_binding=require`). The code replaces a leading `postgresql://` (or `postgres://`) with `postgresql+psycopg://`; everything after the scheme, including `sslmode` and `channel_binding`, is kept as is.
- **Rationale**: SQLAlchemy uses psycopg2 for a bare `postgresql://` URL. Converting in code means nobody edits the string by hand, and the same value works in `backend/.env`, the GitHub secret (D-29) and Azure App Service settings (TS-10). psycopg 3 passes `sslmode` and `channel_binding` to libpq, which supports both.
- **Alternatives considered**: asking the team to write `postgresql+psycopg://` themselves (easy to forget, and the GitHub secret already holds the Neon format), a separate setting per URL part (more variables, more mistakes).

## R4. Loading `backend/.env`

- **Decision**: `load_dotenv(<backend folder>/.env)` once at import time, with the default `override=False`. A missing file is silently ignored (python-dotenv's default).
- **Rationale**: An explicit path works no matter which folder uvicorn or pytest is started from. `override=False` means a real environment variable (CI, Azure) always wins over the file.
- **Alternatives considered**: `find_dotenv()` (searches up from the caller; less predictable), a settings library such as pydantic-settings (one more dependency and a settings class for a single variable; Principle XII).

## R5. Lazy engine and the database check

- **Decision**: A module `app/db.py` holds one cached engine, created on the **first** check, not at import or startup. The check `check_database()` returns `"ok"` or `"unavailable"`:
  1. `DATABASE_URL` missing or empty → `"unavailable"` (no engine, no network).
  2. Otherwise create the engine (once), open a connection, run `SET LOCAL statement_timeout = '5s'` and `SELECT 1` in one short transaction → `"ok"`.
  3. **Any** exception (bad URL, DNS, timeout, auth, query error) → `"unavailable"`.
- **Rationale**: The app starts even with no or a wrong `DATABASE_URL` (FR-002). The engine is reused across calls, so its connection pool works, and a database that comes back is detected on the next call (spec edge case). Catching every exception is acceptable here because the only outcome is the status word and a generic log line.
- **Alternatives considered**: creating the engine at startup (a bad URL would crash startup, against FR-002), a FastAPI lifespan handler (more code for the same effect), caching the result (rejected in clarification, Session 2026-11-13).

## R6. Timeouts (FR-006, SC-002)

- **Decision**: `connect_args={"connect_timeout": 5}` on the engine (libpq connect limit), plus `SET LOCAL statement_timeout = '5s'` inside the check's transaction. `pool_pre_ping=True` so a connection the pooler or Neon closed while idle is replaced instead of failing the check.
- **Rationale**: The connect timeout covers the real risks (database asleep, unreachable host). `SET LOCAL` works through Neon's pooler (PgBouncer, transaction mode), where the `options=-c statement_timeout=...` startup parameter is not supported.
- **Limitation**: libpq applies `connect_timeout` per host address tried; if DNS returns several addresses the worst case can exceed 5 s. That is acceptable for this scope and is checked by hand in quickstart step 4.
- **Alternatives considered**: a thread with its own timer around the whole check (more code, harder to test), no statement timeout (`SELECT 1` can't really hang, but the setting is one line and makes FR-006 explicit).

## R7. Keeping credentials out of logs and responses (FR-007, AC5)

- **Decision**: On failure, log `logger.warning("Database check failed (%s)", type(exc).__name__)` with the standard `logging` module, and never the exception message. `/health` returns only the status word. The engine uses the default `echo=False`.
- **Rationale**: Driver error messages can include the host name and user name; the type name (`OperationalError`, `ArgumentError`, ...) is enough to debug. SQLAlchemy's own URL `repr` hides the password, but the code never logs the URL anyway.
- **Alternatives considered**: logging a cleaned message (cleaning text reliably is harder than not logging it), no log at all (makes local problems hard to diagnose).

## R8. Testing without a database (FR-008, AC6)

- **Decision**:
  - `/health` gets the status through a FastAPI dependency (`Depends(check_database)`). Endpoint tests replace it with `app.dependency_overrides` to return `"ok"` or `"unavailable"` (AC2, AC3).
  - `check_database()` itself is tested directly: with `DATABASE_URL` unset (AC4), and with `app.db`'s engine factory monkeypatched to an object whose `connect()` raises (AC3, AC5); `caplog` confirms the log line has no URL or password.
  - A `tests/conftest.py` autouse fixture removes `DATABASE_URL` from the environment and resets the cached engine before every test, so no test can reach the real database even if a developer's `backend/.env` was loaded at import.
- **Rationale**: Covers both database states and the missing-URL case with no network, no `.env` and no real database. The conftest fixture is the one guard that keeps a teammate's real `.env` out of the tests.
- **Alternatives considered**: a test PostgreSQL container or SQLite (needs Docker or behaves differently from PostgreSQL), mocking at the psycopg level (more fragile than replacing the engine factory).

## R9. TS-01 tests

- **Decision**: Update the two TS-01 tests that check the exact `/health` body (`test_health_returns_ok_and_version`, `test_health_exposes_no_internal_details`) to expect the new `database` field. The 404, 405 and version tests stay unchanged.
- **Rationale**: The spec extends the TS-01 contract (FR-003); the old exact-body assertions would otherwise fail. This is a technical story changing technical-story code, which Principle III allows.
