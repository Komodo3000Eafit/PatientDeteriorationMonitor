# Data Model: Authentication (TS-06)

There are **no schema changes and no new migration**. This story uses the TS-03 `users` table as it is.

## users (TS-03, unchanged)

| Column | Type | Use in TS-06 |
|---|---|---|
| id | integer identity | Token `sub` (as a string) |
| username | varchar(50), unique | Login name; matched exactly (case-sensitive, not trimmed) |
| password_hash | varchar(255) | PBKDF2 string, see below; never returned or logged |
| full_name | varchar(100) | Returned by `GET /me`; shown in the header |
| role | varchar(10), `doctor` / `nurse` | Returned by `GET /me`; shown translated |
| created_at | timestamptz | Not used |

## Password hash (stored in `users.password_hash`)

```text
pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>
```

- `iterations`: 600000 for every hash the app writes. Tests may write lower counts for fake users.
- `salt_b64`: 16 random bytes (`secrets.token_bytes`), standard base64.
- `hash_b64`: 32 bytes of PBKDF2-HMAC-SHA256, standard base64.
- Any value that doesn't follow this format never verifies. The check returns `False` and never raises an error.

## Demo accounts (fixed in `app/seed_demo_users.py`)

| username | full_name | role | Password from |
|---|---|---|---|
| `demo.doctor` | `Dra. Ana Demo` | doctor | `DEMO_DOCTOR_PASSWORD` |
| `demo.nurse` | `Enf. Luis Demo` | nurse | `DEMO_NURSE_PASSWORD` |

The names are synthetic. Each password must be at least 8 characters (after trimming) and comes only from the environment or `backend/.env`.

The command never deletes an account. Its two outcomes are:

- **Absent → created.**
- **Present → updated**: the hash, full name and role are reset to the definition.

## Access token (not stored)

JWT signed with HS256 using `AUTH_SECRET`.

| Claim | Value |
|---|---|
| `sub` | user id as a string, e.g. `"1"` |
| `iat` | issue time (seconds since epoch) |
| `exp` | `iat` + `ACCESS_TOKEN_MINUTES` × 60 |

The token holds no name, role or other personal data. All three claims are required. A token is rejected if it is expired (no grace period), uses a different algorithm, has a wrong signature, or has a non-integer `sub`.

## Settings (environment or `backend/.env`; placeholders only in `backend/.env.example`)

| Name | Required | Default | Rule | Used by |
|---|---|---|---|---|
| `AUTH_SECRET` | yes | — | ≥ 32 characters after trimming | app (startup check) |
| `ACCESS_TOKEN_MINUTES` | no | 480 | whole number 1–1440 | app (startup check) |
| `DEMO_DOCTOR_PASSWORD` | for the command | — | ≥ 8 characters | seed command only |
| `DEMO_NURSE_PASSWORD` | for the command | — | ≥ 8 characters | seed command only |

The existing settings `DATABASE_URL` and `CORS_ORIGINS` are unchanged.

## Browser session (`sessionStorage['pdm.session']`)

```json
{ "token": "<jwt>", "user": { "username": "demo.nurse", "full_name": "Enf. Luis Demo", "role": "nurse" } }
```

- It is valid only if `token`, `username`, `full_name` and `role` are all non-empty strings. Anything else is treated as signed out, and the item is removed.
- It is written after a successful sign-in, and `user` is refreshed by the `/me` check when the app loads.

**State transitions:**

```text
signed out ──sign in ok──▶ signed in ──logout──▶ signed out
signed in ──backend 401──▶ signed out (sessionExpired = true)
```

`sessionExpired` is cleared by the next sign-in.

## Unchanged from TS-05

`localStorage['pdm.language']` (the selected language) is not touched. Logout does not reset the language.
