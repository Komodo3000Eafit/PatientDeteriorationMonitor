# Feature Specification: Backend Deployment

**Feature Branch**: `010-backend-deployment`

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "From an up-to-date main, create the TS-10 feature. This creates the branch (010-backend-deployment). The spec captures: Deploy target: the existing App Service (Brazil South, rg-patient-monitor, Linux, Python 3.13, F1). Deploy trigger: GitHub Actions, after the three CI checks pass, via OIDC (no publish-profile secret). Env vars on App Service: DATABASE_URL, AUTH_SECRET, ACCESS_TOKEN_MINUTES. Carry-over requirements from earlier reviews (status notes): never run alembic downgrade in CI/CD; don't point frequent health probes at /health (D-30); set AUTH_SECRET as a secret; add login rate limiting; reject null/malformed CORS_ORIGINS entries; add HTTP security headers (CSP, X-Content-Type-Options, frame-ancestors). Acceptance criteria: a successful deploy produces a reachable /health returning 200 with database: ok on the Azure URL."

## Clarifications

### Session 2026-11-19

- Q: How should the forward database migration (`alembic upgrade head`) run against Neon as part of a deploy? → A: A gated step in the deploy workflow runs `alembic upgrade head` automatically after OIDC auth and before the app serves traffic, using the same pooled `DATABASE_URL`, forward-only (never downgrade).
- Q: Which branch/trigger starts the deploy? → A: `main` — the deploy runs for commits on `main`, only after the three CI checks have passed for that commit.
- Q: Should login rate limiting, CORS null/malformed rejection and HTTP security headers be built in TS-10 or split out? → A: All three stay in TS-10, as the carry-over notes in `docs/PROJECT_STATUS.md` assign (login rate limiting, CORS hardening, security headers).
- Q: What startup command should run the FastAPI app on the App Service? → A: Gunicorn with Uvicorn workers (`gunicorn app.main:app -k uvicorn.workers.UvicornWorker`), a small worker count suited to the Free F1 instance (default 1–2, exact count set in the plan), bound to the port Azure provides.
- Q: Separate deploy workflow after CI, or a deploy job inside the existing `ci.yml`? → A: A separate `deploy.yml` triggered by `workflow_run` when the CI workflow completes successfully on `main`; TS-09's `ci.yml` stays read-only and secret-free (D-38), and the OIDC/deploy permissions live only in the deploy workflow, which never runs for fork pull requests.

## User Story *(mandatory)*

**Story ID**: TS-10

**Type**: Technical

**Story**: As a team member, I want the FastAPI backend to deploy automatically to the existing Azure App Service after the CI checks pass, so that the graded product is reachable at a public URL and connected to the Neon database.

**Depends on**: TS-03 (database tables and migrations), TS-06 (authentication, `AUTH_SECRET` and `ACCESS_TOKEN_MINUTES`), TS-09 (CI pipeline with its three checks).

### Acceptance Criteria

<!-- Each criterion must be testable. qa-tester writes at least one test per criterion. -->

1. **AC1 — Reachable health on Azure**: **Given** a successful deploy to the App Service, **When** anyone requests `GET /health` on the Azure URL, **Then** the response is HTTP 200 with `status: "ok"`, a `version`, and `database: "ok"`, proving the deployed app reaches the Neon database.
2. **AC2 — Deploy only after CI passes**: **Given** a commit on `main`, **When** the backend-tests, frontend-tests and dependency checks have all passed for that commit, **Then** the deploy runs; **and** when any of the three checks fails, **Then** the deploy does not run.
3. **AC3 — OIDC authentication, no stored cloud credentials**: **Given** the deploy workflow, **When** it authenticates to Azure, **Then** it uses OIDC federation (a short-lived token requested at run time) and references no publish profile, client secret or other long-lived Azure credential stored in the repository or in GitHub secrets.
4. **AC4 — App Service settings**: **Given** the App Service, **When** its configuration is inspected, **Then** `DATABASE_URL`, `AUTH_SECRET` and `ACCESS_TOKEN_MINUTES` are present as application settings, with `DATABASE_URL` holding the Neon pooled connection string and `AUTH_SECRET` a value of at least 32 characters, and none of these values appears in the repository or in workflow logs.
5. **AC5 — No downgrade in CI/CD**: **Given** the deploy workflow and any migration step it runs, **When** it is reviewed, **Then** it never runs `alembic downgrade` (nor any other command that reverts a migration); schema changes only move forward with `alembic upgrade`.
6. **AC6 — No frequent probe on `/health`**: **Given** the App Service and any uptime or warm-up configuration, **When** they are reviewed, **Then** nothing sends automatic, frequent requests to `/health` (which checks the database on every call, D-30) that would keep the Neon database awake and burn free compute hours.
7. **AC7 — Login rate limiting**: **Given** the deployed app, **When** a client sends many failed `POST /auth/login` attempts in a short window, **Then** further attempts are rejected with HTTP 429 until the window passes, and a legitimate login within normal limits still succeeds.
8. **AC8 — CORS rejects null and malformed entries**: **Given** a `CORS_ORIGINS` value that contains a blank, `null`, or malformed entry (not a valid `scheme://host[:port]` origin), **When** the app starts, **Then** it refuses to start (or rejects that entry) with a fixed error message that never echoes the configured value, in addition to the existing rejection of a `*` entry.
9. **AC9 — HTTP security headers**: **Given** any HTTP response from the deployed app, **When** its headers are inspected, **Then** they include a Content-Security-Policy, `X-Content-Type-Options: nosniff`, and a directive that forbids the page from being framed (`frame-ancestors 'none'` in the CSP, equivalently `X-Frame-Options: DENY`).
10. **AC10 — Documentation and status**: **Given** a teammate, **When** they read the docs, **Then** `DEVELOPMENT.md` (or a deployment doc) explains how the deploy is triggered, how OIDC is set up, which App Service settings exist and how migrations are applied; `docs/DECISIONS.md` records the TS-10 decisions; `docs/PROJECT_STATUS.md` and `docs/BACKLOG.md` show TS-10 as done with the deployed URL.

### Out of Scope

- Deploying the React frontend and having FastAPI serve the static build (TS-11).
- Creating or resizing the App Service, the resource group or the Neon project; they already exist (Brazil South, `rg-patient-monitor`, Linux, Python 3.13, Free F1).
- Changing the CI checks themselves (TS-09); this story only adds a deploy that runs after them.
- A custom domain, HTTPS certificate management beyond the App Service default, a CDN or scaling beyond the Free F1 tier.
- Application features, new endpoints or UI, beyond the security controls listed here (login rate limiting, CORS hardening, security headers).
- Automatic rollback, blue/green or staging slots.

### Edge Cases

- **CI red, no deploy**: if any of the three checks fails for a commit on `main`, the deploy must not run, so a broken build never reaches the Azure URL.
- **Database asleep or unreachable at deploy time**: `/health` returns HTTP 200 with `database: "unavailable"`; the acceptance check for AC1 waits for the database to wake (one retry) before deciding, since the Free tier scales Neon to zero.
- **Malformed `CORS_ORIGINS`**: a value such as `,,` , `null`, `http://`, or `example.com` (no scheme) is rejected at startup with a fixed message; the app does not silently fall back to the default for a value that was set but invalid.
- **`AUTH_SECRET` missing or too short on the App Service**: the app refuses to start (existing TS-06 behaviour), so a misconfigured deploy fails fast instead of serving unsigned tokens.
- **Migration already applied**: `alembic upgrade head` is idempotent and a no-op when the schema is current; the deploy still succeeds.
- **New migration in the deployed commit**: the forward migration is applied as part of the deploy; a failure there fails the deploy before traffic is served, and no downgrade is attempted (AC5).
- **Many rapid login attempts from one client**: rate limiting returns HTTP 429 after the threshold; the limit is per client identity (e.g. source address) so one attacker does not lock out everyone.
- **Repeated failed logins across the limit window**: once the window passes, the counter resets and a valid login succeeds.
- **Fork or untrusted trigger**: the deploy only runs for the repository's own `main` after CI, never for fork pull requests, so OIDC and settings are never exposed to untrusted code.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A deploy workflow MUST publish the FastAPI backend to the existing Azure App Service (Brazil South, resource group `rg-patient-monitor`, Linux, Python 3.13, Free F1). The App Service MUST run the app with an explicit startup command using Gunicorn with Uvicorn workers (`gunicorn app.main:app -k uvicorn.workers.UvicornWorker`), a small worker count suited to the Free F1 instance (default 1–2, set in the plan), bound to the port the platform provides.
- **FR-002**: The deploy MUST live in a separate workflow (`deploy.yml`) triggered when the existing CI workflow completes successfully on `main` (a `workflow_run` trigger), so it runs only after the three CI checks (backend tests, frontend tests, dependency check) have passed for that commit; it MUST NOT run if any of them fails, MUST NOT run for any branch other than `main` or for fork pull requests, and MUST NOT change TS-09's `ci.yml`, which stays read-only and secret-free (D-38).
- **FR-003**: The deploy MUST authenticate to Azure with OIDC federation (a short-lived token requested at run time) and MUST NOT use or store a publish profile, client secret or any other long-lived Azure credential in the repository or in GitHub secrets.
- **FR-004**: The App Service MUST have the application settings `DATABASE_URL` (the Neon pooled connection string), `AUTH_SECRET` (at least 32 characters) and `ACCESS_TOKEN_MINUTES` (within the accepted 1–1440 range). These values MUST be provided only as App Service settings / GitHub secrets and MUST NOT appear in the repository or in workflow logs.
- **FR-005**: `AUTH_SECRET` MUST be stored as a secret (a GitHub secret used to set the App Service setting, or set directly on the App Service), never as plaintext in the repository, workflow file or logs.
- **FR-006**: Neither the deploy workflow nor any migration step it runs MAY execute `alembic downgrade` or otherwise revert a migration; forward migrations are applied with `alembic upgrade` only.
- **FR-007**: No automatic, frequent health probe MAY target `/health`, because `/health` checks the database on every call and would keep the Neon database awake (D-30). Any always-on or warm-up mechanism MUST be off or MUST point at a path that does not touch the database.
- **FR-008**: The login endpoint (`POST /auth/login`) MUST enforce rate limiting: after a configurable number of attempts from the same client within a window, further attempts MUST be rejected with HTTP 429, while logins within the limit MUST still be served. The limit MUST be keyed per client (e.g. source address) so one client cannot deny service to others.
- **FR-009**: `CORS_ORIGINS` parsing MUST reject null and malformed entries: a blank/`null` entry and any entry that is not a valid `scheme://host[:port]` origin MUST cause startup to fail (in addition to the existing rejection of `*`). Error messages MUST NOT echo the configured value.
- **FR-010**: Every HTTP response MUST carry security headers: a Content-Security-Policy, `X-Content-Type-Options: nosniff`, and a directive that prevents framing the page (`frame-ancestors 'none'` in the CSP, or equivalently `X-Frame-Options: DENY`).
- **FR-011**: On the Azure URL, `GET /health` MUST return HTTP 200 with `status: "ok"`, a `version` and `database: "ok"` after a successful deploy, demonstrating end-to-end reachability and a live database connection.
- **FR-012**: The deploy MUST apply any pending forward database migration with a gated workflow step that runs `alembic upgrade head` (against the same pooled Neon `DATABASE_URL`) after OIDC authentication and before the deployed app serves traffic, so the deployed schema matches the code; this step MUST never downgrade (FR-006), and if it fails the deploy MUST stop before serving traffic.
- **FR-013**: Documentation MUST explain the deploy trigger, the OIDC setup, the App Service settings and how migrations are applied; `docs/DECISIONS.md` MUST record the TS-10 decisions; `docs/PROJECT_STATUS.md` and `docs/BACKLOG.md` MUST mark TS-10 as done and record the deployed URL.
- **FR-014**: Automated tests MUST cover the new security controls as critical paths (Principle VII): login rate limiting (429 after the threshold, success within the limit), rejection of null/malformed `CORS_ORIGINS` entries, and the presence of the required security headers.

### Key Entities *(include if feature involves data)*

- **Deploy workflow**: a separate GitHub Actions definition (`deploy.yml`) that publishes the backend; it is triggered by the CI workflow completing successfully on `main`, and has an OIDC authentication step, a forward-only migration step and a deploy step. It is distinct from TS-09's `ci.yml`, which stays read-only and secret-free.
- **App Service**: the existing Azure Linux Python 3.13 Free F1 host in Brazil South, resource group `rg-patient-monitor`; holds the application settings `DATABASE_URL`, `AUTH_SECRET`, `ACCESS_TOKEN_MINUTES` and serves the public URL.
- **OIDC federated credential**: the trust between the GitHub repository and an Azure identity that lets the workflow obtain a short-lived token; no long-lived secret is stored.
- **Rate-limit record**: a per-client counter and window for `POST /auth/login` that triggers HTTP 429 once the threshold is exceeded.
- **Security headers**: the set of response headers (CSP including `frame-ancestors`, `X-Content-Type-Options`) applied to every response.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a successful deploy, `GET /health` on the Azure URL returns HTTP 200 with `database: "ok"` on at least one call (allowing one retry for a database waking from scale-to-zero).
- **SC-002**: 100% of deploys are preceded by all three CI checks passing on the same commit; 0 deploys run on a commit where a check failed.
- **SC-003**: The deploy workflow and repository contain 0 long-lived Azure credentials (no publish profile, no client secret); authentication is OIDC only.
- **SC-004**: The values of `DATABASE_URL` and `AUTH_SECRET` appear 0 times in the repository and 0 times in workflow logs.
- **SC-005**: After the login rate-limit threshold is reached, the next attempt receives HTTP 429; a valid login within the limit still succeeds, confirmed by an automated test.
- **SC-006**: Every response from the deployed app includes a Content-Security-Policy with `frame-ancestors 'none'` and `X-Content-Type-Options: nosniff`, confirmed by an automated test.
- **SC-007**: CI/CD runs 0 `alembic downgrade` commands, confirmed by inspecting the workflow.

## Assumptions

- The App Service already exists exactly as described (Brazil South, `rg-patient-monitor`, Linux, Python 3.13, Free F1); this story configures and deploys to it rather than creating it (D-39).
- The Neon project and the pooled `DATABASE_URL` already exist (D-29); the same pooled string used by CI/local is set as the App Service `DATABASE_URL`.
- Migrations are applied forward only (confirmed in Clarifications), as a gated deploy-workflow step running `alembic upgrade head` after OIDC auth and before the app serves traffic, using the existing hand-written Alembic revisions and the pooled Neon `DATABASE_URL` (D-32), with no downgrade ever (FR-006, D-30 note).
- OIDC federation is configured once on the Azure side (an app registration / managed identity with a federated credential scoped to this repository and `main`); the plan documents those one-time manual steps, since no automation changes Azure tenant settings.
- Login rate-limit thresholds (attempts and window) use reasonable defaults suited to the academic scope and demo (e.g. a small number of attempts per minute per client); exact values are set in the plan and may be overridable by an environment setting.
- The CSP is a conservative policy appropriate for an API that will later also serve the React build (TS-11); the exact directives are finalised in the plan so they do not break the frontend TS-11 will add.
- `ACCESS_TOKEN_MINUTES` on the App Service stays within the TS-06 accepted range (1–1440, default 480).
- The simplest approach that works is preferred (D-23): a small dedicated `deploy.yml` workflow (confirmed in Clarifications) that reacts to CI success on `main`, official Azure actions, no new infrastructure service; TS-09's `ci.yml` is left unchanged.
- The Free F1 tier's always-on is off; the first request after idle may be slow, which the AC1 check tolerates with a retry.
