# Contract: Migration Commands (TS-03)

The only interface this story adds is a set of command-line commands, run from `backend/` with the virtual environment active. The schema they produce is in [data-model.md](../data-model.md).

| Command | Effect | Success output / exit |
|---|---|---|
| `alembic upgrade head` | Brings the database in `DATABASE_URL` to the latest revision. Already up to date → does nothing. | Exit 0. On the first run Alembic logs `Running upgrade  -> 0001_initial_schema`; a second run logs no `Running upgrade` line. |
| `alembic downgrade base` | Removes every revision; for TS-03, drops the five tables. | Exit 0, logs `Running downgrade 0001_initial_schema -> `. |
| `alembic current` | Shows the revision the database is at. | `0001_initial_schema (head)` after upgrade; empty after downgrade. |
| `alembic upgrade head --sql` | Prints the upgrade SQL without connecting (offline mode). | SQL on standard output; needs no `DATABASE_URL` or network. |
| `alembic downgrade head:base --sql` | Prints the downgrade SQL without connecting. | As above. |

## Settings

- Connection: only `DATABASE_URL` (environment, or `backend/.env` through `app.db`). `alembic.ini` contains no URL.
- TLS, URL conversion and timeouts: the same as TS-02 (`app.db.get_engine()`).

## Errors

| Situation | Message | Exit |
|---|---|---|
| `DATABASE_URL` missing or empty (online commands) | `DATABASE_URL is not set` | non-zero |
| Database unreachable, wrong password, TLS failure | `Could not connect to the database (<ErrorType>)` | non-zero |
| A statement fails during upgrade/downgrade | Alembic/SQLAlchemy error with the SQL; the transaction is rolled back, so the schema is unchanged | non-zero |

No message ever contains the connection string, user name, host or password (FR-004).
