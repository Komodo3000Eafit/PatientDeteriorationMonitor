---

description: "Task list for TS-10 backend deployment"
---

# Tasks: Backend Deployment

**Input**: Design documents from `specs/010-backend-deployment/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/deploy-workflow.md](contracts/deploy-workflow.md), [contracts/security-controls.md](contracts/security-controls.md), [quickstart.md](quickstart.md)

**Tests**: MANDATORY for the three security controls (login rate limiting, CORS parsing, security headers) — they are security critical paths (constitution Principle VII, FR-014), with at least one test per acceptance criterion. The deployed `/health` check is a manual quickstart step (AC1), not an automated test.

**Organization**: This feature has one story (TS-10), so all story tasks carry the `[TS-10]` label.

## Format: `[ID] [P?] [Story] Description (owner)`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks).
- **(owner)**: at the end of the line. **Agent** owners: backend-dev, devops, qa-tester, security-reviewer, orchestrator. **(human)** = a manual step for the person running the story (it pushes to GitHub, opens/merges PRs, or changes Azure/GitHub settings, so agents don't do it).
- All paths are relative to the repository root.
- Edit files with Edit/Write, not PowerShell (CLAUDE.md, Windows 5.1 corrupts non-ASCII). Keep files UTF-8.
- **Files that change**: `backend/requirements.txt`, `backend/app/main.py`, `backend/app/auth.py`, `backend/app/security_headers.py` (new), `backend/tests/` (new tests), `.github/workflows/deploy.yml` (new), `DEVELOPMENT.md`, `docs/DECISIONS.md`, `docs/PROJECT_STATUS.md`, `docs/BACKLOG.md`, and this story's `specs/010-backend-deployment/agent-log.csv`. Do **not** touch `.github/workflows/ci.yml` (D-38, FR-002), the `frontend/`, or `.specify/`. Do **not** add static-file serving (TS-11, research R8).
- Agents log each step: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/log-agent.ps1 -Agent <agent> -Task <Txxx> -Action <action> -Details "<text>"`.

---

## Phase 1: Setup

- [X] T001 [TS-10] Baseline: from `backend/` with the venv active, run `python -m pytest` and note the count passes (289 at TS-08/TS-09) before any change, for the PR description. Confirm the current `AUTH_SECRET`/`ACCESS_TOKEN_MINUTES` startup checks (TS-06) and the current `parse_cors_origins` (`*` rejected) and `/health` behaviour are the starting point. Do not change anything in this task (qa-tester, agent)

---

## Phase 2: Foundational

- [X] T002 [TS-10] Add `gunicorn` (pinned to its latest stable version, same pinning style as the other lines) to `backend/requirements.txt`, as the production process manager for the App Service startup command (plan "Design notes"; research R5). Do not remove or re-pin existing lines. After editing, run `pip install -r backend/requirements.txt` and `python -m pytest` from `backend/` to confirm nothing breaks (this also keeps CI's dependency audit able to resolve it) (devops, agent)

**Checkpoint**: `gunicorn` available; the three security-control tasks (T003–T005) can start in parallel.

---

## Phase 3: TS-10 Backend deployment 🎯 MVP

**Goal**: the FastAPI backend deploys automatically to the existing Azure App Service after CI passes on `main`, via OIDC (no stored credential), applying forward-only migrations; `GET /health` on the Azure URL returns 200 with `database: "ok"`; and the three carry-over security controls (login rate limiting, CORS null/malformed rejection, security headers) are in place and tested.

**Independent Test**: the new pytest tests pass in CI (rate limiting → 429 after the threshold, CORS rejects null/malformed, every response carries the security headers), and after a merge to `main` the `Deploy backend` workflow publishes the app so `GET https://<app>.azurewebsites.net/health` returns 200 with `database: "ok"` (quickstart §4).

### Security controls — application code (backend-dev)

- [X] T003 [P] [TS-10] Add login rate limiting to `POST /auth/login` in `backend/app/auth.py`, per [contracts/security-controls.md](contracts/security-controls.md) §1 and research R6:
  - A small in-memory fixed-window limiter keyed by client identity (source address; read it from the request, honouring the platform forwarded-for header as noted in the contract). Store the counter/window in module-level memory (per worker); no database, no new dependency.
  - New settings in `load_auth_settings` (or alongside it): `LOGIN_RATE_LIMIT` (default 10) and `LOGIN_RATE_WINDOW_SECONDS` (default 60), each a whole number ≥ 1, invalid values raise `RuntimeError` with fixed text (same style as `AUTH_SECRET`), never echoing the value.
  - When a client exceeds the limit within the window, return HTTP **429** with a fixed body (e.g. `{"detail": "Too many login attempts"}`); do not reveal whether the username exists; the counter resets when the window elapses.
  - Within the limit, keep the existing behaviour unchanged (200 + token on success, generic 401 on wrong credentials). The `login` handler needs the `Request` to read the client address (FR-008, AC7) (backend-dev, agent)
- [X] T004 [P] [TS-10] Harden `parse_cors_origins` in `backend/app/main.py`, per [contracts/security-controls.md](contracts/security-controls.md) §2 and data-model.md:
  - Keep: unset/blank → default `["http://localhost:5173"]`; blanks between commas dropped; `*` → `ValueError`.
  - Add: after dropping blanks, each remaining entry MUST be a valid origin `scheme://host[:port]` with scheme `http` or `https` (the shape a browser sends in `Origin`); a trailing `/` is still stripped first. Reject `null` and any non-matching entry (`http://`, `example.com`, …) with the existing `ValueError`; if every entry is invalid, startup fails (no silent fallback to default).
  - The `ValueError` message stays fixed text and MUST NOT include the configured value (FR-009, AC8) (backend-dev, agent)
- [X] T005 [P] [TS-10] Create `backend/app/security_headers.py` with a small HTTP middleware and mount it in `backend/app/main.py` (add `app.add_middleware(...)`), per [contracts/security-controls.md](contracts/security-controls.md) §3 and research R7. Set on **every** response, including errors (422/401/429/503):
  - `Content-Security-Policy: default-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  Add a `# TS-11: revisit the CSP when the React build is served from this origin` comment. Do **not** add `StaticFiles` or a SPA fallback (research R8) (FR-010, AC9) (backend-dev, agent)

### Deploy workflow and Azure configuration (devops)

- [X] T006 [TS-10] Create `.github/workflows/deploy.yml` per [contracts/deploy-workflow.md](contracts/deploy-workflow.md) and plan "Design notes". Top comment: "Deploy backend for PatientDeteriorationMonitor (TS-10). Runs only after the CI workflow succeeds on main, via OIDC. Never runs alembic downgrade. See specs/010-backend-deployment/contracts/deploy-workflow.md."
  - `name: Deploy backend`.
  - Trigger: `on.workflow_run.workflows: ["CI"]`, `types: [completed]` (R1). **No** `push`, `pull_request` or `pull_request_target`.
  - `permissions: { id-token: write, contents: read }` and nothing else (OIDC; R2).
  - One job `deploy` (`name: Deploy backend`, `runs-on: ubuntu-latest`, `timeout-minutes: 15`) guarded by `if: ${{ github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == 'main' }}` (FR-002, AC2).
  - Steps in order: `actions/checkout@v4` (`persist-credentials: false`); `actions/setup-python@v5` (`python-version: "3.13"`); `pip install -r backend/requirements.txt`; **"Apply database migrations"** with `working-directory: backend`, `env: DATABASE_URL: ${{ secrets.DATABASE_URL }}`, `run: python -m alembic upgrade head` — forward-only, a comment "NEVER alembic downgrade (FR-006, AC5, D-30)"; `azure/login@v2` with `client-id`/`tenant-id`/`subscription-id` from `secrets.AZURE_CLIENT_ID`/`AZURE_TENANT_ID`/`AZURE_SUBSCRIPTION_ID` (no password); `azure/webapps-deploy@v3` with `app-name: <app-service-name>` and `package: backend`.
  - No step echoes `DATABASE_URL`, `AUTH_SECRET` or any secret. Confirm the exact current major versions of the `azure/*` actions when writing the file (R10) (FR-001, FR-003, FR-006, FR-012) (devops, agent)

### Docs (agents)

- [X] T007 [P] [TS-10] Add a deployment section to `DEVELOPMENT.md` (a new subsection after the CI section 7.1, e.g. "7.2 Deployment (TS-10)"), per [quickstart.md](quickstart.md). Content:
  - The trigger chain: push/merge to `main` → CI green → `Deploy backend` runs (`workflow_run`), with the `main`-only / success-only guard.
  - One-time setup (repo owner): the OIDC identity and federated credential scoped to this repo and `main`, the role on the App Service, and the GitHub secrets `AZURE_CLIENT_ID`/`AZURE_TENANT_ID`/`AZURE_SUBSCRIPTION_ID`, `DATABASE_URL`, `AUTH_SECRET` (no publish profile, no client secret).
  - App Service settings and the gunicorn **startup command** (from contract `deploy-workflow.md`), `SCM_DO_BUILD_DURING_DEPLOYMENT=true`, `WEBSITES_PORT=8000`, Always On off, and the rule that **nothing probes `/health`** (D-30).
  - How migrations run (forward-only in the workflow; never downgrade).
  - How to find the Azure URL and check `/health` (quickstart §4) and the header spot-check (§5) (FR-013, AC10) (devops, agent)
- [X] T008 [P] [TS-10] In `docs/DECISIONS.md` add **D-42** (date 2026-11-19) after D-41, in the table format. Decision: deploy the backend to the existing App Service via a separate `.github/workflows/deploy.yml` triggered by `workflow_run` on CI success on `main`; authenticate with OIDC (federated credential, no publish profile or client secret); a gated **forward-only** `alembic upgrade head` step before deploy (never `downgrade`); startup `gunicorn app.main:app -k uvicorn.workers.UvicornWorker --workers 2 --bind=0.0.0.0:8000 --timeout 120` with `WEBSITES_PORT=8000` and `SCM_DO_BUILD_DURING_DEPLOYMENT=true`; App settings `DATABASE_URL`/`AUTH_SECRET`/`ACCESS_TOKEN_MINUTES` from GitHub secrets; in-memory per-worker login rate limiting; `CORS_ORIGINS` rejects null/malformed entries; response security headers (CSP incl. `frame-ancestors 'none'`, `X-Content-Type-Options`, `X-Frame-Options`); no probe on `/health` (D-30); static serving deferred to TS-11. Reason: constitution VIII/IX, D-18, D-30, D-39, and the carry-over review items (TS-04, TS-06); simplest option (D-23); no compiled dependency (D-31). Rejected: a deploy job inside `ci.yml`, a publish-profile/client-secret credential, `alembic downgrade` in CI/CD, a rate-limit store/library, an Always-On ping on `/health`, mounting the React build now. Status: Active (orchestrator, agent)
- [X] T009 [P] [TS-10] Update `docs/PROJECT_STATUS.md` and `docs/BACKLOG.md` (do **not** mark TS-10 ✅ here — that happens in T015 after the live deploy verifies):
  - `PROJECT_STATUS.md`: "Last updated" 2026-11-19; current step lists TS-10 🔄; next step TS-11; add a short TS-10 summary (separate `deploy.yml` via `workflow_run`, OIDC, forward-only migration, gunicorn startup, the three security controls). In "Notes for later stories", mark the carry-over items addressed by this story: no `alembic downgrade` in CI/CD (done), no `/health` probe (done, D-30), `AUTH_SECRET` as a secret (done), login rate limiting (done), `CORS_ORIGINS` null/malformed rejection (done), security headers (done); leave TS-11's static-serving note open.
  - `BACKLOG.md`: TS-10 row Spec = link to `../specs/010-backend-deployment/spec.md`, Status 🔄 (orchestrator, agent)

### Verification and review (agents)

- [X] T010 [TS-10] Write the automated tests for the three security controls in `backend/tests/` (e.g. `test_login_rate_limit.py`, `test_cors_origins.py`, `test_security_headers.py`), one test per acceptance criterion, per [contracts/security-controls.md](contracts/security-controls.md) and [quickstart.md](quickstart.md) §2. Use a small window/limit (e.g. via env/monkeypatch) so the rate-limit test is fast; reset module state between tests so per-worker counters don't leak. Cover: within-limit success + wrong-credential 401; (limit+1) → 429; window reset → success; two client identities independent (AC7); each invalid `CORS_ORIGINS` case raises `ValueError` and valid lists parse (AC8); `/health` and a 401 response both carry the three headers with exact values (AC9). Run `python -m pytest` from `backend/`; all pass (FR-014) (qa-tester, agent)
- [X] T011 [TS-10] Security review (read-only) of the deploy workflow and the new backend code, per spec AC3/AC5/AC6 and the contracts. Confirm: `deploy.yml` uses OIDC only (`id-token: write`, no publish profile/client secret), the `if` guard limits it to CI success on `main` (no fork-PR path), the migrate step runs only `alembic upgrade head` (grep the repo for `downgrade` in CI/CD → none), no step echoes a secret, and `ci.yml` is unchanged; the headers middleware sets all three on every response including errors; the CORS and rate-limit error messages never echo input; nothing probes `/health`. Report findings; the orchestrator assigns any fix to backend-dev/devops and re-runs T010 (security-reviewer, agent)
- [X] T012 [TS-10] Fill this story's `specs/010-backend-deployment/agent-log.csv` (every agent task assigned/done) and draft the PR description: link to `specs/010-backend-deployment/`, the agent activity summary (which agent did what), the local `pytest` result from T010, the security findings and how they were resolved, and an empty placeholder "Deployed /health: <url + result>" for T014 (orchestrator, agent)

### Manual deploy and verification (human)

- [ ] T013 [TS-10] **One-time Azure/GitHub setup** (repo owner), per [quickstart.md](quickstart.md) §1: create the OIDC app registration / federated credential scoped to this repo and `main`, assign the role on the App Service; add the GitHub secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `DATABASE_URL`, `AUTH_SECRET`; set the App Service settings (`DATABASE_URL`, `AUTH_SECRET`, `ACCESS_TOKEN_MINUTES`, `SCM_DO_BUILD_DURING_DEPLOYMENT=true`, `WEBSITES_PORT=8000`) and the gunicorn startup command; confirm Always On is off and no probe targets `/health`. Replace `<app-service-name>` in `deploy.yml` with the real app name (AC3, AC4, FR-004, FR-005) (human)
- [ ] T014 [TS-10] **Deploy and verify.** Open the PR to `main` with the T012 description, get a teammate review, and merge only when the three CI checks of the latest commit are green (branch protection). After the merge, watch Actions → `Deploy backend`: it runs only because CI succeeded on `main`; the log shows the forward-only migration and **no** `alembic downgrade` and no secret values. Then run quickstart §4 against `https://<app>.azurewebsites.net/health` (one retry for a waking database) and confirm HTTP 200 with `status: "ok"`, a `version` and `database: "ok"`; run the §5 header spot-check. Paste the URL and the `/health` result into "Deployed /health: <url + result>" in the PR (AC1, AC2, AC5, AC6, FR-011, SC-001) (human)
- [ ] T015 [TS-10] **Mark TS-10 done** (only after T014's deploy verifies): in `docs/BACKLOG.md` set TS-10 🔄 → ✅; in `docs/PROJECT_STATUS.md` set TS-10 🔄 → ✅ in the current step and roadmap step 11, add the deployed URL, and record the carry-over items as resolved. Edit with Edit/Write, not PowerShell. Commit and push to `010-backend-deployment` (this re-runs CI on the PR, which then re-triggers a deploy on merge) (human)

---

## Phase 4: Polish

None beyond T007–T009; the docs are part of the story (FR-013).

---

## Dependencies & Execution Order

- **T001** first (baseline), then **T002** (adds `gunicorn`, foundational).
- **T003, T004, T005** in parallel after T002 (different files/concerns: `auth.py`, `parse_cors_origins` in `main.py`, new `security_headers.py` + its mount in `main.py`). T004 and T005 both edit `main.py`, so if done by different agents, serialize those two edits or have one agent apply both `main.py` changes.
- **T006** (workflow) independent of T003–T005; can run in parallel with them (devops).
- **T007, T008, T009** docs, in parallel after T006 (they quote the workflow/startup names) and after T003–T005 (they describe the controls) — different files.
- **T010** (tests) after T003–T005. **T011** (security review) after T006 and T010. **T012** after T011 (and any fixes).
- **T013** (human, one-time setup) can be prepared any time but must be done before T014; **T014** after T012 and T013 and after the PR's CI is green; **T015** after T014 verifies.

## Parallel Example: TS-10

```text
# After T002 is done:
Task: "T003 Login rate limiting in backend/app/auth.py" (backend-dev)
Task: "T005 Security-headers middleware in backend/app/security_headers.py" (backend-dev)
Task: "T006 Create .github/workflows/deploy.yml" (devops)
# T004 edits main.py too; serialize it with T005's main.py mount edit.
```

## Implementation Strategy

1. Agents: T001 → T002 → {T003, T004, T005, T006} → {T007, T008, T009} → T010 → T011 → T012 (run with `claude --agent orchestrator` / `/speckit-implement`).
2. Human: T013 (one-time Azure/GitHub setup) → T014 (merge, deploy, verify `/health`) → T015 (mark ✅).
3. The MVP is the whole story: the backend is only "deployed" once the live `/health` returns `database: "ok"` on the Azure URL (AC1) and the three security controls are tested green.

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks.
- Agents never push, open/merge PRs, change Azure or GitHub settings, or add repository secrets; those are the (human) tasks.
- Do not modify `.github/workflows/ci.yml` (D-38) and do not add static-file serving (TS-11, research R8).
- The deploy workflow must never contain `alembic downgrade` (FR-006, AC5); the security review greps for it.
- The rate-limit counter is per worker (in memory); with 2 gunicorn workers the effective limit is per worker, which is acceptable at F1 scale (research R6).
