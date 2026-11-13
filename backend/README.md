# PatientDeteriorationMonitor — Backend

FastAPI application. All commands are for Windows PowerShell and are run from the `backend/` folder.

## Prerequisites

- Python **3.13** (check with `py -3.13 --version`).
- Local PowerShell scripts allowed for your user, so the virtual environment can be activated. See [DEVELOPMENT.md, section 2 ("Allow local PowerShell scripts")](../DEVELOPMENT.md#allow-local-powershell-scripts).

## Setup

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

## Database connection

The backend reads the database connection string from the `DATABASE_URL` environment variable, and from nowhere else. Locally it is loaded from the file `backend/.env`. That file is git-ignored: **never commit it and never paste its contents in a chat**.

1. Open the Neon console, go to the project `patient-deterioration-monitor` and click **Connect**.
2. Choose the **pooled** connection string and copy it unchanged (the code adapts the `postgresql://` prefix for the driver).
3. Create the file `backend/.env` with one line, using your copied value in place of this placeholder:

   ```text
   DATABASE_URL=postgresql://<user>:<password>@ep-xxxx-pooler.<region>.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

Notes:

- A `DATABASE_URL` already set in the terminal wins over the file.
- The app still starts without `DATABASE_URL`; `/health` then shows `database: unavailable`.
- In CI/CD the value comes from the GitHub secret `DATABASE_URL` (DECISIONS D-29).

## Database migrations

The database schema is versioned with [Alembic](https://alembic.sqlalchemy.org/). The migration scripts live in `backend/migrations/`, and the tables they create are described by the models in `app/models.py`.

Run the commands from `backend/` with the virtual environment active. They use the same `DATABASE_URL` as the app (environment variable or `backend/.env`); `alembic.ini` holds no URL.

| Command | What it does |
|---|---|
| `alembic upgrade head` | Creates the tables, or upgrades them to the latest version. Safe to run twice: an up-to-date database is left unchanged. |
| `alembic current` | Shows which version the database is at. |
| `alembic downgrade -1` | Goes back one version. |
| `alembic downgrade base` | Removes everything: all versions and their tables **and data**. |
| `alembic upgrade head --sql` | Prints the upgrade SQL without connecting (no database needed). |

Notes:

- If the first run reports a timeout (Neon waking up), run it again.
- To verify the tables, open the Neon console → project `patient-deterioration-monitor` → **Tables**, or use the Neon MCP `get_database_tables` tool.
- A new schema change means a new hand-written revision in `migrations/versions/`, matching the change in `app/models.py`.
- Never print `DATABASE_URL` or paste it in a chat. Connection errors show only the error type.
- Don't use `--verbose` with `alembic current`, `history` or `heads` when sharing output: it shows the database host and user (the password is masked). Never paste that output in a PR or chat.

## Allowed frontend origins (CORS)

The backend accepts browser requests only from the origins listed in the `CORS_ORIGINS` environment variable: a comma-separated list of origins (scheme, host and port, no path), for example:

```text
CORS_ORIGINS=http://localhost:5173,https://<your-app>.azurestaticapps.net
```

Set it in the terminal or as a line in `backend/.env`, like `DATABASE_URL`; a value set in the terminal wins over the file.

- When `CORS_ORIGINS` is unset or blank, the default is `http://localhost:5173` (the local frontend).
- Spaces around entries and a trailing `/` are ignored.
- Setting `CORS_ORIGINS` **replaces** the default: include `http://localhost:5173` in the list if you still need it.
- `*` is not allowed. With a `*` entry the app stops at startup with `CORS_ORIGINS must not contain '*'; list the allowed origins explicitly`.
- Only `GET` requests are allowed, and no cookies or credentials are sent.
- `CORS_ORIGINS` is not a secret. The production origins are set in TS-10/TS-11.
- In PowerShell, `$env:CORS_ORIGINS = ""` deletes the variable (the default then applies). To remove it explicitly, use `Remove-Item Env:CORS_ORIGINS`.

## Run

```powershell
python -m uvicorn app.main:app --reload --port 8000
```

- Health check: <http://127.0.0.1:8000/health>
- Interactive API docs: <http://127.0.0.1:8000/docs>

In a second terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

Expected output (with a working `backend/.env`):

```text
status version database
------ ------- --------
ok     0.1.0   ok
```

## Test

```powershell
python -m pytest
```

The tests need no database, no `backend/.env` and no network access. They also check the schema (the models) and the migrations (the offline upgrade and downgrade SQL) without a database.

## Version

The app version is defined in one place only: `__version__` in `app/__init__.py`. Change it there; `/health` and `/docs` pick it up automatically.
