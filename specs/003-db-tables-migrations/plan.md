# Implementation Plan: Database Tables and Migrations

**Branch**: `003-db-tables-migrations` | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-db-tables-migrations/spec.md`

## Summary

TS-03 adds the five tables (`users`, `patients`, `vital_signs`, `triage_events`, `alerts`) and versions them with **Alembic**. SQLAlchemy 2.x declarative models live in `backend/app/models.py`, with a naming convention so every constraint has a fixed name. One hand-written revision, `0001_initial_schema`, creates and drops the same tables and constraints. Allowed-value lists are `VARCHAR` + `CHECK`, triage levels are plain `SMALLINT` 1–5, foreign keys are `ON DELETE RESTRICT`. `migrations/env.py` takes the connection from TS-02's `app.db` (`DATABASE_URL` only, pg8000, TLS context, timeouts); `alembic.ini` holds no URL, and connection failures print only a generic message. The pooled Neon string works for Alembic because the whole upgrade runs in one transaction (research R3). Tests check the models' metadata and the offline (`--sql`) upgrade/downgrade output with no database; the real database is checked once by hand on Neon (quickstart steps 4–8). `backend/README.md` documents the commands.

## Technical Context

**Language/Version**: Python 3.13

**Primary Dependencies**: FastAPI 0.162.4, SQLAlchemy 2.1.8, pg8000 1.31.6, python-dotenv 1.2.4 (existing); new, pinned with `==`: **alembic 1.20.1** (brings Mako 1.4.3 and MarkupSafe 3.0.4, research R2)

**Storage**: PostgreSQL on Neon, project `patient-deterioration-monitor`, database `neondb`, pooled connection (D-29); 5 new tables + `alembic_version`

**Testing**: pytest 9.2.0; `Base.metadata` inspection; `alembic.command` in offline mode (`sql=True`) with an output buffer; `monkeypatch`; no real database or network (TS-02 `conftest.py`)

**Target Platform**: Developer machines on Windows (PowerShell); Azure App Service later (TS-10)

**Project Type**: Web service (backend half of the web application)

**Performance Goals**: upgrade on an empty database in under 2 minutes including Neon wake-up (SC-001); test suite under 30 s (SC-003)

**Constraints**: connection only from `DATABASE_URL`, no URL in `alembic.ini` (FR-004); no credentials in output; offline tests; pip + venv only; Smart App Control (D-31)

**Scale/Scope**: 1 new module (`models.py`), Alembic config + `env.py` + 1 revision, 2 new test files, 1 new pinned dependency, README section

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] I. Spec-driven and traceable: every file maps to an FR/AC (traceability table below); tests name the AC they verify
- [x] II. Small Scrum story: one story; one models file, one revision, two test files
- [x] III. Independence: depends only on TS-02, as in docs/BACKLOG.md; extends technical-story code only (`app.db` is reused, not changed)
- [x] IV. Multi-agent: backend-dev writes models, Alembic setup, the revision, the dependency and README; qa-tester writes the two test files; security-reviewer reviews credential handling in env.py, error output and the quickstart snippet; devops is not needed. The manual Neon run (quickstart 4–8) is done by the developer with Claude Code (Neon MCP for listing tables). Logged in `agent-log.csv`; owners in tasks.md
- [x] V. Clinical logic: no scoring here; triage levels are plain 1–5 with no NEWS2 rules in the schema (D-08); `triage_events.reason` stores the explanation required by Principle V
- [x] VI. Data privacy: no data inserted (seed data is TS-06/TS-08); no real-identity columns (FR-013); only `password_hash`; connection string only in the environment
- [ ] VII. Tests: schema and migrations have automated tests. **Exception**: CI and the dependency vulnerability check don't exist until TS-09 (Complexity Tracking, D-27)
- [x] VIII. Security baseline: no endpoints; secrets only from `DATABASE_URL`; database-level validation of allowed values and relationships; generic error on connection failure (no driver text)
- [x] IX. Deployable at low cost: Neon free plan; migrations run by hand only, nothing keeps the database awake
- [x] X. Stack: Python + PostgreSQL; Alembic is SQLAlchemy's own migration tool
- [x] XI. Language: code and docs in English; no UI
- [x] XII. Simplicity: one models file, one hand-written revision, no ORM relationships, no enum types, no second connection setting, no automatic migration on start

**Post-design re-check (after Phase 1)**: all items still pass. The design adds only what the spec asks for; the pooled-vs-direct question is settled without a second setting (research R3).

## Project Structure

### Documentation (this feature)

```text
specs/003-db-tables-migrations/
├── spec.md
├── plan.md                      # This file
├── research.md                  # Phase 0
├── data-model.md                # Phase 1: the five tables
├── quickstart.md                # Phase 1: tests + manual Neon verification (AC7, AC8)
├── contracts/
│   └── migration-commands.md    # Phase 1: alembic commands, messages, exit codes
├── checklists/
│   └── requirements.md
└── tasks.md                     # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── alembic.ini                  # NEW: script_location=%(here)s/migrations, prepend_sys_path=%(here)s, NO sqlalchemy.url, default logging
├── migrations/
│   ├── env.py                   # NEW: URL/engine from app.db; offline = dialect "postgresql"; target_metadata = Base.metadata; generic errors
│   ├── script.py.mako           # NEW: Alembic's default revision template
│   └── versions/
│       └── 0001_initial_schema.py   # NEW: hand-written create/drop of the 5 tables
├── app/
│   ├── db.py                    # unchanged (TS-02): database_url(), get_engine()
│   └── models.py                # NEW: Base (naming convention) + User, Patient, VitalSign, TriageEvent, Alert
├── tests/
│   ├── conftest.py              # unchanged (removes DATABASE_URL, resets engine)
│   ├── test_models.py           # NEW: metadata checks (tables, columns, nullability, FKs, unique, CHECKs)
│   └── test_migrations.py       # NEW: offline upgrade/downgrade SQL, single head, error messages
├── requirements.txt             # CHANGED: + alembic==1.20.1
└── README.md                    # CHANGED: "Database migrations" section

docs/PROJECT_STATUS.md           # CHANGED: TS-03 done, applied to Neon and verified
docs/BACKLOG.md                  # CHANGED: TS-03 spec link and status
```

**Structure Decision**: Alembic's standard layout inside `backend/` (`alembic.ini` + `migrations/`), so every command runs from `backend/` like the existing ones. All models in one file. `app/db.py` is reused as is, so the app and the migrations connect the same way.

### Design notes

- **env.py online**: `url = app.db.database_url()`; `None` → `raise SystemExit("DATABASE_URL is not set")`. Then `connectable = app.db.get_engine()`; opening the connection is wrapped so any error becomes `SystemExit(f"Could not connect to the database ({type(exc).__name__})")` raised `from None`. `context.configure(connection=..., target_metadata=Base.metadata)`, then `with context.begin_transaction(): context.run_migrations()` (one transaction, research R3).
- **env.py offline**: `context.configure(dialect_name="postgresql", target_metadata=Base.metadata, literal_binds=True)`; never reads `DATABASE_URL`.
- **models.py**: `class Base(DeclarativeBase)` with `metadata = MetaData(naming_convention={...})` (research R5); CHECK constraints declared in `__table_args__` with short names (`role`, `triage_level`, ...) that the convention expands to `ck_<table>_<name>`. Columns and rules exactly as [data-model.md](data-model.md).
- **Revision**: `revision = "0001_initial_schema"`, uses `op.create_table` with `sa.Identity()`, `sa.CheckConstraint(..., name=op.f("ck_..."))`, `sa.ForeignKeyConstraint(..., ondelete="RESTRICT")`; full names passed through `op.f()` so the convention isn't applied twice.
- **Tests** read `alembic.ini` by absolute path (`Path(__file__).parents[1] / "alembic.ini"`) and set `cfg.output_buffer` to a `StringIO` to capture offline SQL.

### Traceability

| Requirement / AC | Delivered by |
|---|---|
| FR-001, AC1 | `migrations/versions/0001_initial_schema.py`; `test_migrations.py` upgrade SQL; quickstart 4 |
| FR-002, AC2 | Alembic version table; `test_migrations.py` single head; quickstart 5 |
| FR-003, AC3 | `downgrade()`; `test_migrations.py` downgrade SQL; quickstart 8 |
| FR-004 | `env.py` reads `app.db` only, generic errors; `alembic.ini` without URL; `test_migrations.py` missing-URL and connection-failure tests; quickstart 9 |
| FR-005, AC4 | FKs `ON DELETE RESTRICT` in models + revision; `test_models.py` FK checks; quickstart 7 |
| FR-006, FR-007, AC5 | Named CHECK constraints; `test_models.py` CHECK checks; quickstart 7 |
| FR-008, FR-009 | Unique constraints, `password_hash` only, `NOT NULL`; `test_models.py` |
| FR-010 | `timestamptz` + `server_default now()`; `test_models.py` |
| FR-011, AC6, SC-003 | `test_models.py`, `test_migrations.py`, existing `conftest.py`; quickstart 2 |
| FR-012, AC9 | `backend/README.md` "Database migrations"; quickstart; `docs/PROJECT_STATUS.md` |
| FR-013 | No identity columns; `test_models.py` column-set check |
| AC7, AC8, SC-001, SC-002, SC-005 | Manual run on Neon: quickstart 4–8 and 10, outputs pasted in the PR |
| Edge cases (no URL / unreachable, failure halfway, initial event without previous level, system events without user, delete restricted, Neon asleep) | env.py errors; single transaction; nullable `previous_level`, `created_by_id`; RESTRICT FKs; pg8000 timeouts (research R4) |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle VII and Workflow step 5 require tests and a dependency check to run in CI before merge, but CI doesn't exist until TS-09 | TS-01 to TS-08 must be merged before the CI pipeline story | Same as TS-01/TS-02: until TS-09 is merged, the PR includes the local `python -m pytest` output, and the dependency vulnerability check is done by TS-09 (DECISIONS D-27) |
