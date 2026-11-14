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

## Clinical scoring

The package `app/scoring/` (TS-07) scores one set of 7 vital signs and explains every point; it is pure Python with no database and no endpoint, and US-03 calls it. See [contracts/scoring-interface.md](../specs/007-clinical-scoring-module/contracts/scoring-interface.md) for the full contract.

```python
from decimal import Decimal
from app.scoring import get_scoring_system, vital_signs_from_mapping

vitals = vital_signs_from_mapping({
    "respiratory_rate": 22, "spo2": 95, "on_oxygen": False, "systolic_bp": 115,
    "heart_rate": 95, "consciousness": "A", "temperature": Decimal("37.5"),
})
result = get_scoring_system().score(vitals)
# result.system == "NEWS2", result.total == 4, result.band == "low"
# result.parameters[0] == ParameterScore("respiratory_rate", 22, 2, 21, 24, ())
```

Import only from `app.scoring`, never from a specific scoring system's module.

### Input

| Field | Type | Accepted values |
|---|---|---|
| `respiratory_rate` | `int` | 0 to 80 breaths/min |
| `spo2` | `int` | 0 to 100 % |
| `on_oxygen` | `bool` | `False` (air) or `True` (supplemental oxygen) |
| `systolic_bp` | `int` | 0 to 300 mmHg |
| `heart_rate` | `int` | 0 to 300 beats/min |
| `consciousness` | `str` | `A`, `C`, `V`, `P` or `U` (exact, upper case) |
| `temperature` | `Decimal` (or `int`/`float`) | 25.0 to 45.0 °C, at most 1 decimal |

Bounds are inclusive and types are strict: no coercion (`True` is not a number, `"90"` is not an integer) and no rounding. These limits are defined once, in the read-only mapping `ACCEPTED_LIMITS`. It is the single source: API code must reuse it (or `vital_signs_from_mapping`) instead of repeating the numbers.

### Result

`score()` returns a `ScoreResult`:

- `system`: the scoring system's name (`"NEWS2"` today);
- `total`: the sum of the points;
- `band`: one of `low`, `low-medium`, `medium`, `high` (`RISK_BANDS`);
- `parameters`: 7 `ParameterScore` entries in `PARAMETERS` order, each with `parameter`, `value`, `points`, `low` and `high` (the inclusive bounds of the matched range, `None` = open end) and `category` (the matched values for `on_oxygen` and `consciousness`).

Band identifiers and reason codes are data, not text: the UI translates them.

### Errors

Invalid input raises `InvalidVitalSigns` (a `ValueError`). Its `problems` attribute is a tuple of `Problem(parameter, reason)`, listing every problem at once, in `PARAMETERS` order with unknown keys last. Unknown key names are reported with non-printable characters removed and cut to 40 characters.

| Reason | When |
|---|---|
| `missing` | a required parameter is absent |
| `unknown` | a key that is not one of the 7 parameters |
| `wrong_type` | the value has the wrong type |
| `out_of_range` | a number outside the accepted range, or a non-finite temperature |
| `too_many_decimals` | the temperature has more than 1 decimal |
| `not_allowed` | a code that is not in the accepted list (for example `"a"`) |

Messages never contain input values, for example `invalid vital signs: spo2: out_of_range; consciousness: not_allowed`.

### Adding another scoring system

1. Add `app/scoring/<name>.py` with a class that has `name` and `score(vitals)`. `score()` calls `validate_vital_signs(vitals)` first and returns a `ScoreResult` using the same `RISK_BANDS`.
2. Change the one line in `get_scoring_system()` in `app/scoring/__init__.py` to return it.
3. Add its own tests. Callers don't change.

### Note on NEWS2

NEWS2 is implemented for SpO2 Scale 1 only. Scale 2 (for hypercapnic patients) needs a per-patient flag and is left for a later story. Source: [Royal College of Physicians, NEWS2](https://www.rcp.ac.uk/resources/national-early-warning-score-news-2/).

## Demo data and simulator

Two commands, run by hand from `backend/` with the virtual environment active (TS-08). They use the same `DATABASE_URL` as the app (environment variable or `backend/.env`), never print it, and show only the error type on a database error. See [contracts/commands.md](../specs/008-vital-signs-simulator/contracts/commands.md) for the full contract.

### Demo patients

```powershell
python -m app.demo_patients
```

| Option | Meaning |
|---|---|
| (none) | Create the missing demo patients PAT-001 to PAT-006, each with one "initial" triage event. Existing ones are left unchanged. |
| `--reset` | Additionally, for exactly PAT-001 to PAT-006: delete their readings, triage events and alerts, set them back to `active` at their initial triage level, and add a new "initial" triage event. Everything happens in one transaction. |
| `--yes` | Confirm `--reset` without a prompt. It has no effect without `--reset`. |

Without `--yes`, `--reset` asks you to type `yes` in an interactive terminal; any other answer, or a non-interactive input, prints `Reset cancelled: nothing was changed` and touches nothing. It prints one line per patient, for example `created: PAT-001 (stable, triage 4)`, `exists: PAT-002` or `reset: PAT-003 (slow, triage 3)`.

- Stop the simulator before running `--reset`: a reading committed by a simulator running at the same time can survive the reset.
- On the shared Neon `main` branch, `--reset --yes` clears the demo history for every teammate using that branch, though it only ever touches PAT-001 to PAT-006.

The six demo patients are synthetic, and each follows a scenario:

| Identifier | Scenario | Initial triage level |
|---|---|---|
| PAT-001 | stable | 4 |
| PAT-002 | stable | 5 |
| PAT-003 | slow (deteriorates over about 12 readings) | 3 |
| PAT-004 | slow (deteriorates over about 12 readings) | 4 |
| PAT-005 | rapid (deteriorates over about 4 readings) | 3 |
| PAT-006 | rapid (deteriorates over about 4 readings) | 4 |

Any other active patient is simulated as stable.

### Simulator

```powershell
python -m app.simulator --demo --rounds 5
```

| Option | Default | Meaning |
|---|---|---|
| `--interval-seconds N` | 300 | Seconds between rounds (positive whole number). |
| `--demo` | off | Use 15 seconds between rounds. Cannot be combined with `--interval-seconds`. |
| `--once` | off | Run one round and exit. Cannot be combined with `--rounds`. |
| `--rounds N` | none | Stop after N rounds (positive whole number). |
| `--minutes M` | 60 | Stop when the next round would start at or after M minutes (positive whole number). |
| `--seed S` | random | Whole number; the same seed gives the same values. Without it, a seed is chosen and printed. |

- Each round saves one valid reading for every `active` patient, in identifier order, and prints one line per patient (identifier, scenario, step and values, never the name).
- Runs continue from each patient's saved readings: the step is the number of readings already saved, so a second run picks up where the first stopped. To start a rehearsal from scratch, run `python -m app.demo_patients --reset --yes` first; it touches only PAT-001 to PAT-006.
- Use `--demo` (15 s between rounds) for presentations; the default 300 s matches the 5-minute monitoring cadence.
- It stops at the first limit reached (rounds or minutes) or on Ctrl+C, and prints `Stopped: <reason>. Rounds: N, readings saved: M.`

**Cost control**: the simulator keeps the Neon database awake while it runs. Start it only by hand, for testing and demos, and keep runs short. It always stops by itself (default limit 60 minutes), is never started by the API, and must never be left running.

To check both commands against Neon once, follow [quickstart.md §2](../specs/008-vital-signs-simulator/quickstart.md#2-one-time-manual-check-on-neon-record-the-result-in-the-pr).

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

The tests need no database, no `backend/.env` and no network access. They use a fake built-in `AUTH_SECRET`, so a developer's `.env` never changes them. They also check the schema (the models) and the migrations (the offline upgrade and downgrade SQL) without a database. The clinical scoring tests (`tests/test_scoring_*.py`) are pure Python and need nothing extra.

## Version

The app version is defined in one place only: `__version__` in `app/__init__.py`. Change it there; `/health` and `/docs` pick it up automatically.
