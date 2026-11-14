# Contract: Authentication API and demo-user command (TS-06)

Base URL is the same as in TS-04 (`http://localhost:8000` locally). All bodies are JSON. Error bodies never contain submitted values, tokens, hashes, secrets or connection details.

## POST /auth/login (public)

The request body:

```json
{ "username": "demo.nurse", "password": "<password>" }
```

| Field | Rule |
|---|---|
| `username` | string, 1–50 characters, matched exactly |
| `password` | string, 1–128 characters |

| Case | Status | Body |
|---|---|---|
| Correct credentials | 200 | `{"access_token": "<jwt>", "token_type": "bearer", "expires_in": 28800}` (`expires_in` = `ACCESS_TOKEN_MINUTES` × 60) |
| Unknown username **or** wrong password | 401 + `WWW-Authenticate: Bearer` | `{"detail": "Incorrect username or password"}` (byte-for-byte identical in both cases) |
| Missing/empty/too long field, wrong type, bad JSON | 422 | `{"detail": [{"type": "...", "loc": [...], "msg": "..."}]}` (no `input`, no `ctx`) |
| Database not configured or failing | 503 | `{"detail": "Service unavailable"}` |

An unknown username still runs one full password verification against a dummy hash, so it takes about as long as a wrong password.

## GET /me (protected, `Authorization: Bearer <jwt>`)

| Case | Status | Body |
|---|---|---|
| Valid token, account exists | 200 | `{"username": "demo.nurse", "full_name": "Enf. Luis Demo", "role": "nurse"}` (exactly these 3 fields) |
| No header, other scheme (e.g. `Basic`), empty token, malformed, wrong signature, tampered, expired, missing claim, non-integer `sub`, account deleted | 401 + `WWW-Authenticate: Bearer` | `{"detail": "Not authenticated"}` |
| Valid token but database not configured or failing | 503 | `{"detail": "Service unavailable"}` (a missing or invalid token is still 401 in this situation) |

## Protection pattern for later endpoints

```python
from app.auth import get_current_user
from app.models import User

@router.get("/patients")
def list_patients(user: User = Depends(get_current_user)): ...
```

`get_current_user` gives the same 401 as `/me` in every failure case. The token is checked before any database access. A missing or bad token gets 401 even when the database is not configured or is down. A 503 can only come from a lookup with a valid token, or from the login lookup.

## GET /health

`GET /health` is unchanged (TS-02/TS-04): public, HTTP 200, `{status, version, database}`. An `Authorization` header, if sent, is ignored.

## Validation errors (all endpoints)

Every 422 response drops each error's `input` and `ctx`, so submitted values are never echoed.

## CORS (extends TS-04)

| Setting | TS-04 | TS-06 |
|---|---|---|
| `allow_origins` | `CORS_ORIGINS` list, `*` stops startup | unchanged |
| `allow_methods` | `["GET"]` | `["GET", "POST"]` |
| `allow_headers` | (none) | `["Authorization", "Content-Type"]` |
| `allow_credentials` | `False` | unchanged |

## Startup check (import of `app.main`)

| Setting state | Result |
|---|---|
| `AUTH_SECRET` missing, blank or < 32 characters | process stops: `AUTH_SECRET must be set to a random value of at least 32 characters` |
| `ACCESS_TOKEN_MINUTES` set but not a whole number 1–1440 | process stops: `ACCESS_TOKEN_MINUTES must be a whole number of minutes from 1 to 1440` |
| `ACCESS_TOKEN_MINUTES` unset or blank | 480 |

The messages are fixed and never include the value.

## Demo-user command

Run from `backend/` with the virtual environment active:

```powershell
python -m app.seed_demo_users
```

| Situation | Output (stdout/stderr) | Exit code | Database |
|---|---|---|---|
| Both passwords set (≥ 8 characters), database reachable | `created: demo.doctor` / `updated: demo.nurse` (one line per account) | 0 | upserted in one transaction |
| A password missing or shorter than 8 characters | `DEMO_NURSE_PASSWORD must be set to at least 8 characters` (one line per bad setting; names only) | 1 | not touched |
| `DATABASE_URL` not set | `DATABASE_URL is not set` | 1 | not touched |
| Connection or SQL error | `Could not update the demo users (<ErrorType>)` | 1 | transaction rolled back |

The command needs neither `AUTH_SECRET` nor `ACCESS_TOKEN_MINUTES`, and it never prints passwords, hashes or the connection string.
