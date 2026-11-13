# Research: Database Tables and Migrations (TS-03)

The main tech choices came with the `/speckit-plan` input. This file records them, the reasons, and the two points that needed checking (Neon's pooled connection and the new dependencies).

## R1. Migration tool

- **Decision**: **Alembic**, with **one hand-written** initial revision `0001_initial_schema`. No autogenerate against a live database. Commands are run from `backend/`: `alembic upgrade head`, `alembic downgrade base`, `alembic current`.
- **Rationale**: Alembic is the standard migration tool for SQLAlchemy, which TS-02 already uses; it records the applied version in an `alembic_version` table, so `upgrade head` twice changes nothing (FR-002, AC2). A hand-written revision is reviewed like any other code and needs no database to create.
- **Alternatives considered**: plain `.sql` files run by a small script (we would have to write our own version tracking and downgrade), `Base.metadata.create_all()` (no versions, no downgrade), autogenerate (needs a live database and still has to be reviewed by hand).

## R2. Pinned version and new indirect dependencies (PyPI, 2026-11-13)

| Package | Version | Why |
|---|---|---|
| alembic | 1.20.1 | Latest release; works with SQLAlchemy 2.1 |
| Mako (indirect) | 1.4.3 | Alembic's template engine, used only to render new revision files |
| MarkupSafe (indirect) | 3.0.4 | Required by Mako |

- **Decision**: add only `alembic==1.20.1` to `backend/requirements.txt`, as in TS-01/TS-02; locking indirect dependencies is TS-09's job (TS-02 security review).
- **Smart App Control check (D-31)**: Alembic and Mako are pure Python. MarkupSafe ships an optional compiled speed-up (`_speedups.pyd`); if Windows blocks it, the import fails with `ImportError` and MarkupSafe falls back to its pure-Python version (the same pattern SQLAlchemy's optional compiled extensions already follow on our laptops). Verified during implementation by running `alembic --help` and the tests on a team laptop (quickstart step 2).

## R3. Pooled vs direct Neon connection for migrations

- **Question**: does Alembic work through Neon's **pooled** connection (PgBouncer in transaction mode), or must migrations use the direct string?
- **Findings** (Neon docs, "Connection pooling", updated 2026-10-19): transaction mode does not support session `SET`/`RESET`, `LISTEN/NOTIFY`, SQL-level `PREPARE`, session advisory locks or temporary tables kept across transactions; protocol-level prepared statements are supported. Neon recommends direct connections for migrations because "tools may not support transaction pooling".
- **Analysis**: on PostgreSQL, Alembic uses transactional DDL and by default runs the whole `upgrade` (DDL plus the `alembic_version` update) inside **one transaction**. A transaction keeps the same server connection in transaction mode, so the migration sees a consistent session. Alembic doesn't use session `SET`, `LISTEN`, SQL `PREPARE` or advisory locks, and our env.py adds none. pg8000 uses protocol-level statements, which PgBouncer supports, and TS-02 already runs queries through the pooler with pg8000.
- **Decision**: use the **same pooled `DATABASE_URL`** for migrations (one setting, D-29). The manual run on Neon (quickstart steps 4–7) confirms this. **Fallback, only if that run fails because of pooling**: set `DATABASE_URL` for that terminal session to the **direct** string (Neon console → Connect → turn off "Connection pooling"), never written to a committed file, and record the change in DECISIONS.
- **Alternatives considered**: always use a second `DIRECT_DATABASE_URL` setting (an extra secret to manage for a problem we don't have).

## R4. Connection settings in `migrations/env.py`

- **Decision**: `alembic.ini` has **no** `sqlalchemy.url`. Online mode calls `app.db.database_url()`; if it returns `None`, env.py stops with `DATABASE_URL is not set` (non-zero exit). Otherwise it uses `app.db.get_engine()`, so TLS (`ssl.create_default_context()`), the pg8000 socket timeout and the URL conversion are exactly TS-02's (D-31). Offline mode (`--sql`) uses `dialect_name="postgresql"` with no URL, so it needs no database.
- **Credentials in errors (FR-004)**: env.py wraps opening the connection; a failure stops with `Could not connect to the database (<ErrorType>)`, raised `from None` so the driver message (which can contain the host or user) is not printed. Errors **after** connecting (e.g. a failing DDL statement) are shown as usual; they contain SQL, not credentials. Alembic's logging config in `alembic.ini` stays at its default (WARN for SQLAlchemy, INFO for Alembic), which never logs the URL.
- **Timeouts**: the pg8000 5 s socket timeout from TS-02 applies to each network read; creating five empty tables takes well under a second, and Neon wakes from scale-to-zero in a few hundred milliseconds. If a timeout ever happens, the transaction is rolled back (edge case "fails halfway").
- **Paths**: `script_location = %(here)s/migrations` and `prepend_sys_path = %(here)s`, so Alembic and the tests find the files and `app` from any working directory.

## R5. Models and how the migration is kept in step

- **Decision**: SQLAlchemy 2.x declarative models (`DeclarativeBase`, `Mapped`, `mapped_column`) in **one file**, `app/models.py`, used by later API stories. `MetaData` gets a **naming convention** (`pk_%(table_name)s`, `fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s`, `uq_%(table_name)s_%(column_0_name)s`, `ck_%(table_name)s_%(constraint_name)s`) so every constraint has a fixed, predictable name. The hand-written migration uses the same names.
- **Match check without a database**: a test renders the upgrade SQL offline and checks that every table, column and named constraint in `Base.metadata` appears in it (and that nothing else is created). env.py sets `target_metadata = Base.metadata` so `alembic check` can be used against Neon later.
- **No ORM `relationship()`s** in this story: foreign-key columns are enough to enforce the rules; a story that needs object navigation adds it (Principle XII).
- **Alternatives considered**: models split into one file per table (more files for five small classes), Core `Table` objects only (later stories expect ORM classes).

## R6. Column types and rules

- **Decision**:
  - Primary keys: `INTEGER GENERATED BY DEFAULT AS IDENTITY` (`Identity()`), column `id`.
  - Allowed-value lists: `VARCHAR` + named `CHECK (col IN (...))`, not PostgreSQL `ENUM` types. Changing a list later is a one-line constraint swap, and dropping tables leaves no orphan types (D-08).
  - Triage levels: `SMALLINT` + `CHECK (level BETWEEN 1 AND 5)`; no NEWS2 meaning in the schema (D-08).
  - Timestamps: `TIMESTAMP WITH TIME ZONE` (`DateTime(timezone=True)`), creation times `server_default now()`. PostgreSQL stores them as absolute instants; the app writes and reads them in UTC.
  - Foreign keys: `ON DELETE RESTRICT` (deleting a referenced patient or user fails, FR-005).
  - Temperature `NUMERIC(3,1)`; other vitals `SMALLINT` with `>= 0` checks; SpO2 `0–100`; age `0–130`; score `>= 0` when present.
  - Text: short `VARCHAR(n)` for names, codes and allowed values; `TEXT` for reason and message.
- **"Required"** (FR-009) means `NOT NULL`. Rejecting blank strings (`''`) is input validation in the API stories.
- **Rationale**: simplest PostgreSQL types that express every rule in FR-005 to FR-010 directly in the database. Details per column in [data-model.md](data-model.md).

## R7. Tests without a database

- **Decision**: two new test files, run by the existing `python -m pytest`; the TS-02 `conftest.py` (removes `DATABASE_URL`, resets the engine) still applies.
  - `tests/test_models.py`: inspects `Base.metadata`: exactly the 5 tables; column names and nullability; primary keys; foreign keys (target and `ondelete="RESTRICT"`); unique constraints on `users.username` and `patients.identifier`; each CHECK constraint's name and that its text contains the allowed values or bounds; no `password` column, only `password_hash`; no real-identity columns (FR-013).
  - `tests/test_migrations.py`: uses `alembic.config.Config` + `alembic.command` with `sql=True` and an in-memory output buffer: `upgrade head` contains `CREATE TABLE` for the 5 tables, every model column and constraint name, and the `alembic_version` insert; `downgrade head:base` contains `DROP TABLE` for the 5 tables; the revision chain has exactly one head. It also checks online mode with `DATABASE_URL` unset stops with the clear message, and that a simulated connection failure (monkeypatched engine) prints only the generic message, never a fake password.
- **Rationale**: covers AC6 and FR-011 with no network. That the database really rejects bad rows, and that upgrade twice, downgrade and upgrade work, is checked once by hand on Neon (AC2, AC3, AC7, AC8; spec Clarifications).
- **Alternatives considered**: SQLite in memory (different SQL dialect: identity, CHECK and timestamptz behave differently, so it would test the wrong thing), a Neon test branch in CI (needs a Neon API key secret; TS-09/TS-10 decision).

## R8. Manual verification on Neon

- **Decision**: the quickstart gives exact PowerShell steps: `alembic upgrade head` (twice), list tables with the Neon MCP `get_database_tables` tool (or Neon console → Tables), the three invalid inserts run with a short Python snippet piped to `python -` that uses `app.db.get_engine()` and **rolls back** each attempt and prints only the SQLSTATE code, then `alembic downgrade base` and `alembic upgrade head`.
- **Rationale**: `psql` is not installed on the team laptops, and the snippet reuses TS-02's connection, so the connection string never has to be typed or printed. Printing only the SQLSTATE (`23503` foreign key, `23514` check) proves each rejection without showing driver messages.
