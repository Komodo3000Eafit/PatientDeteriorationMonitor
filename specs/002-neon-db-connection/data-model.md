# Data Model: Neon Database Connection (TS-02)

No database tables in this story (TS-03 adds them). The only "data" is configuration and the health response.

## Database connection setting

| Field | Source | Rules |
|---|---|---|
| `DATABASE_URL` | Environment variable. Locally loaded from the git-ignored `backend/.env`; in CI/CD from the GitHub secret `DATABASE_URL` (D-29); in Azure from App Service settings (TS-10) | Neon pooled string, `postgresql://...` (or `postgres://...`) with `sslmode` / `channel_binding` query params. Converted in code to `postgresql+pg8000://...` with the `sslmode` and `channel_binding` params removed (pg8000 doesn't accept them) and the rest unchanged; TLS is turned on by the code through an SSL context. Missing or empty = not configured. Never logged, returned or committed |

## Health status (extends TS-01)

| Field | Type | Values | Meaning |
|---|---|---|---|
| `status` | string | `"ok"` | The app is up (unchanged from TS-01) |
| `version` | string | e.g. `"0.1.0"` | `app.__version__` (unchanged from TS-01) |
| `database` | string | `"ok"` \| `"unavailable"` | Result of the database check for **this** request |

### `database` value rules

| Situation | `database` |
|---|---|
| `DATABASE_URL` missing or empty | `"unavailable"` |
| URL malformed (engine can't be created) | `"unavailable"` |
| Connection fails or takes longer than 5 s | `"unavailable"` |
| `SELECT 1` fails or takes longer than 5 s | `"unavailable"` |
| `SELECT 1` succeeds | `"ok"` |

No state is kept between requests except the reusable engine (connection pool); each request checks again, so the value can change from `"unavailable"` to `"ok"` without restarting the app.
