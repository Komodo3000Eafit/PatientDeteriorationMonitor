# Implementation Plan: Backend Deployment

**Branch**: `010-backend-deployment` | **Date**: 2026-11-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/010-backend-deployment/spec.md`

## Summary

TS-10 deploys the FastAPI backend to the existing Azure App Service (Brazil South, resource group `rg-patient-monitor`, Linux, Python 3.13, Free F1) and adds the three security controls the earlier reviews assigned to it. The pieces:

- **A separate deploy workflow** `.github/workflows/deploy.yml` (`name: Deploy backend`), triggered by `workflow_run` when the existing CI workflow (`name: CI`) finishes successfully on `main`. It authenticates to Azure with **OIDC** (`azure/login@v2` with `client-id`/`tenant-id`/`subscription-id`, no secret), runs the forward-only migration (`alembic upgrade head`) against the pooled Neon `DATABASE_URL`, then deploys with `azure/webapps-deploy@v3`. The guard `if: github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == 'main'` makes it run only for a green CI on `main`, never for fork pull requests. TS-09's `ci.yml` is left unchanged.
- **App Service startup command**: `gunicorn app.main:app -k uvicorn.workers.UvicornWorker --workers 2 --bind=0.0.0.0:8000 --timeout 120`, stored as the App Service "Startup Command". `gunicorn` is added to `backend/requirements.txt` (pinned); the worker count is 2 on F1.
- **App settings**: `DATABASE_URL`, `AUTH_SECRET`, `ACCESS_TOKEN_MINUTES` set on the App Service from GitHub secrets via the deploy workflow (or once by hand); `SCM_DO_BUILD_DURING_DEPLOYMENT=true` so Oryx installs `requirements.txt`; `WEBSITES_PORT=8000`. No `Always On` (Free F1 does not offer it), no auto-heal ping at `/health` (D-30).
- **Security controls (application code)**: login rate limiting on `POST /auth/login` (429 after a threshold per client), stricter `CORS_ORIGINS` parsing (reject null/malformed entries), and a middleware adding the response security headers (CSP with `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`). All three get critical-path tests.
- **Static-file serving is deferred to TS-11**: TS-10 does not mount the React build or add a SPA fallback; it only prepares the single-origin shape (CORS stays for local dev, CSP leaves room for same-origin assets). See [research.md](research.md) R8.

Docs: a deployment section in `DEVELOPMENT.md` (trigger, one-time OIDC setup, app settings, how migrations run, the deployed URL); `DECISIONS.md` gets D-42 (TS-10 decisions); `PROJECT_STATUS.md` and `BACKLOG.md` show TS-10 done with the Azure URL.

## Technical Context

**Language/Version**: Python 3.13 (backend); GitHub Actions workflow YAML; Azure App Service (Linux) configuration.

**Primary Dependencies**: runtime adds `gunicorn` (pinned) to `backend/requirements.txt`; existing `uvicorn` supplies the `uvicorn.workers.UvicornWorker` class. Workflow actions: `actions/checkout@v4`, `actions/setup-python@v5`, `azure/login@v2` (OIDC), `azure/webapps-deploy@v3` (official Azure actions). No new runtime library for rate limiting or headers — both are implemented with the standard library and FastAPI middleware (D-23, D-31: no compiled dependency).

**Storage**: PostgreSQL on Neon (existing), reached through the pooled `DATABASE_URL` and `app.db` (TS-02); migrations through Alembic (TS-03). The rate-limit counter is in-process memory (per worker), not a new store.

**Testing**: pytest (backend). New tests: login rate limiting (429 after threshold, success within the limit, window reset), `CORS_ORIGINS` rejection of null/malformed entries, presence of the security headers on a response. The deployed `/health` check is a manual/quickstart step (reachability with one retry for a waking database).

**Target Platform**: Azure App Service, Linux, Python 3.13, Free F1, Brazil South, resource group `rg-patient-monitor`. CI/CD on GitHub-hosted `ubuntu-latest` runners.

**Project Type**: web application (backend + frontend). This story touches the backend app, one new deploy workflow and docs; it does not touch the frontend or `ci.yml`.

**Performance Goals**: after a successful deploy, `GET /health` on the Azure URL returns 200 with `database: "ok"` within one retry (SC-001). Not a throughput story; F1 is a single small instance and the demo load is tiny.

**Constraints**: Free F1 (no Always On, 60 CPU-minutes/day quota, one small instance); no long-lived Azure credential anywhere (OIDC only); secrets never in the repo or workflow logs; no `alembic downgrade` in CI/CD; nothing frequently probes `/health` (D-30); keep it simple (D-23); no compiled dependency (D-31).

**Scale/Scope**: 1 new workflow file (~50 lines), ~3 small backend code changes (rate-limit, CORS parsing, headers middleware) plus their tests, 1 line added to `requirements.txt`, 1 startup command, and doc updates (`DEVELOPMENT.md`, `docs/DECISIONS.md`, `docs/PROJECT_STATUS.md`, `docs/BACKLOG.md`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Spec-driven and traceable**: every workflow element, code change and doc edit maps to an AC/FR (traceability table below).
- [x] **II. Small Scrum story**: one deploy workflow, three small security controls, a startup command and docs — a single technical story.
- [x] **III. Independence**: depends on TS-03, TS-06, TS-09, exactly as `docs/BACKLOG.md` lists; it changes backend app code (auth, CORS parsing, a new middleware) and adds a workflow, but adds no functional-story code and does not touch `ci.yml`. The security controls were assigned to TS-10 by the TS-04 and TS-06 reviews (`docs/PROJECT_STATUS.md`).
- [x] **IV. Multi-agent**: each task has an owner agent, logged in `agent-log.csv`:
  - **devops**: `deploy.yml`, the App Service startup command and settings, OIDC setup, and the `DEVELOPMENT.md` deployment section;
  - **backend-dev**: login rate limiting, `CORS_ORIGINS` hardening, the security-headers middleware, the `gunicorn` requirement;
  - **qa-tester**: the critical-path tests for the three controls and the deployed-`/health` quickstart check;
  - **security-reviewer**: OIDC (no stored credential), secrets handling, no-downgrade check, no `/health` probe, CORS and header review;
  - **orchestrator**: `DECISIONS.md` (D-42), `PROJECT_STATUS.md`, `BACKLOG.md`, the agent log and the PR record.
- [x] **V. Clinical logic**: not touched; scoring stays in `app.scoring`; no triage level is changed.
- [x] **VI. Data privacy**: only the Neon connection string and `AUTH_SECRET` as secrets (never in the repo or logs); no patient data; the deploy uses OIDC, not a stored credential.
- [x] **VII. Tests**: the three security controls are security critical paths (Principle VII) and get automated tests that run in the existing CI before this story can merge.
- [x] **VIII. Security baseline**: adds login rate limiting, input hardening on `CORS_ORIGINS`, and OWASP response headers; secrets only via environment/GitHub secrets; authentication on clinical views is unchanged (TS-06).
- [x] **IX. Deployable at low cost**: deploys to the existing Azure App Service (Free F1) via GitHub Actions and OIDC; no new paid service; Neon unchanged.
- [x] **X. Stack**: Python (FastAPI), PostgreSQL; unchanged. `gunicorn` is a standard ASGI process manager, pure Python, no compiled parts (D-31).
- [x] **XI. Language**: workflow, code, comments and docs in English; no UI text in this story; glossary terms unaffected.
- [x] **XII. Simplicity**: a single small workflow, official Azure actions, in-memory rate limiting and a small middleware; no new service, store, framework or library beyond `gunicorn`. Static serving and the SPA fallback are left to TS-11, not pulled forward.

**Post-design re-check (after Phase 1)**: all items pass. Phase 1 confirmed: `workflow_run` is the simplest trigger that runs after CI without duplicating the checks or touching `ci.yml` (R1); OIDC via `azure/login@v2` needs no secret (R2); the migration runs as a gated workflow step through `app.db`, forward-only (R4); in-memory per-worker rate limiting is acceptable at this scale and avoids a new store (R6); the CSP is written to not block the same-origin assets TS-11 will add (R8). No Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/010-backend-deployment/
├── spec.md
├── plan.md                 # This file
├── research.md             # Phase 0: trigger, OIDC, deploy action, startup command, migration step, rate limiting, headers, static deferral, cost
├── data-model.md           # Phase 1: deploy workflow, OIDC credential, app settings, rate-limit record, security headers
├── quickstart.md           # Phase 1: one-time OIDC/app-settings setup, local tests, trigger a deploy, verify /health on Azure
├── contracts/
│   ├── deploy-workflow.md   # Phase 1: trigger, jobs, OIDC, migration, deploy steps; app settings; startup command
│   └── security-controls.md # Phase 1: login rate-limit, CORS parsing rules, response headers
├── checklists/
│   └── requirements.md
└── tasks.md                # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
.github/
└── workflows/
    ├── ci.yml              # UNCHANGED (TS-09): three checks; deploy keys off its success
    └── deploy.yml          # NEW: deploy workflow (OIDC, migrate, deploy), workflow_run on CI

backend/
├── requirements.txt        # CHANGED: add gunicorn (pinned)
└── app/
    ├── main.py             # CHANGED: stricter CORS parsing; mount security-headers middleware
    ├── auth.py             # CHANGED: login rate limiting on POST /auth/login
    └── security_headers.py # NEW (small): middleware that sets CSP, X-Content-Type-Options, X-Frame-Options
backend/tests/              # CHANGED: tests for rate limiting, CORS rejection, security headers

DEVELOPMENT.md              # CHANGED: deployment section (trigger, OIDC, app settings, migrations, URL)
docs/DECISIONS.md           # CHANGED: new D-42 (TS-10 decisions)
docs/PROJECT_STATUS.md      # CHANGED: TS-10 done, deployed URL, carry-over items resolved
docs/BACKLOG.md             # CHANGED: TS-10 spec link and status
```

**Structure Decision**: the existing web-application layout is unchanged. The deploy workflow lives in GitHub's required location; backend changes stay inside `backend/app`. The new rate-limit and header code live next to the code they protect (`auth.py`, `main.py`, a small `security_headers.py`), keeping the diff small and local (D-23).

### Design notes

- **`deploy.yml` outline** (devops writes it; values from research):
  - `name: Deploy backend`; trigger `on.workflow_run.workflows: ["CI"]`, `types: [completed]`.
  - `permissions: { id-token: write, contents: read }` (OIDC needs `id-token: write`; nothing else).
  - one job `deploy` (`runs-on: ubuntu-latest`, `timeout-minutes: 15`), guarded by `if: ${{ github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == 'main' }}`.
  - steps: checkout (`persist-credentials: false`); setup-python 3.13; `pip install -r backend/requirements.txt`; **migrate** — `alembic upgrade head` run from `backend/` with `DATABASE_URL` from the GitHub secret, never `downgrade`; `azure/login@v2` with `client-id`, `tenant-id`, `subscription-id` from repository variables/secrets (OIDC, no password); `azure/webapps-deploy@v3` with `app-name` and the `backend` package.
  - app settings (`DATABASE_URL`, `AUTH_SECRET`, `ACCESS_TOKEN_MINUTES`, `SCM_DO_BUILD_DURING_DEPLOYMENT`, `WEBSITES_PORT`) and the startup command are set once by hand or via an `az webapp config` step; secrets come from GitHub secrets, never printed.
- **Startup command**: `gunicorn app.main:app -k uvicorn.workers.UvicornWorker --workers 2 --bind=0.0.0.0:8000 --timeout 120`. Set in the App Service "Startup Command"; `app.main:app` resolves because the deployed package root is `backend/` (so `app` is importable), with `WEBSITES_PORT=8000`.
- **Login rate limiting** (backend-dev): a small in-memory fixed-window limiter keyed by client address, applied in `POST /auth/login`; after N attempts within the window it returns HTTP 429 with a fixed message (never echoing input); a configurable `LOGIN_RATE_LIMIT` / window with sensible defaults (e.g. 10 attempts / 60 s). Per-worker memory is acceptable at F1 scale (R6); a successful login within the limit is unaffected.
- **CORS parsing** (backend-dev): extend `parse_cors_origins` so a non-empty but invalid entry (not `scheme://host[:port]`, e.g. `null`, `http://`, `example.com`) raises the existing `ValueError` with fixed text (no value echoed), in addition to the current `*` rejection; a blank entry between commas is still dropped, but a value consisting only of invalid entries fails startup rather than silently falling back to the default.
- **Security headers** (backend-dev): a tiny ASGI/HTTP middleware in `security_headers.py` added in `main.py` that sets on every response: `Content-Security-Policy: default-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'` (room left for same-origin assets TS-11 adds), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`.
- **`DEVELOPMENT.md` deployment section**: the trigger chain (push to `main` → CI green → deploy), the one-time OIDC setup (app registration / federated credential scoped to this repo and `main`, role assignment on the App Service), the app settings list, how migrations run (forward-only in the workflow), the startup command, and how to read the deployed URL and check `/health`.
- **`DECISIONS.md` D-42**: separate `deploy.yml` via `workflow_run`; OIDC (no publish profile); forward-only migration step; gunicorn + uvicorn worker startup, 2 workers on F1; in-memory per-worker login rate limiting; CORS null/malformed rejection; security headers; static serving deferred to TS-11. Rejected: adding deploy to `ci.yml`, publish-profile secret, `alembic downgrade`, a rate-limit store/library, Always On ping on `/health`.
- **`PROJECT_STATUS.md`**: TS-10 ✅ with the deployed URL; mark the carry-over items done (no downgrade; no `/health` probe; `AUTH_SECRET` as a secret; login rate limiting; CORS null/malformed; security headers); next step TS-11.

### Traceability

| Requirement / AC | Delivered by |
|---|---|
| FR-001, AC1 (publish to the App Service; startup) | `deploy.yml` deploy step; startup command; quickstart `/health` check |
| FR-002, AC2 (deploy only after CI passes, `main` only) | `deploy.yml` `workflow_run` trigger + `if` guard |
| FR-003, AC3 (OIDC, no stored credential) | `azure/login@v2` with `id-token: write`; security review |
| FR-004, FR-005, AC4 (app settings, `AUTH_SECRET` secret) | app settings from GitHub secrets; `DEVELOPMENT.md` |
| FR-006, AC5 (no downgrade) | migrate step runs only `alembic upgrade head`; security review |
| FR-007, AC6 (no frequent `/health` probe) | no Always On, no auto-heal ping; `DEVELOPMENT.md` note (D-30) |
| FR-008, AC7 (login rate limiting) | `auth.py` limiter; rate-limit tests |
| FR-009, AC8 (CORS null/malformed rejection) | `parse_cors_origins` change; CORS tests |
| FR-010, AC9 (security headers) | `security_headers.py` middleware; header tests |
| FR-011, AC1 (reachable `/health` with `database: ok`) | deploy + migration + settings; quickstart verification |
| FR-012, AC5 (forward migration applied) | gated `alembic upgrade head` step |
| FR-013, AC10 (docs and status) | `DEVELOPMENT.md`, `DECISIONS.md` D-42, `PROJECT_STATUS.md`, `BACKLOG.md` |
| FR-014 (tests for the controls) | pytest tests for rate limiting, CORS, headers |

## Complexity Tracking

No violations.
