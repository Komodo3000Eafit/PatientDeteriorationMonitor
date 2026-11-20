# Data Model: Backend Deployment (TS-10)

This story is mostly infrastructure and security controls, so the "entities" are configuration and runtime objects, not database tables. No new database table is added (the rate-limit counter is in-process memory). Existing tables (TS-03) are unchanged; only forward migrations are applied.

## Deploy workflow

The GitHub Actions definition that publishes the backend.

| Field | Value / rule |
|---|---|
| File | `.github/workflows/deploy.yml`, `name: Deploy backend` |
| Trigger | `workflow_run` on workflow `CI`, `types: [completed]` |
| Run condition | `conclusion == 'success'` **and** `head_branch == 'main'` |
| Permissions | `id-token: write`, `contents: read` (nothing else) |
| Steps (in order) | checkout → setup-python 3.13 → install backend requirements → **migrate** (`alembic upgrade head`, forward-only) → `azure/login@v2` (OIDC) → `azure/webapps-deploy@v3` |
| Never runs | for any branch other than `main`; for fork pull requests; `alembic downgrade` |
| Secrets used | `DATABASE_URL`, `AUTH_SECRET` (as env/app settings); never printed |

Relationships: depends on the **CI workflow** (TS-09) succeeding; uses the **OIDC federated credential** to reach the **App Service**; applies migrations to the Neon database (TS-02/TS-03).

## OIDC federated credential

The trust that lets the workflow get a short-lived Azure token.

| Field | Value / rule |
|---|---|
| Azure identity | app registration or user-assigned managed identity |
| Federated subject | scoped to this repository and `main` (or the deploy workflow) |
| Role | Contributor / Website Contributor on the App Service |
| Identifiers in GitHub | `client-id`, `tenant-id`, `subscription-id` (repository secrets/variables; identifiers, not credentials) |
| Long-lived secret | **none** — no publish profile, no client secret |

Lifecycle: created once by hand (quickstart §1); not changed by any workflow run.

## App Service configuration

The existing Azure host and its settings.

| Field | Value / rule |
|---|---|
| Location / RG | Brazil South / `rg-patient-monitor` |
| Runtime / tier | Linux, Python 3.13, Free F1 |
| App setting `DATABASE_URL` | Neon **pooled** connection string (D-29) |
| App setting `AUTH_SECRET` | ≥ 32 characters (TS-06); stored as a secret |
| App setting `ACCESS_TOKEN_MINUTES` | whole number 1–1440 (default 480, TS-06) |
| App setting `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` (Oryx installs `requirements.txt`) |
| App setting `WEBSITES_PORT` | `8000` (matches the startup `--bind`) |
| Startup command | `gunicorn app.main:app -k uvicorn.workers.UvicornWorker --workers 2 --bind=0.0.0.0:8000 --timeout 120` |
| Always On | off (not offered on F1); no probe on `/health` (D-30) |

Validation: the app refuses to start if `AUTH_SECRET` or `ACCESS_TOKEN_MINUTES` is invalid (existing TS-06 behaviour), so a misconfigured deploy fails fast.

## Login rate-limit record (runtime, in memory)

| Field | Value / rule |
|---|---|
| Scope | per client identity (source address), per worker process |
| Window | fixed window, default 60 s (`LOGIN_RATE_WINDOW_SECONDS`) |
| Limit | default 10 attempts per window (`LOGIN_RATE_LIMIT`) |
| Over limit | HTTP 429, fixed message, no input echoed |
| Reset | counter resets when the window elapses |
| Persistence | none (in-process memory; not a database table) |

Relationships: guards `POST /auth/login` (TS-06). Does not change the login success/failure contract within the limit.

## Security headers (runtime, per response)

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |

Applied by a middleware to every response, including errors. The CSP leaves room for same-origin assets TS-11 will add; a `# TS-11` note marks where to revisit.

## CORS origins (parsing rule change)

Not a new entity; a stricter rule on the existing `CORS_ORIGINS` parsing (TS-04/D-33).

| Input entry | Behaviour |
|---|---|
| Blank between commas (`a,,b`) | dropped (unchanged) |
| `*` | startup fails (unchanged) |
| `null` or any non-`scheme://host[:port]` (`http://`, `example.com`) | **startup fails** (new) |
| Value made only of invalid entries | **startup fails** (new; no silent fallback to default) |
| Unset / fully blank value | default `http://localhost:5173` (unchanged) |

Error messages are fixed text and never include the configured value.
