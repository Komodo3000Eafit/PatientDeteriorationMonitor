# TS-10 — Backend deployment

**Story:** [specs/010-backend-deployment/](.) (spec, plan, tasks, research, data-model, contracts, quickstart)
**Branch:** `010-backend-deployment`
**Constitution:** v1.2.0 · **Decision:** [D-42](../../docs/DECISIONS.md)

## What this adds

Automatic backend deployment to the existing Azure App Service after CI passes on `main`, plus the three carry-over security controls the earlier reviews assigned to TS-10.

- **Deploy workflow** `.github/workflows/deploy.yml` (`name: Deploy backend`): triggered by `workflow_run` when the `CI` workflow finishes **successfully on `main`** (guarded so fork PRs and other branches never deploy). Authenticates with **OIDC** (`azure/login@v2`, no publish profile or client secret), runs a **forward-only** `alembic upgrade head` (never `downgrade`), then deploys with `azure/webapps-deploy@v3`. TS-09's `ci.yml` is left unchanged (D-38).
- **Startup / runtime:** `gunicorn==27.0.1` added to `backend/requirements.txt`; App Service startup command `gunicorn app.main:app -k uvicorn.workers.UvicornWorker --workers 2 --bind=0.0.0.0:8000 --timeout 120`.
- **Login rate limiting** (`backend/app/auth.py`): in-memory per-client fixed-window limiter; HTTP 429 after the threshold (`LOGIN_RATE_LIMIT`, default 10 / `LOGIN_RATE_WINDOW_SECONDS`, default 60), fixed message, never reveals the username.
- **CORS hardening** (`backend/app/main.py`): `parse_cors_origins` now rejects `null` and any entry that is not a valid `scheme://host[:port]` origin, with a fixed message that never echoes the value (the existing `*` and blank behaviour is kept).
- **Security headers** (`backend/app/security_headers.py`, mounted in `main.py`): `Content-Security-Policy: default-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` on **every** response, including errors. CSP left same-origin-friendly for TS-11 (a `# TS-11` note marks it); no static-file serving added.
- **Docs:** `DEVELOPMENT.md` §7.2 (trigger, OIDC setup, app settings, migrations, URL/health check); `docs/DECISIONS.md` D-42; `docs/PROJECT_STATUS.md` and `docs/BACKLOG.md` show TS-10 as 🔄 (will be ✅ after the live deploy verifies).

## Tests

Local backend suite: **329 passed, 0 failed** (289 baseline + 40 new TS-10 tests). The same tests run in CI before merge.

- `tests/test_login_rate_limit.py` — within-limit 200 + wrong-credential 401, (limit+1) → 429, window reset, two clients independent, invalid/default settings.
- `tests/test_cors_origins.py` — null/`http://`/`example.com`/other malformed rejected, all-invalid does not fall back to default, wildcard still rejected, valid lists parse, default only when unset/blank.
- `tests/test_security_headers.py` — the three headers on 200 (`/health`), 401 (`/me`), 422 (`/auth/login`) and 404, with `frame-ancestors 'none'`.

## Security review (read-only)

No blocking findings. Confirmed: OIDC only (no stored credential), the guard limits the deploy to CI success on `main` (no fork-PR path), the migrate step runs only `alembic upgrade head` (repo grep: `downgrade` appears only in two deploy.yml comments that forbid it, never as a command), no step echoes a secret, `ci.yml` is unchanged, the headers are set on every response including errors, and the CORS/rate-limit messages never echo input, and nothing probes `/health`.

Informational (not blocking, accepted at F1/academic scope):
- the limiter keys on the leftmost `X-Forwarded-For`, which a client can spoof; revisit when a trusted proxy chain is known;
- the rate-limit counter is per gunicorn worker (research R6).

## Who did what (from `agent-log.csv`)

- **qa-tester** — T001 baseline (289 pass), T010 the 40 security-control tests (suite 329 pass).
- **devops** — T002 `gunicorn`, T006 `deploy.yml`, T007 `DEVELOPMENT.md` §7.2.
- **backend-dev** — T003 login rate limiting, T004 CORS hardening, T005 security-headers middleware.
- **orchestrator** — assignments + verifications, T008 D-42, T009 status/backlog, this PR record; logged the read-only reviewer's work.
- **security-reviewer** — T011 read-only review (no blocking findings, two informational notes).

## Remaining before merge / after merge (human — T013–T015)

1. **T013 one-time Azure/GitHub setup:** create the OIDC app registration / federated credential scoped to this repo and `main`, assign a role on the App Service; add the GitHub secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `DATABASE_URL`, `AUTH_SECRET`; set the App Service settings (`DATABASE_URL`, `AUTH_SECRET`, `ACCESS_TOKEN_MINUTES`, `SCM_DO_BUILD_DURING_DEPLOYMENT=true`, `WEBSITES_PORT=8000`) and the gunicorn startup command; confirm Always On is off and nothing probes `/health`. **Replace `<app-service-name>` in `deploy.yml` with the real app name.**
2. **T014 deploy and verify:** merge (three CI checks green), watch `Deploy backend` run, then check `https://<app>.azurewebsites.net/health` returns 200 with `database: "ok"` and the three security headers; paste the result below.
3. **T015:** mark TS-10 ✅ in `docs/BACKLOG.md` and `docs/PROJECT_STATUS.md` with the deployed URL.

**Deployed /health:** <url + result>  _(fill in after T014)_
