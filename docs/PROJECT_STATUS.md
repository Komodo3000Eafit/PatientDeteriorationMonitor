# Project Status

> **Read this first.** This file tells you where the project is right now and what comes next.
> Whoever completes a step updates this file **in the same pull request** as the work.

**Last updated:** 2026-11-21
**Current phase:** 2 â€” Baseline implementation
**Current step:** Step 12 â€” Functional baseline stories: US-01 âœ… (register patient: `POST /api/patients`, page `/patients/new`, system-generated patient codes from `PAT-007`, D-47). US-03 âœ… (save and score readings: table `reading_scores` with migration `0002_reading_scores` and backfill, `POST`/`GET /api/patients/{code}/readings`, nurse page `/patients/:identifier/readings/new`, D-50). US-04 âœ… (re-triage suggestion alerts: `evaluate_retriage` raises an open `alerts` suggestion on a `medium`/`high` band crossing, `GET`/`POST accept`/`POST dismiss` under `/api/patients/{code}/suggestions`, doctor-only accept/dismiss, mounted `RetriageSuggestion` component, no migration, D-51). Step 11 â€” Technical stories: TS-01 âœ…, TS-02 âœ…, TS-03 âœ…, TS-04 âœ…, TS-05 âœ…, TS-06 âœ…, TS-07 âœ…, TS-08 âœ…, TS-09 âœ…, TS-10 âœ… (backend deployed to Azure), TS-11 âœ… (frontend served by the backend; all API routes under /api except /health), TS-12 âœ… (UI foundation), TS-13 âœ… (client routing), TS-14 âœ… (icon library: lucide-react is the single icon source, D-46)
**Next step:** US-02 and US-05 â€” functional baseline stories (see [BACKLOG.md](BACKLOG.md)); every new API route goes under `/api`; every new icon comes from `lucide-react` (D-46), not a hand-drawn SVG

> **TS-10 (backend deployment) â€” done (2026-11-19, PR #19).** The backend deploys automatically to `https://pmd-backend-dndva3fceca5fvdy.brazilsouth-01.azurewebsites.net` after CI passes on `main`. Live check: `GET /health` â†’ `{"status":"ok","version":"0.1.0","database":"ok"}`. What was built:
> - A **separate `.github/workflows/deploy.yml`** (`name: Deploy backend`), triggered by **`workflow_run`** when the `CI` workflow succeeds **on `main`** (guarded so fork PRs and other branches never deploy); `ci.yml` is unchanged (D-38). It authenticates with **OIDC** (no stored credential), runs a **forward-only** `alembic upgrade head` (never `downgrade`, D-30) and deploys with `azure/webapps-deploy@v3`. The startup command is gunicorn with a uvicorn worker (`gunicorn app.main:app -k uvicorn.workers.UvicornWorker --workers 2 --bind=0.0.0.0:8000 --timeout 120`); `gunicorn==27.0.1` added to `backend/requirements.txt`.
> - The three carry-over **security controls**: in-memory per-worker **login rate limiting** (429 after a threshold per client), `CORS_ORIGINS` **rejects null/malformed entries**, and response **security headers** (CSP with `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`). 40 new tests; the full backend suite is **329 passing**.
> - Carry-over items now addressed: **no `alembic downgrade` in CI/CD** (done), **no `/health` probe** (done, D-30), **`AUTH_SECRET` as a secret** (done, set as a GitHub/Azure secret in the one-time setup), **login rate limiting** (done), **`CORS_ORIGINS` null/malformed rejection** (done), **security headers** (done). TS-11's static-serving note stays open.
> - **One-time setup done by the repo owner (T013â€“T015):** user-assigned managed identity `id-patient-monitor-deploy` with Website Contributor on `pmd-backend` only; federated credential for the GitHub environment `production` (immutable subject); environment `production` restricted to `main` with secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` and `DATABASE_URL` (direct Neon string, for migrations); App Service settings `DATABASE_URL` (pooled), `AUTH_SECRET`, `SCM_DO_BUILD_DURING_DEPLOYMENT=true`, `WEBSITES_PORT=8000` and the gunicorn startup command; no health probe. The first deploy needed `environment: production` in the job and the real app name. Decision recorded as **D-42**; deployment steps in [DEVELOPMENT.md Â§7.2](../DEVELOPMENT.md#72-deployment-ts-10).

> **TS-11 (frontend served by the backend) â€” done (2026-11-19).** One Azure App Service now serves both the API and the React build at the single public URL `https://pmd-backend-dndva3fceca5fvdy.brazilsouth-01.azurewebsites.net` (D-39); there is no separate frontend host. What was built:
> - **API moved under `/api`**: the auth router is mounted with `prefix="/api"` in `main.py` (decorators unchanged), so `/auth/login` â†’ `/api/auth/login` and `/me` â†’ `/api/me`; every future API route lives under `/api`. **`/health` stays at `/health`** (deploy docs and checks use it). The backend tests were updated to the `/api/...` paths.
> - **SPA fallback**: API routes keep priority (an unknown `/api/...` path returns the API JSON 404, never the shell); a real static file is served with its content type; any other safe GET returns `index.html` so client routes resolve on refresh; a non-GET to a non-API path is never served the shell; the backend starts fine with no build present (local dev uses the Vite dev server).
> - **Deploy builds and ships the frontend**: `deploy.yml` runs `npm ci` + `npm run build` (Node 26, `VITE_API_BASE_URL=""` for a same-origin relative base) and stages `frontend/dist` into `backend/app/static/` (git-ignored), so the single `azure/webapps-deploy@v3` step ships both; a post-deploy e2e check hits `/`, a deep client route and `/health`.
> - **341 backend tests pass**; the frontend client now calls `/api/...`. The routing model (the `/api` prefix) is recorded as **D-44**; serving steps in [DEVELOPMENT.md Â§7.3](../DEVELOPMENT.md#73-frontend-served-by-the-backend-ts-11).

> **Where we left off (2026-11-19):** TS-01 to TS-09 are merged to `main` (TS-09 as PR #11). TS-09 (CI pipeline, D-38) adds no application code:
> - One workflow, `.github/workflows/ci.yml`, with three independent checks on every PR to `main` and every push to `main`: **Backend tests** (pytest), **Frontend tests** (Vitest + build) and **Dependency check**. It uses `permissions: contents: read`, no secrets and official actions at `@v7`.
> - Audit rules: `pip-audit -r backend/requirements.txt` fails on any finding; `npm audit --audit-level=high` fails on high/critical. Exceptions need `--ignore-vuln` or `overrides` plus a DECISIONS entry. How to read and reproduce the checks: [DEVELOPMENT.md Â§7.1](../DEVELOPMENT.md#71-continuous-integration-ci).
>
> The constitution's "tests and dependency checks in CI" gate is **met**: green run [CI #1](https://github.com/Komodo3000Eafit/PatientDeteriorationMonitor/actions/runs/44454387339) on the PR, red run [CI #3](https://github.com/Komodo3000Eafit/PatientDeteriorationMonitor/actions/runs/44454880682) on the throwaway branch `ci-red-check` (draft PR closed unmerged, branch deleted locally and on GitHub). PRs now rely on CI instead of pasted test output (D-27 superseded). **Branch protection is on for `main`** (ruleset, 2026-11-19): every change goes through a pull request, the three checks must pass, and force pushes are blocked. **Safe baseline:** tag [`v0.9.0`](https://github.com/Komodo3000Eafit/PatientDeteriorationMonitor/releases/tag/v0.9.0) marks this state of `main` (go back with `git switch -c recover-from-v0.9.0 v0.9.0`). To resume:
> 1. **Hosting changed (D-39):** the **frontend is served by FastAPI on the same Azure App Service**, because Azure Static Web Apps is blocked by the subscription's region policy. [BACKLOG.md](BACKLOG.md) TS-10/TS-11 are reworded; write the TS-10 and TS-11 specs on that basis. The constitution is amended to **v1.2.0** (D-41) to match: one App Service, the app **suggests re-triage and a clinician decides** (ResoluciÃ³n 5596 de 2015), and the glossary rule. Use the terms in [GLOSSARY.md](GLOSSARY.md) (D-40) in every new spec.
> 2. From an up-to-date `main`, run `/speckit-specify` for TS-10 (backend deployment), then continue as before: clarify â†’ plan â†’ tasks â†’ analyze â†’ `claude --agent orchestrator` â†’ review â†’ PR (CI green) â†’ merge.
> 3. ~~Deferred to TS-09 (from the TS-02 to TS-04 security reviews)~~: ~~lock the indirect Python dependencies (including Mako and MarkupSafe)~~ resolved: no lock file, CI audits everything `requirements.txt` installs (D-23, D-38); ~~run the vulnerability scan~~ done (Dependency check); ~~run `npm test` and `npm audit` in CI (use `npm ci`)~~ done. Still open, optional: move pytest/httpx to a dev requirements file.
> 4. Notes for later stories:
>    - **TS-08** and the API stories must keep patient and user text fields synthetic, e.g. by checking the `PAT-NNN` identifier pattern (TS-03 review).
>    - **TS-10** must never run `alembic downgrade` in CI/CD, and must not point frequent health probes at `/health` (D-30).
>    - **TS-10/TS-11** (from the TS-04 review): reject `null` and malformed entries in `CORS_ORIGINS`, and add HTTP security headers (CSP, `X-Content-Type-Options`, frame-ancestors).
>    - **Clinical stories** (from TS-06): every clinical endpoint uses `Depends(get_current_user)` and every clinical screen is rendered inside `<RequireAuth>`. **TS-10** sets `AUTH_SECRET` as a GitHub/Azure secret (TS-09 CI needs none: the tests use a fake value); **TS-10** adds login rate limiting.
>    - ~~**US-03** (from TS-07)~~ done in US-03: request bodies validated with `vital_signs_from_mapping`, 422 without echoed values; `system`, `total`, `band` and the entries stored (D-50).
>    - ~~**US-03** (from TS-08)~~ done in US-03: `record_reading` scores the reading and stores the result; `reading_scores` added to the delete list in `reset_demo_patients`.
>    - **US-02, US-04 and US-05** (from US-03, D-50): read the **stored score** (`reading_scores`, or `GET /api/patients/{code}/readings?limit=1`) with the field names in [contracts/readings-api.md](../specs/017-vital-signs-scoring/contracts/readings-api.md); never recompute NEWS2. Temperature arrives as a one-decimal string. **US-05** keeps the mounted `<RecordReadingButton identifier={identifier} />` line when it replaces the `PatientDetailPage` body (and may reuse `ReadingResult` / `formatReason`).
>    - **US-02** (from the US-03 change request, D-50): decides how risk bands map to `monitoring_status` (stable / warning / critical / no_data); it may reuse `RiskBandBadge` and `utils/bandStatus.js` to show a band, and `utils/formatNumber.js` for decimals by language.
>    - **Deploys that add a scoring migration** (from US-03, D-50): do not run the simulator while the deploy workflow is running; it migrates before the new code is live, so a reading saved by the old code would have no score.
>    - ~~**US-01** (from TS-08)~~ done in US-01 (D-47: codes are system-generated from `PAT-007`, only `PAT-<digits>`): reject the six demo identifiers PAT-001 to PAT-006 when registering a patient, because `--reset` treats any patient with those identifiers as demo data. Also limit identifiers to `[A-Z0-9-]`, because the simulator prints them raw (TS-08 review).
>    - **US-04** (from TS-07 and D-41): map the risk band to a **re-triage suggestion** alert (the triage level changes only through a manual triage event when a clinician accepts; don't let `source = 'automatic'` change it on its own); NEWS2 stays only in `app/scoring/news2.py`, and other code imports only from `app.scoring`.
>    - **TS-13 â†’ US-01, US-02, US-05 and TS-11** (routing, D-45): **US-01** (done: route added; its AC13 test replaced the TS-13 not-found edge-case test) adds `<Route path="/patients/new" â€¦>` inside the `<RequireAuth>` group in `App.jsx` and tests that it wins over `/patients/:identifier`; **US-02** replaces the body of `PatientListPage` (and decides whether to keep the `/health` block); **US-05** replaces the body of `PatientDetailPage` and reads the code with `useParams().identifier` (already checked by `isPatientCode`); **TS-11** must serve `index.html` for every non-API path and re-check deep-link refresh on Azure. No page path may start with `/api` or equal `/health`.
   - **US-02, US-04 and US-05** (from TS-12): reuse the shared components `StatusBadge`, `TriageLevelBadge`, `Card` and `Button`; pass `monitoring_status` and `triage_level` from the API through unchanged; and add the time of the last reading beside a `no_data` badge themselves.
   - **US-02, US-04 and US-05** (from TS-14, D-46): add any new icon by importing it from `lucide-react` (the single icon source), not by hand-drawing an SVG; keep icons decorative (`aria-hidden`, `focusable="false"`, em-sized, `currentColor`).
>    - **US-02** (from US-01): keep the mounted `<RegisterPatientButton />` (nurse-only) when replacing the `PatientListPage` body; it may reuse the `get_session` dependency from `backend/app/patients.py`.
>    - **Later**: NEWS2 SpO2 Scale 2 needs a per-patient hypercapnic flag.
**Delivery deadline:** 2026-11-24 18:00 (see [ASSIGNMENT.md](ASSIGNMENT.md))

> **Solo dry run:** one member built the foundation (TS-01 to TS-09) end to end first, to learn the process and prepare resources. From 2026-11-19 teammates can start on the next stories from tag `v0.9.0` / current `main`, using these docs.

---

## Roadmap

Legend: âœ… done Â· ðŸ”„ in progress Â· â­ next Â· â¬œ pending

### Phase 0 â€” Local environment (done once per computer; each teammate follows [DEVELOPMENT.md](../DEVELOPMENT.md))

| # | Step | Status | Notes |
|---|---|---|---|
| 1 | Install Python 3.13 and Git | âœ… | Python 3.15 breaks the Spec Kit install on Windows (see DECISIONS D-02) |
| 2 | Install uv and Specify CLI v1.3.3 | âœ… | `--python 3.13` flag if 3.15 is present |
| 3 | Run `specify check` | âœ… | |
| 4 | Install Claude Code and log in | âœ… | |

### Phase 1 â€” Spec Kit and team setup (done once for the repository)

| # | Step | Status | Notes |
|---|---|---|---|
| 5 | Initialize Spec Kit: `specify init --here --integration claude --script ps` | âœ… | Committed to `main` |
| 6 | Commit Spec Kit setup (`.specify/`, `.claude/skills/`) | âœ… | |
| 7 | Project context docs (this file, DECISIONS, ASSIGNMENT, agents, DEVELOPMENT, CLAUDE.md) | âœ… | Updated: Claude-only agents (D-15) |
| 8 | Project constitution (`/speckit-constitution`) | âœ… | v1.2.0 in `.specify/memory/constitution.md` (D-19, D-26, D-41). Draft by one member, pending team review (D-14) |
| 9 | Create the agent team files in `.claude/agents/` + agent activity log | âœ… | 6 agents (see [agents.md](agents.md)); CSV activity log per story via `scripts/log-agent.ps1` (D-22) |
| 10 | Align Spec Kit templates with the constitution, then write the backlog | âœ… | Templates: D-24. Backlog: [BACKLOG.md](BACKLOG.md) â€” 13 TS + 10 US (D-25) |

### Phase 2 â€” Baseline implementation (one Spec Kit feature per user story)

| # | Step | Status | Notes |
|---|---|---|---|
| 11 | Technical stories TS-01 to TS-14: backend, Neon, tables, frontend, i18n, auth, scoring module, simulator, CI, Azure deployments, UI foundation, client routing, icon library | âœ… | Foundation for every functional story. TS-01 âœ… (FastAPI skeleton). TS-02 âœ… (Neon database connection). TS-03 âœ… (tables + Alembic migrations, applied to Neon). TS-04 âœ… (React app skeleton + CORS). TS-05 âœ… (language switch ES/EN + disclaimer banner). TS-06 âœ… (authentication). TS-07 âœ… (clinical scoring module, NEWS2). TS-08 âœ… (vital signs simulator). TS-09 âœ… (CI pipeline). TS-10 âœ… (backend on Azure App Service, OIDC deploy). TS-11 âœ… (frontend served by backend, API under /api; one App Service and one public URL `https://pmd-backend-dndva3fceca5fvdy.brazilsouth-01.azurewebsites.net` serve both). TS-12 âœ… (UI foundation: design tokens, base styles, shared components StatusBadge/TriageLevelBadge/Card/Button). TS-13 âœ… (client routing, react-router, D-45). TS-14 âœ… (icon library: `lucide-react` 1.77.0 is the single icon source, `Icons.jsx` re-exports the four status icons under the same names, D-46). Next: US-01 to US-05 |
| 12 | Functional baseline stories US-01 to US-05 | ðŸŸ¡ | US-01 âœ… (register patient, [015-register-patient](../specs/015-register-patient/spec.md), D-47). US-03 âœ… (save and score readings, [017-vital-signs-scoring](../specs/017-vital-signs-scoring/spec.md), D-50). US-04 âœ… (re-triage suggestion alerts, [020-retriage-suggestion-alerts](../specs/020-retriage-suggestion-alerts/spec.md), D-51). Implemented by one member; US-06 to US-10 are built by the team in the final session |

### Phase 3 â€” Delivery and demo

| # | Step | Status | Notes |
|---|---|---|---|
| 13 | Evidence: tests, security controls, agent activity log, deployed URL | â¬œ | |
| 14 | Each member rehearses building a story live from their own computer | â¬œ | 5â€“10 min per story |
| 15 | Submit deliverables | â¬œ | Deadline 2026-11-24 18:00 |

---

## Team onboarding checklist (each member)

- [ ] Get a Claude plan that includes Claude Code (needed to run the agents)
- [ ] Complete Phase 0 following [DEVELOPMENT.md](../DEVELOPMENT.md)
- [ ] Ask the repo owner to add you as a collaborator
- [ ] Clone the repo and confirm `/speckit` commands appear in Claude Code
- [ ] Read [GLOSSARY.md](GLOSSARY.md) and the constitution (v1.2.0) before writing a spec
- [ ] Work on a branch per story; `main` is protected, so every change goes through a pull request with the three CI checks green

---

## Open questions / pending decisions

- ~~Final triage scheme~~ resolved (D-41): NEWS2 measures risk; the triage level (Triage Iâ€“V, ResoluciÃ³n 5596 de 2015) is a clinician's classification; the app only suggests re-triage. Open: the UI label for triage levels (decide in US-02, e.g. "Triage I").
- Public dataset to use for vital signs (or synthetic data).
- Teammate review before merge (constitution, workflow step 7): self-reviewed during the solo dry run; once teammates join, someone other than the author reviews each PR.
- Agent team composition may still change (see [agents.md](agents.md)).
- GitHub Copilot as a second AI tool: on hold (D-15); can be reconsidered if a license becomes available.
