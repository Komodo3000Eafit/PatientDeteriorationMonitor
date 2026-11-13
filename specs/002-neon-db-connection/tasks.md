---

description: "Task list for TS-02 Neon database connection"
---

# Tasks: Neon Database Connection

**Input**: Design documents from `specs/002-neon-db-connection/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/health.md](contracts/health.md), [quickstart.md](quickstart.md)

**Tests**: MANDATORY. `/health` is an API endpoint and keeping credentials out of responses and logs is a security control (constitution Principle VII). AC2–AC6 each get at least one automated test; AC1 is covered by the URL tests plus quickstart step 5; AC7 is checked by hand.

**Organization**: This feature has one story (TS-02), so all story tasks carry the `[TS-02]` label.

## Format: `[ID] [P?] [Story] Description (agent)`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **(agent)**: Owner agent, at the end of the line
- All paths are relative to the repository root
- **No agent may print, read aloud or copy the contents of `backend/.env`.** Use it only by running the app.

---

## Phase 1: Setup

**Purpose**: Declare and install the new dependencies.

- [X] T001 In `backend/requirements.txt`, keep the four TS-01 lines unchanged and make the TS-02 lines exactly `sqlalchemy==2.1.8`, `pg8000==1.31.6`, `python-dotenv==1.2.4` (replace the `psycopg[binary]` line; no psycopg line may remain). Then, from `backend/` with the venv active, run `python -m pip uninstall -y psycopg psycopg-binary`, then `python -m pip install -r requirements.txt`, and confirm `python -c "import pg8000, sqlalchemy, dotenv"` succeeds (pg8000 is pure Python, so Windows Smart App Control doesn't block it; research R1, R2; DECISIONS D-31) (backend-dev)

---

## Phase 2: Foundational

None. TS-01 (merged) is the foundation this story builds on.

---

## Phase 3: TS-02 Neon database connection 🎯 MVP

**Goal**: The backend reads `DATABASE_URL`, checks the database with `SELECT 1`, and `GET /health` returns `{"status": "ok", "version": ..., "database": "ok" | "unavailable"}`, always with HTTP 200 and never exposing credentials.

**Independent Test**: From `backend/`, `python -m pytest` passes with no network. With the real pooled string in `backend/.env`, `Invoke-RestMethod http://127.0.0.1:8000/health` shows `database = ok`; with `$env:DATABASE_URL = " "` (one space) it shows `database = unavailable`.

### Implementation

- [X] T002 [TS-02] Create (or, if it already exists from the psycopg version, edit) `backend/app/db.py` (module docstring naming TS-02) containing:
  - imports exactly `from sqlalchemy import create_engine, text` (module-level names, so T008 can monkeypatch `app.db.create_engine`), plus `logging`, `os`, `ssl`, `pathlib.Path` and `from dotenv import load_dotenv`; no psycopg import;
  - at import: `load_dotenv(Path(__file__).resolve().parent.parent / ".env")` with the default `override=False` (a missing file is fine) and `logger = logging.getLogger(__name__)`; a module-level cached engine `_engine = None`;
  - `database_url() -> str | None`: read `os.environ.get("DATABASE_URL", "")`, strip it, return `None` if empty; replace a leading `postgresql://` or `postgres://` with `postgresql+pg8000://` and remove the `sslmode` and `channel_binding` query parameters (pg8000 rejects them), keeping user, password, host, path and any other query parameters unchanged (e.g. with `urllib.parse`); return a value with any other scheme as is (research R3; data-model "Missing or empty = not configured");
  - `get_engine()`: create the engine **once** on first call with `create_engine(url, connect_args={"ssl_context": ssl.create_default_context(), "timeout": 5}, pool_pre_ping=True)` and cache it in `_engine` (TLS with certificate and host-name checks; 5 s pg8000 socket timeout; research R3, R5, R6);
  - `reset_engine()`: dispose the cached engine if any and set it to `None` (used by tests);
  - `check_database() -> str`: return `"unavailable"` if `database_url()` is `None` without creating an engine; otherwise, inside `try`, `with get_engine().connect() as conn:` execute `text("SET LOCAL statement_timeout = '5s'")` then `text("SELECT 1")` and return `"ok"`; on **any** `Exception` log `logger.warning("Database check failed (%s)", type(exc).__name__)` and return `"unavailable"`. Never log or return the URL or the exception message (FR-002, FR-004, FR-006, FR-007; research R5–R7; data-model "`database` value rules").

  Add no settings class, ORM models, async code, retries or caching of the result (Principle XII; spec Clarifications) (backend-dev)
- [X] T003 [TS-02] Edit `backend/app/main.py`: import `Depends` from `fastapi` and `check_database` from `app.db`; change `/health` to `def health(database: str = Depends(check_database)) -> dict[str, str]` returning `{"status": "ok", "version": __version__, "database": database}` and update its docstring. Keep it a sync `def`; change nothing else (FR-003, FR-005; [contracts/health.md](contracts/health.md)) (backend-dev)
- [X] T004 [P] [TS-02] Edit `backend/README.md`: add a `## Database connection` section between "Setup" and "Run" that explains, with placeholders only:
  - the backend reads the connection string from the `DATABASE_URL` environment variable; locally it is loaded from `backend/.env`, which is git-ignored and must **never** be committed or shared in chat;
  - where to get the value: Neon console → project `patient-deterioration-monitor` → **Connect** → choose the **pooled** connection string → copy it unchanged (the code adapts the `postgresql://` prefix);
  - how to create the file: `backend/.env` with one line `DATABASE_URL=postgresql://<user>:<password>@ep-xxxx-pooler.<region>.aws.neon.tech/neondb?sslmode=require&channel_binding=require`;
  - that a `DATABASE_URL` already set in the terminal wins over the file, and the app still starts without it (`/health` then shows `database: unavailable`);
  - in CI/CD the value comes from the GitHub secret `DATABASE_URL` (D-29).

  Also update the "Run" section's expected `Invoke-RestMethod` output to show the `database` column (`ok` with a working `.env`), and note in "Test" that the tests need no database or `.env` (FR-009, AC7) (backend-dev)
- [X] T005 [P] [TS-02] Edit `DEVELOPMENT.md`: in section 7 "Never commit", change the `.env` bullet to `Passwords, API keys, tokens or `.env` files (e.g. `backend/.env` with `DATABASE_URL`)`; in section 8, change "Run the app locally (backend, frontend and database)" to add "— database setup: [backend/README.md](backend/README.md#database-connection)". Change nothing else (FR-009) (backend-dev)
- [X] T006 [TS-02] Validate locally per [quickstart.md](quickstart.md) steps 3, 4 and 5: with `$env:DATABASE_URL = " "` (one space; in Windows PowerShell 5.1 assigning `""` deletes the variable, so `backend/.env` would be loaded instead) → `database = unavailable`; with `$env:DATABASE_URL = "postgresql://user:pass@192.0.2.1/neondb?sslmode=require"` (an address that drops packets, so the 5 s connect timeout really runs) → `Measure-Command { Invoke-RestMethod http://127.0.0.1:8000/health }` takes about 5 s and under 6 s, and the response shows `unavailable` and the server log shows only `Database check failed (<ErrorType>)`; in a new terminal with the developer's existing `backend/.env` → `database = ok`. If `backend/.env` doesn't exist, report that step 5 is pending for the user instead of creating it. Fix T002–T005 if a step fails (AC1–AC5, SC-002) (backend-dev)

### Tests and review

- [X] T007 [TS-02] Create `backend/tests/conftest.py` with one `autouse` fixture that, before each test, calls `monkeypatch.delenv("DATABASE_URL", raising=False)` and `app.db.reset_engine()`, and after each test calls `app.db.reset_engine()` and `app.main.app.dependency_overrides.clear()`. Docstring: it guarantees no test reaches a real database even if a developer's `backend/.env` was loaded at import (FR-008, AC6; research R8) (qa-tester)
- [X] T008 [P] [TS-02] Create `backend/tests/test_db.py` with these tests, each with a docstring naming what it verifies, using `monkeypatch` and `caplog` and **no** real network. Every fake engine (or dummy object returned by a fake `create_engine`) MUST have a no-op `dispose()` method, because the conftest fixture calls `app.db.reset_engine()` after each test and that disposes the cached engine:
  - `test_database_url_converts_postgresql_scheme` (AC1): `postgresql://u:p@host/db?sslmode=require&channel_binding=require` → `postgresql+pg8000://u:p@host/db` (no `sslmode`, no `channel_binding`);
  - `test_database_url_converts_postgres_scheme` (AC1): `postgres://u:p@host/db` → `postgresql+pg8000://u:p@host/db`;
  - `test_database_url_removes_libpq_params_and_keeps_others` (AC1): `postgresql://u:p@host/db?sslmode=require&application_name=pdm&channel_binding=require` → `postgresql+pg8000://u:p@host/db?application_name=pdm`;
  - `test_get_engine_passes_tls_and_timeout` (FR-006, Principle VIII): set a `DATABASE_URL`, monkeypatch `app.db.create_engine` with a fake that records its arguments and returns a dummy object; call `app.db.get_engine()`; assert the recorded `connect_args` has an `ssl_context` that is an `ssl.SSLContext` and `timeout == 5`;
  - `test_database_url_missing_or_empty_is_none` (AC4): unset and `"   "` both give `None`;
  - `test_check_database_without_url_is_unavailable` (AC4): with no URL, returns `"unavailable"` and never calls `create_engine` (monkeypatch `app.db.create_engine` to fail the test if called);
  - `test_check_database_ok_when_query_succeeds` (AC2): monkeypatch `app.db.create_engine` to return a fake engine whose `connect()` is a context manager yielding a connection with a no-op `execute`; returns `"ok"`;
  - `test_check_database_connection_error_is_unavailable_and_logs_no_credentials` (AC3, AC5): URL `postgresql://user:s3cr3t-placeholder@db.example.invalid/neondb`; fake engine whose `connect()` raises `sqlalchemy.exc.OperationalError("could not connect: user:s3cr3t-placeholder@db.example.invalid", None, Exception())`; returns `"unavailable"`; `caplog.text` contains `OperationalError` and contains neither `s3cr3t-placeholder` nor `db.example.invalid`;
  - `test_check_database_malformed_url_is_unavailable` (edge case): `DATABASE_URL="not a url"` with the real `create_engine` → `"unavailable"`, no exception;
  - `test_check_database_recovers_on_next_call` (edge case): fake engine that raises on the first `connect()` and succeeds on the second → `"unavailable"` then `"ok"`.

  (FR-002, FR-004, FR-007, FR-008) (qa-tester)
- [X] T009 [P] [TS-02] Edit `backend/tests/test_health.py` (keep `test_health_version_consistency`, `test_unknown_path_returns_404` and `test_health_rejects_post` unchanged; update the module docstring to cite both TS-01 and TS-02 contracts):
  - `test_health_returns_ok_and_version` (TS-01 AC1, TS-02 AC2): set `app.main.app.dependency_overrides[app.db.check_database] = lambda: "ok"`; status 200, JSON exactly `{"status": "ok", "version": app.__version__, "database": "ok"}`;
  - new `test_health_reports_database_unavailable` (AC3): override returns `"unavailable"`; status 200, `status == "ok"`, `database == "unavailable"`;
  - new `test_health_without_database_url` (AC4): no override (conftest removed the URL); status 200, `database == "unavailable"`;
  - `test_health_exposes_no_internal_details` (AC5): keys are exactly `{"status", "version", "database"}`.

  (FR-003, FR-005, FR-007) (qa-tester)
- [X] T010 [TS-02] From `backend/`, run `python -m pytest` and confirm all tests pass in under 30 s (SC-003); keep the output for the PR description (DECISIONS D-27). Then run quickstart step 6 (`git status`, `git grep -n "npg_"`, `git grep -n -E "ep-[a-z]+-[a-z]+-[a-z0-9]{8}(-pooler)?\.[a-z0-9-]+\.aws\.neon\.tech"`) and confirm `backend/.env` is not listed and both searches find nothing (AC6, SC-004) (qa-tester)
- [X] T011 [TS-02] Review read-only `backend/app/db.py`, `backend/app/main.py`, the tests and the docs: `DATABASE_URL` is the only source of the connection string; no credential, real host or `npg_` value in code, tests or docs; failures are logged only by error type; `/health` returns only the three fields; `.env` loading doesn't override real environment variables; dependencies are pinned. Report findings; don't change code (Principles VI, VIII). The dependency vulnerability scan runs in CI from TS-09 on (DECISIONS D-27) (security-reviewer)

**Checkpoint**: TS-02 is complete. TS-03 can reuse `app.db.database_url()` and `get_engine()` for tables and migrations.

---

## Phase 4: Polish

- [X] T012 Edit `docs/PROJECT_STATUS.md`: set "Last updated" to the current date; in step 11's notes mark TS-02 ✅ and set "Next: TS-03 (tables + migrations)"; set "Next step" to TS-03; rewrite the "Where we left off" note so step 1 says TS-02 is done and remind that TS-10 must not point frequent health probes at `/health` (spec Clarifications). In `docs/BACKLOG.md`, link this feature in TS-02's Spec column. Set Status ✅ only when the PR is merged. In `docs/DECISIONS.md`, add entry **D-30** directly above D-31, so the table stays in number order (date of the change, Status "Active"): decision — `/health` returns HTTP 200 with a `database` field (`"ok"` / `"unavailable"`) and checks the database on every call (no caching); TS-10 must not point frequent automatic probes at `/health` unless the team accepts the Neon compute cost; reason — `status` describes the app and keeps the TS-01 contract backward compatible, the per-call check is the simplest option (D-23), and each check wakes Neon (constitution, cost control; TS-02 spec Clarifications) (orchestrator)

---

## Dependencies & Execution Order

- **T001** (Setup): no dependencies; needed before running anything.
- **T002**: depends on T001 (imports SQLAlchemy and python-dotenv).
- **T003**: depends on T002 (imports `check_database`).
- **T004, T005**: depend only on the plan; can run in parallel with T002–T003.
- **T006**: depends on T001–T005.
- **T007**: depends on T002 (`reset_engine`) and T003.
- **T008, T009**: depend on T007; can run in parallel with each other (different files).
- **T010**: depends on T007–T009.
- **T011**: depends on T001–T010.
- **T012**: last; depends on T011.
- **Story dependencies**: TS-01 only (merged), per docs/BACKLOG.md.

## Parallel Example

```text
# Round 1 (backend-dev), after T001:
Task: "Create backend/app/db.py (T002)"
Task: "Add Database connection section to backend/README.md (T004)"
Task: "Update DEVELOPMENT.md never-commit and demo items (T005)"

# Round 2 (qa-tester), after T007:
Task: "Create backend/tests/test_db.py (T008)"
Task: "Update backend/tests/test_health.py (T009)"
```

## Implementation Strategy

TS-02 is the whole MVP: T001 → T002 → T003 → T006 → T007 → T008/T009 → T010 → T011 → T012, with T004 and T005 alongside. Stop after T010 to confirm the tests pass before the security review. After that, commit (`TS-02: Neon database connection and database status in /health`), push and open the PR. Until TS-09 adds CI, paste the local `python -m pytest` output into the PR description (DECISIONS D-27). The PR includes the agent activity log (`specs/002-neon-db-connection/agent-log.csv`, via `scripts/log-agent.ps1`).

## Notes

- The orchestrator assigns each task to its agent and logs `assigned` / `started` / `done` rows (see `docs/agents.md`).
- Testing runs after implementation, as the project template orders it (qa-tester, then security-reviewer). It doesn't use test-first order.
- Do not add anything not listed here (Principle XII): no settings module, ORM models, migrations, async engine, retries, result caching or new folders.
