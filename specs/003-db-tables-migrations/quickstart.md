# Quickstart: Database Tables and Migrations (TS-03)

Validation guide for the story. All commands are Windows PowerShell, run from `backend/` with the virtual environment active (`.\.venv\Scripts\Activate.ps1`). Commands and messages: [contracts/migration-commands.md](contracts/migration-commands.md). Tables: [data-model.md](data-model.md).

**Never print the connection string**: don't run `echo $env:DATABASE_URL`, `Get-Content .env` or similar, and don't paste `.env` contents anywhere.

## 1. Install

```powershell
python -m pip install -r requirements.txt
```

Expected: `alembic` 1.20.1 (plus Mako and MarkupSafe) installed.

## 2. Automated tests (no database, no network) — AC6, SC-003

```powershell
alembic --help
python -m pytest
```

Expected: `alembic --help` prints the command list (shows that Smart App Control does not block the new packages, research R2); all tests pass, including `tests/test_models.py` and `tests/test_migrations.py`, in under 30 s. Works with no `backend/.env`.

## 3. Offline SQL preview (optional)

```powershell
alembic upgrade head --sql
```

Expected: `CREATE TABLE` statements for `users`, `patients`, `vital_signs`, `triage_events`, `alerts`, no connection made.

## 4. Apply to Neon — AC1, AC7

Needs `backend/.env` with the pooled `DATABASE_URL` (see `backend/README.md`, "Database connection").

```powershell
alembic upgrade head
alembic current
```

Expected: `Running upgrade  -> 0001_initial_schema`, then `0001_initial_schema (head)`. If the first run reports a timeout (Neon waking up), run it again. If this fails with a pooling-related error (not a typo or network error), follow the fallback in [research.md](research.md) R3.

## 5. Run it again: nothing changes — AC2, SC-002

```powershell
alembic upgrade head
```

Expected: exit 0, no `Running upgrade` line.

## 6. List the tables — AC7, SC-005

Either ask Claude Code to use the Neon MCP tool `get_database_tables` (project `patient-deterioration-monitor`, database `neondb`), or open Neon console → project → **Tables**. Without either, print only the names through `app.db`:

```powershell
"from sqlalchemy import text; from app.db import get_engine; c = get_engine().connect(); print([r[0] for r in c.execute(text(""SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name""))]); c.close()" | python -
```

Expected: `users`, `patients`, `vital_signs`, `triage_events`, `alerts` and `alembic_version`, nothing else from this story.

## 7. Invalid inserts are rejected (rolled back) — AC4, AC5, AC8

```powershell
$check = @'
from sqlalchemy import text
from app.db import get_engine

checks = {
    "vital sign for missing patient": "INSERT INTO vital_signs (patient_id, respiratory_rate, spo2, on_oxygen, systolic_bp, heart_rate, consciousness, temperature) VALUES (-1, 16, 97, false, 120, 80, 'A', 37.0)",
    "triage level 6": "INSERT INTO patients (identifier, name, age, sex, triage_level) VALUES ('CHECK-001', 'Check Patient', 40, 'other', 6)",
    "unknown role": "INSERT INTO users (username, password_hash, full_name, role) VALUES ('check_user', 'not-a-real-hash', 'Check User', 'admin')",
}
with get_engine().connect() as conn:
    for name, sql in checks.items():
        trans = conn.begin()
        try:
            conn.execute(text(sql))
            print(name + ": ACCEPTED (unexpected)")
        except Exception as exc:
            orig = getattr(exc, "orig", None)
            info = orig.args[0] if orig is not None and orig.args and isinstance(orig.args[0], dict) else {}
            print(name + ": rejected, SQLSTATE " + str(info.get("C", type(exc).__name__)))
        finally:
            trans.rollback()
    left = conn.execute(text("SELECT (SELECT count(*) FROM users) + (SELECT count(*) FROM patients) + (SELECT count(*) FROM vital_signs)")).scalar()
    print("rows left in users/patients/vital_signs: " + str(left))
'@
$check | python -
```

Expected (prints only error codes, never driver messages or the connection string):

```text
vital sign for missing patient: rejected, SQLSTATE 23503
triage level 6: rejected, SQLSTATE 23514
unknown role: rejected, SQLSTATE 23514
rows left in users/patients/vital_signs: 0
```

`23503` = foreign key violation, `23514` = check violation.

## 8. Downgrade and upgrade once — AC3, AC8

```powershell
alembic downgrade base
alembic current
alembic upgrade head
alembic current
```

Expected: `Running downgrade 0001_initial_schema -> `, then an empty `current`; then `Running upgrade  -> 0001_initial_schema` and `0001_initial_schema (head)`. Repeat step 6: the five tables are back. Leave the database **upgraded**.

## 9. Error without a database — edge case, FR-004

```powershell
$env:DATABASE_URL = " "
alembic current
Remove-Item Env:DATABASE_URL
```

Expected: `DATABASE_URL is not set`, non-zero exit, no connection string shown. (A variable set in the terminal wins over `backend/.env`; a single space is used because PowerShell deletes a variable set to `""`, and `app.db` treats a blank value as missing.)

## 10. No secrets committed — SC-005

```powershell
git status --short
git grep -n "neon.tech" -- .
```

Expected: `backend/.env` is not listed; `git grep` finds only placeholder hosts (`ep-xxxx-pooler...`) in docs.

## 11. Record the result

Paste the outputs of steps 2, 4–8 into the PR description (they contain no secrets), and note in `docs/PROJECT_STATUS.md` that the migration was applied to Neon and verified (FR-012).
