# Data Model: React App Skeleton (TS-04)

No database changes. This story only has two settings and the start page's display state.

## Settings

| Setting | Where | Format | Default | Rules |
|---|---|---|---|---|
| `VITE_API_BASE_URL` | frontend: `frontend/.env` (git-ignored) or the shell at build/dev time; example in `frontend/.env.example` | one absolute URL, e.g. `http://localhost:8000` | `http://localhost:8000` when unset or blank | trimmed, trailing `/` removed; read **only** in `src/api/client.js` (FR-004) |
| `CORS_ORIGINS` | backend: environment variable, or `backend/.env` (git-ignored, python-dotenv, terminal value wins) | comma-separated origins, e.g. `http://localhost:5173,https://example.azurestaticapps.net` | `["http://localhost:5173"]` when unset, empty or only spaces/commas | each entry trimmed and trailing `/` removed; empty entries dropped; any `*` entry → startup error (FR-005, FR-006) |

Neither setting is a secret (FR-011).

## Health status (start page display state)

Built from one `GET /health` call ([contracts/health-ui.md](contracts/health-ui.md)).

| State | When | Shown (Spanish) |
|---|---|---|
| `checking` | page loaded, no answer yet (≤ 10 s) | checking message |
| `ok` | 200, valid body, `database == "ok"` | API working, version, database available |
| `databaseUnavailable` | 200, valid body, `database` anything other than `"ok"` | API working, version, database not available, reload hint |
| `unreachable` | network error, timeout (10 s), non-2xx status, invalid JSON, or `status` / `version` missing or not a non-empty string | backend cannot be reached, reload hint |

Transitions: `checking` → exactly one of the other three, once per page load. No transition back (no retry, no polling; reload to check again).
