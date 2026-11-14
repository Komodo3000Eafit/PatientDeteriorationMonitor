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
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Then fill in the real values in `backend/.env` (see [Database connection](#database-connection) and [Authentication](#authentication)). `backend/.env` is git-ignored; `backend/.env.example` holds placeholders only.

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
- Only `GET` and `POST` requests are allowed, with only the `Authorization` and `Content-Type` request headers (TS-06), and no cookies or credentials are sent.
- `CORS_ORIGINS` is not a secret. The production origins are set in TS-10/TS-11.
- In PowerShell, `$env:CORS_ORIGINS = ""` deletes the variable (the default then applies). To remove it explicitly, use `Remove-Item Env:CORS_ORIGINS`.

## Authentication

Clinicians sign in with a username and password and get a short-lived access token (TS-06).

### Settings

| Setting | Required | Rule | Used by |
|---|---|---|---|
| `AUTH_SECRET` | yes | random value, at least 32 characters; signs the tokens | the app |
| `ACCESS_TOKEN_MINUTES` | no | whole number from 1 to 1440; default 480 (8 hours) | the app |
| `DEMO_DOCTOR_PASSWORD` | for the command | at least 8 characters | `python -m app.seed_demo_users` only |
| `DEMO_NURSE_PASSWORD` | for the command | at least 8 characters | `python -m app.seed_demo_users` only |

Put them in `backend/.env` (copy `backend/.env.example`), like `DATABASE_URL`. **Never commit `backend/.env` and never paste its contents in a chat.**

Generate the secret with:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

The app refuses to start without a valid secret. It stops with `AUTH_SECRET must be set to a random value of at least 32 characters` (or `ACCESS_TOKEN_MINUTES must be a whole number of minutes from 1 to 1440`). The message names the setting only, never its value.

### Demo users

After `alembic upgrade head`, run:

```powershell
python -m app.seed_demo_users
```

It creates or updates two demo accounts, with the passwords from `DEMO_DOCTOR_PASSWORD` and `DEMO_NURSE_PASSWORD`:

| Username | Full name | Role |
|---|---|---|
| `demo.doctor` | Dra. Ana Demo | doctor |
| `demo.nurse` | Enf. Luis Demo | nurse |

It is safe to run again: it updates the passwords and never creates duplicates. Only password hashes are stored. It prints one line per account (`created: demo.doctor` or `updated: demo.doctor`), and never prints passwords, hashes or the connection string. It needs no `AUTH_SECRET`.

### Endpoints

See [contracts/auth-api.md](../specs/006-authentication/contracts/auth-api.md) for the full contract.

- `POST /auth/login` (public): body `{"username": "...", "password": "..."}`; returns `{"access_token": "...", "token_type": "bearer", "expires_in": 28800}`. A wrong username or password gives the same `401 {"detail": "Incorrect username or password"}`.
- `GET /me` (protected): returns `{"username", "full_name", "role"}` of the signed-in user; without a valid token, `401 {"detail": "Not authenticated"}`.
- `GET /health` stays public.

To try them in <http://127.0.0.1:8000/docs>: call `POST /auth/login`, copy the `access_token`, click **Authorize**, paste the token and then call `GET /me`.

### Protecting a new endpoint

Every clinical endpoint must require a signed-in user:

```python
from app.auth import get_current_user
from app.models import User

@router.get("/patients")
def list_patients(user: User = Depends(get_current_user)): ...
```

A missing, invalid or expired token gives 401, and the token is checked before any database access.

### Notes

- Logout is client-side only (the frontend forgets the token); tokens expire after `ACCESS_TOKEN_MINUTES`.
- In CI and Azure, `AUTH_SECRET` will be a GitHub/Azure secret (TS-09/TS-10).
- Login rate limiting is not done yet (TS-10).

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

The tests need no database, no `backend/.env` and no network access. They use a fake built-in `AUTH_SECRET`, so a developer's `.env` never changes them. They also check the schema (the models) and the migrations (the offline upgrade and downgrade SQL) without a database.

## Version

The app version is defined in one place only: `__version__` in `app/__init__.py`. Change it there; `/health` and `/docs` pick it up automatically.
