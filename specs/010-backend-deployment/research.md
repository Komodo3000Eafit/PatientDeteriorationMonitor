# Research: Backend Deployment (TS-10)

Phase 0 decisions. Each resolves a point left open in the spec's Assumptions or the plan's Technical Context. Format: Decision / Rationale / Alternatives considered.

## R1 — Deploy trigger: `workflow_run` after CI, in a separate workflow

**Decision**: a separate `.github/workflows/deploy.yml` with `on.workflow_run.workflows: ["CI"]`, `types: [completed]`, guarded by `if: github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == 'main'`.

**Rationale**: it runs the deploy only after the whole CI workflow (the three checks) has passed on `main`, without re-running or duplicating the checks, and without editing TS-09's `ci.yml` (which must stay `contents: read` and secret-free, D-38). `workflow_run` always runs in the context of the default branch and uses the base repository's token, so a fork pull request cannot trigger a deploy or reach the OIDC identity. Matches the clarify decision (Q5 = A).

**Alternatives considered**:
- A `deploy` job inside `ci.yml` with `needs: [backend, frontend, dependencies]` and an `if: github.ref == 'refs/heads/main'` — rejected: it forces deploy permissions (`id-token: write`) and OIDC into the workflow TS-09 deliberately kept least-privilege, and mixes two concerns in one file.
- GitHub Environments with required reviewers / a deployment gate — more setup than the academic scope needs (D-23); the `main` + CI-success guard is enough.
- A push-to-`main` trigger on `deploy.yml` that re-runs the checks — duplicates CI and can deploy a commit whose checks are still running or red.

## R2 — Azure authentication: OIDC via `azure/login@v2`, no stored credential

**Decision**: authenticate with `azure/login@v2` using `client-id`, `tenant-id` and `subscription-id` (stored as repository secrets/variables, which are identifiers, not credentials) and `permissions: id-token: write`. A one-time manual setup on Azure creates an app registration (or user-assigned managed identity) with a **federated credential** scoped to this repository and the `main` branch / the deploy workflow, and grants it the Contributor (or Website Contributor) role on the App Service.

**Rationale**: OIDC exchanges a short-lived GitHub-issued token for an Azure token at run time, so no publish profile or client secret is ever stored in the repo or GitHub secrets (FR-003, AC3, constitution VIII and the Technology/Deployment constraints: "deploys to Azure using OIDC federation; cloud credentials MUST NOT be stored"). D-18 already chose OIDC.

**Alternatives considered**:
- Publish profile as a GitHub secret (`azure/webapps-deploy` with `publish-profile`) — rejected by the spec and the constitution: a long-lived credential in a secret.
- A service-principal client secret (`creds` JSON) — still a long-lived secret; OIDC removes it.
- The subscription/tenant/client IDs are not secrets in the security sense, but are kept as repository secrets/variables to avoid pinning account identifiers in the committed workflow.

## R3 — Deploy action and package: `azure/webapps-deploy@v3` with the backend as the package

**Decision**: deploy with `azure/webapps-deploy@v3`, `app-name: <the existing app>`, `package: backend`. Set `SCM_DO_BUILD_DURING_DEPLOYMENT=true` so Oryx runs `pip install -r requirements.txt` on the App Service during deployment.

**Rationale**: the official action is the simplest supported path from GitHub Actions to App Service and works with the OIDC login from R2. Deploying the `backend/` folder (which holds `requirements.txt` and `app/`) keeps `app.main:app` importable with the chosen startup command (R5). Oryx build on the server avoids shipping a virtualenv and matches a Python Linux App Service's defaults.

**Alternatives considered**:
- `az webapp deploy` / `az webapp up` CLI in a `run:` step — works, but the action is clearer and handles the zip/deploy details.
- Building a wheel or container image — more machinery than F1 needs (D-23); no container registry is set up.
- Deploying the repo root — would put `frontend/` and docs on the server and make the import path awkward; `backend/` is the app root.

## R4 — Migrations: a gated forward-only step in the deploy workflow

**Decision**: before the deploy step, a workflow step runs `alembic upgrade head` from `backend/`, with `DATABASE_URL` set from the GitHub secret (the pooled Neon string). It never runs `downgrade`. If the step fails, the job fails and nothing is deployed.

**Rationale**: makes the deploy reproducible — the schema is brought to `head` automatically every release (Q1 = A). Reusing Alembic through `app.db` (TS-02/TS-03) keeps the same URL conversion, TLS context and 5 s timeouts, and the whole run is one transaction through PgBouncer transaction mode, already confirmed on Neon (D-32, TS-03 R3). Running it in the GitHub runner (not on the App Service) keeps it off the F1 instance and visible in the workflow log. Forward-only satisfies "never run `alembic downgrade` in CI/CD" (FR-006, AC5, D-30 note). `alembic upgrade head` is idempotent, so a release with no new migration is a no-op.

**Alternatives considered**:
- Running migrations on app startup (entrypoint) — rejected: every worker boot would try to migrate, racing on the Free instance, and a bad migration would crash the app instead of failing the deploy cleanly.
- Keeping migrations fully manual (D-32 status quo) — rejected by Q1: a forgotten manual step breaks the deployed app's `database: ok`; the gated step is safer and still forward-only.
- A second direct (non-pooled) connection for migrations — not needed; the pooled URL in transaction mode already works for Alembic (D-32).

## R5 — Startup command: gunicorn with a uvicorn worker

**Decision**: App Service "Startup Command" = `gunicorn app.main:app -k uvicorn.workers.UvicornWorker --workers 2 --bind=0.0.0.0:8000 --timeout 120`, with `WEBSITES_PORT=8000`. Add `gunicorn` (pinned) to `backend/requirements.txt`; `uvicorn` (already pinned) provides the worker class.

**Rationale**: gunicorn is the standard production process manager for ASGI apps on App Service; it supervises workers and restarts a crashed one. The uvicorn worker runs the FastAPI ASGI app. Two workers give a little concurrency while staying within the ~1 GB F1 instance; `--timeout 120` tolerates a slow first request while Neon wakes from scale-to-zero. `app.main:app` resolves because the deployed package root is `backend/` (Q4 = A). Gunicorn is pure Python, so it does not hit the Smart App Control problem that ruled out compiled wheels (D-31) — and it only runs on the Linux App Service anyway.

**Alternatives considered**:
- Plain `uvicorn app.main:app` single process — no supervisor and no restart-on-crash; fine locally, weaker in "production".
- Letting Oryx auto-detect its default gunicorn command — it often guesses the module wrong for a nested layout; an explicit command is predictable.
- More workers (4+) — risks memory pressure on F1; 2 is a safe default and can be tuned later.

## R6 — Login rate limiting: in-memory fixed window, per client

**Decision**: a small in-memory fixed-window limiter keyed by client address, applied inside `POST /auth/login`. After N attempts in the window it returns HTTP 429 with a fixed message (no input echoed). Defaults ~10 attempts / 60 s, overridable by an environment setting (e.g. `LOGIN_RATE_LIMIT`, `LOGIN_RATE_WINDOW_SECONDS`), validated like the other auth settings. Counts reset when the window passes; a valid login within the limit is unaffected.

**Rationale**: slows credential stuffing / brute force on the one unauthenticated endpoint (FR-008, AC7, constitution VIII), with no new store or dependency (D-23, D-31). At F1 scale (one instance, 2 workers, demo traffic) per-worker memory is acceptable; the limit is per client so one attacker cannot lock out everyone. Keying on the client address uses the platform-provided client info; behind the App Service front end the relevant header is considered in the contract.

**Alternatives considered**:
- `slowapi` / `fastapi-limiter` + Redis — a new library and a new service for a prototype; rejected (D-23, IX cost control).
- A database-backed counter — extra writes to Neon on every login attempt, waking the database; rejected (cost control, D-30 spirit).
- A global (not per-client) limit — would let one attacker deny all logins; rejected.
- Exact thresholds are a plan/contract default, not hard-coded magic; made configurable so the demo can relax them if needed.

## R7 — Security headers: a small middleware on every response

**Decision**: a tiny HTTP middleware (`backend/app/security_headers.py`) added in `main.py` sets on every response: `Content-Security-Policy: default-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'`, `X-Content-Type-Options: nosniff`, and `X-Frame-Options: DENY`.

**Rationale**: covers the three carry-over items (CSP, `X-Content-Type-Options`, frame-ancestors) with one small, framework-native middleware and no dependency (FR-010, AC9). `frame-ancestors 'none'` (plus `X-Frame-Options: DENY` for older agents) forbids framing. The CSP is deliberately conservative but allows same-origin (`'self'`) scripts, styles and assets, so it will not block the React build TS-11 serves from the same origin (R8). `nosniff` stops content-type sniffing.

**Alternatives considered**:
- `secure`/`starlette-csp` libraries — a dependency for ~5 header lines; rejected (D-23).
- Setting headers at the App Service / reverse-proxy level — ties the control to the host and would not show in local runs or tests; keeping it in the app makes it testable in CI (FR-014).
- A stricter CSP with explicit asset hosts — premature; TS-11 will finalise the policy when it adds the bundle. A `# TS-11` note marks where to revisit.

## R8 — Static-file serving deferred to TS-11

**Decision**: TS-10 does not mount the React build and does not add a SPA/`index.html` fallback. It only prepares the single-origin shape: CORS stays configured for local development (TS-04/D-33), and the CSP allows `'self'` assets so TS-11 can add the bundle without loosening it much.

**Rationale**: the spec lists static serving as out of scope and `docs/BACKLOG.md` assigns it to TS-11 ("CI builds the React app … FastAPI serves the static files and falls back to `index.html`"). Pulling it forward would break Principle XII (nothing added "for later") and enlarge this story. Keeping the CSP same-origin-friendly is the only forward accommodation, and it costs nothing now.

**Alternatives considered**:
- Mount `StaticFiles` now with an empty/placeholder build — adds dead code and a fallback route this story doesn't need; rejected.
- A stricter API-only CSP (`default-src 'none'`) — would force a CSP rewrite in TS-11; the `'self'` policy avoids that churn while still being safe for a JSON API.

## R9 — Cost and the Free F1 tier

**Decision**: no Always On (F1 does not offer it), no auto-heal or uptime ping aimed at `/health`, and no scheduled warm-up. The deployed app may be slow on the first request after idle; the `/health` verification tolerates this with one retry.

**Rationale**: `/health` checks the database on every call (D-30), so a frequent probe would keep Neon awake and burn free compute hours (FR-007, AC6, constitution cost control). F1's daily CPU quota and single instance are enough for grading and the demo. The simulator (TS-08) already runs only during tests/demos, so nothing else keeps the database awake.

**Alternatives considered**:
- Turning on an uptime monitor against `/health` — directly violates D-30; rejected.
- Pointing a monitor at a new static, DB-free endpoint — unnecessary for an academic deliverable and still spends F1 minutes; left out (D-23). If warm-up is ever wanted, the note says to add a trivial DB-free path, not probe `/health`.

## R10 — Action versions

**Decision**: `actions/checkout@v4`, `actions/setup-python@v5`, `azure/login@v2`, `azure/webapps-deploy@v3`, each pinned to a major version (as TS-09 pins its actions, D-38).

**Rationale**: official actions, major-version pins keep the workflow current with security fixes while avoiding SHA-pin maintenance (same trade-off accepted in D-38). The Azure actions at `v2`/`v3` are the current major lines that support OIDC login and App Service deploy. `ci.yml` uses `@v7` for checkout/setup — a different major line is fine in a separate workflow; the versions here are the current majors for these specific actions and are confirmed when the workflow is written.

**Alternatives considered**:
- SHA pinning — rejected for the same reason as D-38 (maintenance cost for an academic project).
- Matching `ci.yml`'s `@v7` for every action — `azure/*` actions are versioned independently; their current majors are `v2`/`v3`.
