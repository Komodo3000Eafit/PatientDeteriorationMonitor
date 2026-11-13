---

description: "Task list for TS-03 database tables and migrations"
---

# Tasks: Database Tables and Migrations

**Input**: Design documents from `specs/003-db-tables-migrations/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/migration-commands.md](contracts/migration-commands.md), [quickstart.md](quickstart.md)

**Tests**: MANDATORY. The schema enforces the data rules every later story relies on, and keeping credentials out of migration output is a security control (constitution Principle VII). AC1, AC3–AC6 and FR-004 get automated tests without a database; AC2, AC7 and AC8 are checked once by hand on Neon (spec Clarifications); AC9 is checked by review.

**Organization**: This feature has one story (TS-03), so all story tasks carry the `[TS-03]` label.

## Format: `[ID] [P?] [Story] Description (agent)`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **(agent)**: Owner agent, at the end of the line
- All paths are relative to the repository root
- **No agent may print, read aloud or copy the contents of `backend/.env` or the value of `DATABASE_URL`.** Use them only by running `alembic` or `app.db`.

---

## Phase 1: Setup

**Purpose**: Declare and install the new dependency.

- [ ] T001 In `backend/requirements.txt`, add one line `alembic==1.20.1` at the end and change nothing else (no pins for its indirect dependencies Mako and MarkupSafe; locking is TS-09). From `backend/` with the venv active run `python -m pip install -r requirements.txt`, then `alembic --help` and confirm it prints the command list (Smart App Control check for MarkupSafe's optional compiled file; research R2, D-31) (backend-dev)

---

## Phase 2: Foundational

None. TS-02 (merged) provides `app.db.database_url()` and `app.db.get_engine()`, which this story reuses **unchanged**.

---

## Phase 3: TS-03 Database tables and migrations 🎯 MVP

**Goal**: `alembic upgrade head` creates the five tables with all relationships and rules on the database in `DATABASE_URL`; `alembic downgrade base` drops them; no command prints credentials.

**Independent Test**: From `backend/`, `python -m pytest` passes with no network and no `.env`; `alembic upgrade head --sql` prints the five `CREATE TABLE` statements. With `backend/.env`, quickstart steps 4–8 pass on Neon.

### Implementation

- [ ] T002 [P] [TS-03] Create `backend/app/models.py` (module docstring naming TS-03 and pointing to `specs/003-db-tables-migrations/data-model.md`) with SQLAlchemy 2.x declarative models, **no** `relationship()`s, exactly as [data-model.md](data-model.md):
  - `class Base(DeclarativeBase)` with `metadata = MetaData(naming_convention={"pk": "pk_%(table_name)s", "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s", "uq": "uq_%(table_name)s_%(column_0_name)s", "ck": "ck_%(table_name)s_%(constraint_name)s"})` (research R5);
  - every table: `id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)`; every column `NOT NULL` unless listed as nullable below; every `ForeignKey(..., ondelete="RESTRICT")`; every timestamp `DateTime(timezone=True)`; "default now" = `server_default=func.now()`; CHECK constraints in `__table_args__` as `CheckConstraint(<sql>, name="<short>")` so the convention gives `ck_<table>_<short>`;
  - `User` → `users`: `username` `String(50)`, `unique=True`; `password_hash` `String(255)` (hash only; no `password` column); `full_name` `String(100)`; `role` `String(10)`, check `role`: `role IN ('doctor', 'nurse')`; `created_at` default now;
  - `Patient` → `patients`: `identifier` `String(20)`, `unique=True`; `name` `String(100)`; `age` `SmallInteger`, check `age`: `age BETWEEN 0 AND 130`; `sex` `String(10)`, check `sex`: `sex IN ('female', 'male', 'other')`; `admitted_at` default now; `triage_level` `SmallInteger`, check `triage_level`: `triage_level BETWEEN 1 AND 5`; `status` `String(20)`, `server_default="active"`, check `status`: `status IN ('active', 'discharged')`. No other columns (FR-013);
  - `VitalSign` → `vital_signs`: `patient_id` FK `patients.id`; `recorded_at` default now; `respiratory_rate` `SmallInteger`, check `respiratory_rate`: `respiratory_rate >= 0`; `spo2` `SmallInteger`, check `spo2`: `spo2 BETWEEN 0 AND 100`; `on_oxygen` `Boolean`; `systolic_bp` `SmallInteger`, check `systolic_bp`: `systolic_bp >= 0`; `heart_rate` `SmallInteger`, check `heart_rate`: `heart_rate >= 0`; `consciousness` `String(1)`, check `consciousness`: `consciousness IN ('A', 'C', 'V', 'P', 'U')`; `temperature` `Numeric(3, 1)` (no bounds);
  - `TriageEvent` → `triage_events`: `patient_id` FK `patients.id`; `occurred_at` default now; `previous_level` `SmallInteger`, **nullable**, check `previous_level`: `previous_level BETWEEN 1 AND 5`; `new_level` `SmallInteger`, check `new_level`: `new_level BETWEEN 1 AND 5`; `score` `SmallInteger`, **nullable**, check `score`: `score >= 0`; `reason` `Text`; `source` `String(10)`, check `source`: `source IN ('initial', 'automatic', 'manual')`; `created_by_id` FK `users.id`, **nullable**;
  - `Alert` → `alerts`: `patient_id` FK `patients.id`; `created_at` default now; `severity` `String(10)`, check `severity`: `severity IN ('low', 'medium', 'high')`; `message` `Text`; `status` `String(20)`, `server_default="open"`, check `status`: `status IN ('open', 'acknowledged')`; `acknowledged_by_id` FK `users.id`, **nullable**; `acknowledged_at` timestamp, **nullable**, no default.

  (FR-005 to FR-010, FR-013) (backend-dev)
- [ ] T003 [P] [TS-03] Create `backend/alembic.ini` with `[alembic]` `script_location = %(here)s/migrations`, `prepend_sys_path = %(here)s`, `path_separator = os`, **no** `sqlalchemy.url` line (comment: "The URL comes only from DATABASE_URL through app.db; never put it here"), and Alembic's default `[loggers]`/`[handlers]`/`[formatters]` sections (root WARN, sqlalchemy WARN, alembic INFO). Create `backend/migrations/script.py.mako` with Alembic's default generic revision template (research R4) (backend-dev)
- [ ] T004 [TS-03] Create `backend/migrations/env.py` (docstring naming TS-03, research R4), depends on T002, T003:
  - `import app.db` (module import, **not** `from app.db import ...`, so tests can monkeypatch `app.db.get_engine`) and `from app.models import Base`; `target_metadata = Base.metadata`;
  - if `config.config_file_name` is set, call `fileConfig(config.config_file_name, disable_existing_loggers=False)` (otherwise it would silence the `app.db` logger that TS-02's tests check);
  - offline (`context.is_offline_mode()`): `context.configure(dialect_name="postgresql", target_metadata=target_metadata, literal_binds=True)`, then `with context.begin_transaction(): context.run_migrations()`; never reads `DATABASE_URL`;
  - online: if `app.db.database_url() is None` → `raise SystemExit("DATABASE_URL is not set")`; then `try: connection = app.db.get_engine().connect()` `except Exception as exc: raise SystemExit(f"Could not connect to the database ({type(exc).__name__})") from None`; then `with connection:` `context.configure(connection=connection, target_metadata=target_metadata)` and `with context.begin_transaction(): context.run_migrations()` (one transaction for the whole run, research R3). Never print or log the URL or the driver message.

  Do not change `backend/app/db.py` (FR-004; [contracts/migration-commands.md](contracts/migration-commands.md) "Errors") (backend-dev)
- [ ] T005 [TS-03] Create `backend/migrations/versions/0001_initial_schema.py` by hand (no autogenerate), depends on T002: `revision = "0001_initial_schema"`, `down_revision = None`, docstring "TS-03: initial schema (users, patients, vital_signs, triage_events, alerts)". `upgrade()` calls `op.create_table` for `users`, `patients`, `vital_signs`, `triage_events`, `alerts` in that order with exactly the columns, types, nullability, `server_default`s and rules of T002 / [data-model.md](data-model.md): `sa.Column("id", sa.Integer(), sa.Identity(), nullable=False)`, `sa.PrimaryKeyConstraint("id", name=op.f("pk_<table>"))`, `sa.UniqueConstraint(..., name=op.f("uq_users_username"))` / `op.f("uq_patients_identifier")`, `sa.ForeignKeyConstraint([...], ["patients.id"|"users.id"], name=op.f("fk_<table>_<column>_<referred table>"), ondelete="RESTRICT")`, `sa.CheckConstraint("<same sql as T002>", name=op.f("ck_<table>_<short>"))`. `downgrade()` calls `op.drop_table` for `alerts`, `triage_events`, `vital_signs`, `patients`, `users` in that order. Every constraint name must equal the name the T002 naming convention produces (FR-001, FR-003) (backend-dev)
- [ ] T006 [P] [TS-03] Edit `backend/README.md`: add a `## Database migrations` section after "Database connection" and before "Run", explaining with no real values: the schema is versioned with Alembic in `backend/migrations/`; commands run from `backend/` with the venv active and use the same `DATABASE_URL` as the app (`alembic.ini` holds no URL); `alembic upgrade head` (create or upgrade; safe to run twice), `alembic current` (which version the database is at), `alembic downgrade -1` (goes back one version; the one-step command, FR-003), `alembic downgrade base` (removes everything: all versions and their tables and data), `alembic upgrade head --sql` (preview SQL, no database); the line "if the first run reports a timeout (Neon waking up), run it again"; how to list the tables to verify (Neon console → project → **Tables**, or the Neon MCP `get_database_tables` tool); that a new schema change means a new hand-written revision in `migrations/versions/` matching `app/models.py`; never print `DATABASE_URL`. In "Test", note the tests also check the schema and migrations without a database (FR-012, AC9) (backend-dev)
- [ ] T007 [TS-03] Validate on Neon per [quickstart.md](quickstart.md), after T001–T005 and T010: steps 2–3 first, then, **only if `backend/.env` exists** (check with `Test-Path .env`, never open it), steps 4, 5, 7, 8 and 9 exactly as written (time the first `alembic upgrade head` in step 4 with `$start = Get-Date; alembic upgrade head; (Get-Date) - $start` and report the elapsed time, SC-001), and step 6 with the Neon console, the Neon MCP `get_database_tables` tool or, if neither is available to the agent, this query run through `app.db.get_engine()` printing only names: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`. Leave the database **upgraded**. Save the outputs of steps 2, 4–8 for the PR (they contain no secrets). If `backend/.env` doesn't exist, report steps 4–9 as pending for the user instead of creating it. If step 4 fails for a pooling reason (not a typo or network error), stop and report it (research R3 fallback is the user's decision). Fix T002–T005 if a step fails (AC1–AC5, AC7, AC8, SC-001, SC-002, SC-005) (backend-dev)

### Tests and review

- [ ] T008 [P] [TS-03] Create `backend/tests/test_models.py` (docstring citing TS-03 FR-005 to FR-011, FR-013) inspecting `app.models.Base.metadata` only, no database; each test's docstring names the AC/FR it verifies:
  - `test_metadata_has_exactly_the_five_tables` (AC1): table names are exactly `{"users", "patients", "vital_signs", "triage_events", "alerts"}`;
  - `test_columns_and_nullability` (AC1, FR-009, FR-013): for each table the column-name set equals the data-model list, and the nullable columns are exactly `triage_events.previous_level`, `triage_events.score`, `triage_events.created_by_id`, `alerts.acknowledged_by_id`, `alerts.acknowledged_at`;
  - `test_primary_keys_are_identity_ids` (data model): each table's primary key is `id` with an `Identity`;
  - `test_foreign_keys_restrict_delete` (AC4, FR-005): `vital_signs.patient_id`, `triage_events.patient_id`, `alerts.patient_id` → `patients.id`; `triage_events.created_by_id`, `alerts.acknowledged_by_id` → `users.id`; every FK has `ondelete == "RESTRICT"`; no other FKs;
  - `test_unique_username_and_identifier` (AC5, FR-008): unique constraints `uq_users_username` and `uq_patients_identifier`;
  - `test_check_constraints` (AC5, FR-006, FR-007): parametrized over every `ck_<table>_<short>` name from T002, asserting the constraint exists on its table and its SQL text contains each allowed value or bound (e.g. `ck_patients_triage_level` contains `1` and `5`; `ck_vital_signs_consciousness` contains `'A'`, `'C'`, `'V'`, `'P'`, `'U'`; `ck_users_role` contains `'doctor'`, `'nurse'`);
  - `test_password_stored_only_as_hash` (FR-008): `users` has `password_hash` and no column whose name is or starts with `password` other than it;
  - `test_timestamps_have_time_zone_and_defaults` (FR-010): `created_at`, `admitted_at`, `recorded_at`, `occurred_at` are `DateTime(timezone=True)` with a server default; `acknowledged_at` is `DateTime(timezone=True)` without one.

  (qa-tester)
- [ ] T009 [P] [TS-03] Create `backend/tests/test_migrations.py` (docstring citing TS-03 AC1, AC3, AC6, FR-004, FR-011) using `alembic.config.Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))` and `alembic.command`; offline tests set `cfg.output_buffer = io.StringIO()` and read it; no database or network:
  - `test_single_head` (AC2): `ScriptDirectory.from_config(cfg).get_heads() == ["0001_initial_schema"]`;
  - `test_offline_upgrade_creates_the_five_tables` (AC1): `command.upgrade(cfg, "head", sql=True)`; output contains `CREATE TABLE <name>` for the five tables, `CREATE TABLE alembic_version`, the `INSERT INTO alembic_version` of `0001_initial_schema`, and no other `CREATE TABLE`;
  - `test_offline_upgrade_matches_models` (FR-001, research R5): every column name and every named constraint (PK, FK, unique, check) in `Base.metadata` appears in the upgrade SQL, and every FK line contains `ON DELETE RESTRICT`;
  - `test_offline_downgrade_drops_the_five_tables` (AC3): `command.downgrade(cfg, "head:base", sql=True)`; output contains `DROP TABLE` for the five tables;
  - `test_online_without_database_url_fails_cleanly` (FR-004, edge case): no URL (conftest); `pytest.raises(SystemExit)` around `command.current(cfg)`; message is `DATABASE_URL is not set`;
  - `test_connection_failure_prints_no_credentials` (FR-004, edge case): `monkeypatch.setenv("DATABASE_URL", "postgresql://user:s3cr3t-placeholder@db.example.invalid/neondb")`; monkeypatch `app.db.get_engine` to return a fake engine whose `connect()` raises `sqlalchemy.exc.OperationalError("could not connect: user:s3cr3t-placeholder@db.example.invalid", None, Exception())` and that has a no-op `dispose()`; `pytest.raises(SystemExit)` around `command.current(cfg)`; the message is `Could not connect to the database (OperationalError)` and neither the message nor `capsys` output contains `s3cr3t-placeholder` or `db.example.invalid`.

  (qa-tester)
- [ ] T010 [TS-03] From `backend/`, run `python -m pytest` and confirm all tests (TS-01, TS-02 and the new ones) pass in under 30 s (SC-003); keep the output for the PR description (DECISIONS D-27). Then run quickstart step 10 plus `git grep -n "npg_"` and `git grep -n -E "ep-[a-z]+-[a-z]+-[a-z0-9]{8}(-pooler)?\.[a-z0-9-]+\.aws\.neon\.tech"`, and confirm `backend/.env` is not listed and both searches find nothing (AC6, SC-005) (qa-tester)
- [ ] T011 [TS-03] Review read-only `backend/alembic.ini`, `backend/migrations/env.py`, `backend/migrations/versions/0001_initial_schema.py`, `backend/app/models.py`, the new tests, `backend/README.md` and the quickstart snippet: no URL in `alembic.ini`; `DATABASE_URL` via `app.db` is the only connection source; connection errors print only the error type; upgrade runs in a single transaction (`transaction_per_migration` not enabled), so a failure leaves the schema unchanged; no credential, real host or `npg_` value anywhere; only `password_hash`, no real-identity columns; the quickstart prints only SQLSTATE codes and rolls back; `alembic` is pinned. Report findings; don't change code (Principles VI, VIII). The dependency vulnerability scan runs in CI from TS-09 on (D-27) (security-reviewer)

**Checkpoint**: TS-03 is complete. TS-06 (auth) and TS-08 (simulator) can use `app.models` and add rows.

---

## Phase 4: Polish

- [ ] T012 Edit `docs/PROJECT_STATUS.md`: set "Last updated" to the current date; in step 11's notes mark TS-03 ✅ and set "Next: TS-04 (React app skeleton)"; set "Next step" accordingly; rewrite the "Where we left off" note to say TS-03 is done, the migration was applied to Neon and verified (or that the manual Neon run is pending, if T007 reported it so), and that teammates run `pip install -r requirements.txt` then nothing else (the shared Neon database is already migrated). In `docs/BACKLOG.md`, link this feature in TS-03's Spec column; set Status ✅ only when the PR is merged. In `docs/DECISIONS.md`, add entry **D-32** after D-31 (date of the change, Status "Active"): decision — schema migrations with **Alembic** (one hand-written revision per change, `alembic.ini` without URL, `env.py` reuses `app.db` so TLS and timeouts match TS-02), run by hand from `backend/` through the **pooled** `DATABASE_URL`; allowed values as `VARCHAR` + `CHECK` (no PostgreSQL enums), triage levels as plain `SMALLINT` 1–5, FKs `ON DELETE RESTRICT`; reason — standard SQLAlchemy tool with version tracking and downgrade; one transaction per run works through PgBouncer transaction mode (TS-03 research R3); CHECK lists are easy to change if the Colombian triage scheme replaces NEWS2 (D-08); simplest option (D-23) (orchestrator)

---

## Dependencies & Execution Order

- **T001** (Setup): no dependencies; needed before running anything.
- **T002, T003, T006**: depend only on T001 and the plan; can run in parallel (different files).
- **T004**: depends on T002 (imports `Base`) and T003 (`alembic.ini`).
- **T005**: depends on T002 (same columns and constraint names).
- **T008**: depends on T002. **T009**: depends on T003–T005. They can run in parallel with each other.
- **T010**: depends on T008, T009.
- **T007**: depends on T001–T005 **and T010** (Neon is migrated only after the offline tests pass).
- **T011**: depends on T001–T010.
- **T012**: last; depends on T011.
- **Story dependencies**: TS-02 only (merged), per docs/BACKLOG.md.

## Parallel Example

```text
# Round 1 (backend-dev), after T001:
Task: "Create backend/app/models.py (T002)"
Task: "Create backend/alembic.ini and migrations/script.py.mako (T003)"
Task: "Add Database migrations section to backend/README.md (T006)"

# Round 2 (qa-tester), after T005:
Task: "Create backend/tests/test_models.py (T008)"
Task: "Create backend/tests/test_migrations.py (T009)"
```

## Implementation Strategy

TS-03 is the whole MVP: T001 → T002/T003/T006 → T004 → T005 → T008/T009 → T010 → T007 → T011 → T012. Run the automated tests (T010) before touching Neon (T007), so the real database is only migrated by a revision that already passes the offline checks. After T011, commit (`TS-03: database tables and Alembic migrations`), push and open the PR. Until TS-09 adds CI, paste the local `python -m pytest` output and the manual Neon outputs (quickstart steps 4–8) into the PR description (DECISIONS D-27). The PR includes the agent activity log (`specs/003-db-tables-migrations/agent-log.csv`, via `scripts/log-agent.ps1`).

## Notes

- The orchestrator assigns each task to its agent and logs `assigned` / `started` / `done` rows (see `docs/agents.md`).
- Testing runs after implementation, as the project template orders it (qa-tester, then security-reviewer). It doesn't use test-first order.
- Do not add anything not listed here (Principle XII): no seed data, ORM relationships, PostgreSQL enum types, second connection setting, automatic migration on app start, or changes to `app/db.py`.
