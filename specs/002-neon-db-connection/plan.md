# Implementation Plan: Neon Database Connection

**Branch**: `002-neon-db-connection` | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-neon-db-connection/spec.md`

## Summary

TS-02 connects the FastAPI backend to the Neon PostgreSQL database. A new module `backend/app/db.py` loads `backend/.env` if present, reads `DATABASE_URL`, converts the Neon `postgresql://` scheme to `postgresql+pg8000://` (dropping the libpq-only `sslmode` / `channel_binding` parameters and requiring TLS through an SSL context), and creates one SQLAlchemy Core engine lazily, on the first check. `check_database()` runs `SELECT 1` with 5 s connect and statement timeouts and returns `"ok"` or `"unavailable"`; any failure is logged only by error type. `GET /health` keeps `status` and `version` and adds `database`, getting the value through a FastAPI dependency so tests can replace it. Tests use `TestClient`, dependency overrides and a monkeypatched engine factory; a `conftest.py` fixture removes `DATABASE_URL` so no test reaches a real database. `backend/README.md` explains how to create `backend/.env` from the Neon console with placeholder values only, and `DEVELOPMENT.md` links to it.

## Technical Context

**Language/Version**: Python 3.13

**Primary Dependencies**: FastAPI 0.162.4 (existing); new, pinned with `==`: SQLAlchemy 2.1.8 (Core only), pg8000 1.31.6 (pure-Python driver; psycopg's compiled `.pyd` is blocked by Windows Smart App Control, D-31), python-dotenv 1.2.4

**Storage**: PostgreSQL on Neon (project `patient-deterioration-monitor`, pooled connection, D-29); no tables in this story

**Testing**: pytest 9.2.0 + FastAPI `TestClient`; `dependency_overrides`, `monkeypatch`, `caplog`; no real database or network

**Target Platform**: Developer machines on Windows (PowerShell); Azure App Service later (TS-10); the code is OS-independent

**Project Type**: Web service (backend half of the web application)

**Performance Goals**: `/health` answers within 6 s even when the database is unreachable (SC-002); test suite under 30 s (SC-003)

**Constraints**: Connection string only from `DATABASE_URL` (FR-001); app starts without the database (FR-002); 5 s check limit (FR-006); no credentials in responses or logs (FR-007); pip + venv only

**Scale/Scope**: 1 new module, 1 changed endpoint, 1 new test file + `conftest.py`, 1 changed test file, 3 new pinned dependencies, 2 docs

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] I. Spec-driven and traceable: every file maps to an FR/AC (see the traceability table below); tests name the AC they verify
- [x] II. Small Scrum story: one story, ~7 small files
- [x] III. Independence: depends only on TS-01, as in docs/BACKLOG.md; changes only technical-story code (TS-01's `/health` and its tests)
- [x] IV. Multi-agent: backend-dev builds `db.py`, the endpoint change, dependencies and docs; qa-tester writes and updates the tests; security-reviewer reviews secrets handling and logging; logged in `agent-log.csv` (owners assigned in tasks.md)
- [x] V. Clinical logic: N/A, no clinical logic in this story
- [x] VI. Data privacy: no data; the connection string lives only in the environment, `backend/.env` is git-ignored, docs use placeholders
- [ ] VII. Tests: the changed endpoint and the database check have automated tests. **Exception**: CI and the dependency vulnerability check don't exist until TS-09 (see Complexity Tracking, DECISIONS D-27)
- [x] VIII. Security baseline: `/health` takes no input; the secret comes only from an environment variable (GitHub secret in CI); safe error handling: no driver messages in responses or logs; auth and CORS out of scope (TS-06, TS-04)
- [x] IX. Deployable at low cost: Neon free plan; no new services; the per-request check's effect on Neon compute is documented for TS-10 (spec Clarifications)
- [x] X. Stack: Python + FastAPI + PostgreSQL
- [x] XI. Language: code and docs in English; no UI in this story
- [x] XII. Simplicity: one module and one function; SQLAlchemy Core only (no ORM, no async, no settings library); the only new libraries are the ones TS-03 needs anyway plus python-dotenv for `.env`

**Post-design re-check (after Phase 1)**: all items still pass. The design adds one module and a test fixture, nothing beyond the spec.

## Project Structure

### Documentation (this feature)

```text
specs/002-neon-db-connection/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── health.md        # Phase 1: GET /health contract (extends TS-01)
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── __init__.py      # unchanged (__version__)
│   ├── db.py            # NEW: load .env, read DATABASE_URL, URL scheme conversion, lazy engine, check_database()
│   └── main.py          # CHANGED: /health adds "database" via Depends(check_database)
├── tests/
│   ├── conftest.py      # NEW: autouse fixture: remove DATABASE_URL, reset cached engine
│   ├── test_db.py       # NEW: check_database() and URL conversion tests
│   └── test_health.py   # CHANGED: expect "database"; ok / unavailable via dependency override
├── requirements.txt     # CHANGED: + sqlalchemy, pg8000, python-dotenv (pinned)
└── README.md            # CHANGED: "Database connection" section (backend/.env, placeholder only)

DEVELOPMENT.md           # CHANGED: link to the README database section; .env never committed
```

**Structure Decision**: Same backend layout as TS-01. All database code goes in one file, `app/db.py`, which TS-03 can extend (Alembic will reuse its URL conversion and engine). No `models/`, `services/` or settings module yet (Principle XII). `.env` is loaded in `db.py` because it is the only code that reads configuration.

### Design notes

- `db.py` public names: `database_url()` (reads `DATABASE_URL`, returns `None` if missing or empty, replaces a leading `postgresql://` / `postgres://` with `postgresql+pg8000://` and removes the `sslmode` and `channel_binding` query parameters, which pg8000 doesn't accept), `get_engine()` (creates the engine once with `connect_args={"ssl_context": ssl.create_default_context(), "timeout": 5}` — TLS with certificate checks, and pg8000's 5 s socket timeout — and `pool_pre_ping=True`), `check_database()` (returns `"ok"` / `"unavailable"`), and a small reset used by tests. Details in [research.md](research.md) R3–R7.
- `/health` stays a sync endpoint, so FastAPI runs the blocking check in its thread pool.
- Failure log line: `Database check failed (<ExceptionType>)`, level WARNING, never the message or URL.

### Traceability

| Requirement / AC | Delivered by |
|---|---|
| FR-001, AC1 | `app/db.py` loads `backend/.env` (no override of real env vars) and reads only `DATABASE_URL`; `test_db.py` URL conversion tests; README/quickstart step 5 |
| FR-002, AC4 | Lazy engine in `app/db.py`; `test_db.py` missing-URL test; `test_health.py` runs with no URL; quickstart step 3 |
| FR-003, AC2 | `/health` in `app/main.py`; `test_health.py` with override `"ok"` |
| FR-004, FR-005, AC3 | `check_database()` catches every error; `test_db.py` connection-error test; `test_health.py` with override `"unavailable"` (status 200) |
| FR-006, SC-002 | pg8000 `timeout` connect arg + `SET LOCAL statement_timeout`; quickstart step 4 (timed by hand) |
| FR-007, AC5 | Log only the error type; `test_db.py` checks with `caplog` that no URL or password is logged; `test_health.py` exact key set |
| FR-008, AC6 | `conftest.py` + overrides + monkeypatch; quickstart step 2 |
| FR-009, AC7 | `backend/README.md` "Database connection" section + link in `DEVELOPMENT.md`; checked by hand (quickstart step 5) |
| SC-004 | Placeholders only in docs; quickstart step 6 searches; security-reviewer |
| Edge cases (malformed URL, slow DB, recovery, 404/405) | `check_database()` per request + `test_db.py` malformed-URL test; TS-01 404/405 tests unchanged |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle VII and Workflow step 5 require tests and a dependency check to run in CI before merge, but CI doesn't exist until TS-09 | TS-01 to TS-08 must be merged before the CI pipeline story | Same as TS-01: until TS-09 is merged, the PR includes the local `python -m pytest` output, and the dependency vulnerability check is done by TS-09 (DECISIONS D-27) |
