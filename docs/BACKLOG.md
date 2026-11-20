# Product Backlog

> One row = one user story = one Spec Kit feature (`specs/<nnn-name>/`), one branch and one pull request.
> When you start a story, put its spec folder in the **Spec** column; when it is merged, set **Status** to ✅.
> Rules: see the constitution (Principles II and III) and `docs/DECISIONS.md` (D-11, D-25).

Legend: ⬜ pending · 🔄 in progress · ✅ merged

## Technical stories (TS): baseline foundation

Build these first, in order. Together they provide every resource the app needs.

| ID | Story | Depends on | Spec | Status |
|---|---|---|---|---|
| TS-01 | **FastAPI app skeleton**: project structure in `backend/`, `/health` endpoint, pytest set up, runs locally | — | [001-fastapi-app-skeleton](../specs/001-fastapi-app-skeleton/) | ✅ |
| TS-02 | **Neon database connection**: create the Neon project; FastAPI connects through the `DATABASE_URL` environment variable; `/health` reports database status | TS-01 | [002-neon-db-connection](../specs/002-neon-db-connection/) | ✅ |
| TS-03 | **Database tables and migrations**: `users`, `patients`, `vital_signs`, `triage_events`, `alerts` | TS-02 | [003-db-tables-migrations](../specs/003-db-tables-migrations/) | ✅ |
| TS-04 | **React app skeleton**: project structure in `frontend/`, API client, shows backend `/health` status (CORS configured) | TS-01 | [004-react-app-skeleton](../specs/004-react-app-skeleton/) | ✅ |
| TS-05 | **Language and disclaimer**: Spanish by default with English switch; banner "academic prototype, not a certified medical device" | TS-04 | [005-language-disclaimer](../specs/005-language-disclaimer/) | ✅ |
| TS-06 | **Authentication**: seeded demo users, login endpoint, protected API routes, login page | TS-03, TS-04 | [006-authentication](../specs/006-authentication/) | ✅ |
| TS-07 | **Clinical scoring module**: replaceable scoring interface with a NEWS2 implementation that returns the score and the reason for each point | TS-01 | [007-clinical-scoring-module](../specs/007-clinical-scoring-module/) | ✅ |
| TS-08 | **Vital signs simulator**: generates synthetic readings for each patient every 5 minutes (faster in demo mode). Runs only during tests and demos | TS-03 | [008-vital-signs-simulator](../specs/008-vital-signs-simulator/) | ✅ |
| TS-09 | **CI pipeline**: GitHub Actions runs backend and frontend tests and a dependency check on every pull request | TS-01, TS-04 | [009-ci-pipeline](../specs/009-ci-pipeline/spec.md) | ✅ |
| TS-10 | **Backend deployment**: deploy the FastAPI backend to the existing Azure App Service (Brazil South, `rg-patient-monitor`, Linux, Python 3.13, Free F1); App Service environment variables (Neon `DATABASE_URL`, `AUTH_SECRET`, token lifetime) and Neon connection; automatic deploy from GitHub Actions using OIDC after the CI checks pass (D-39) | TS-03, TS-06, TS-09 | [010-backend-deployment](../specs/010-backend-deployment/spec.md) | ✅ |
| TS-11 | **Frontend served by the backend**: CI builds the React app and deploys it with the backend to the same App Service; FastAPI serves the static files and falls back to `index.html` for client routes; the frontend calls the API with relative URLs (same origin, so CORS stays for local development only); end-to-end check on the deployed URL (D-39) | TS-05, TS-10 | [011-frontend-served-by-backend](../specs/011-frontend-served-by-backend/) | ✅ |
| TS-12 | **UI foundation**: design tokens in `frontend/src/styles/tokens.css` (colors, including the status colors `stable`, `warning`, `critical` and `no_data` with their soft variants, plus spacing, type scale, radius and focus) and base styles in `styles/global.css`; `App.css` migrated to tokens (no raw hex values); folder structure from the frontend-dev agent (`pages/`, `hooks/`, `utils/`, `styles/`), moving `StartPage` and `LoginPage` into `pages/`; shared components the baseline stories reuse (status badge with color, icon and label; triage level badge; card; button); status-to-token and status-to-label helpers in `utils/` with unit tests. WCAG AA contrast | TS-05, TS-06 | [012-ui-foundation](../specs/012-ui-foundation/spec.md) | ✅ |
| TS-13 | **Client routing**: add `react-router` (DECISIONS entry for the new dependency); routes `/login`, `/patients` and `/patients/:identifier` (the patient code is synthetic, e.g. `PAT-001`, so it may appear in the URL); a not-found page; `<RequireAuth>` protects each clinical route and sends signed-out users to `/login`; each functional story only registers its route in `App.jsx`. Works with the `index.html` fallback from TS-11 | TS-06, TS-12 | [013-client-routing](../specs/013-client-routing/spec.md) | ✅ |

## Functional stories (US): baseline, implemented first (5)

| ID | Story | Depends on | Spec | Status |
|---|---|---|---|---|
| US-01 | As a nurse, I want to register a triaged patient with their initial triage level, so that the system starts monitoring them | TS-03, TS-06 | | ⬜ |
| US-02 | As a nurse, I want a patient list showing each patient's current triage level and latest NEWS2 score, so that I see who needs attention first | TS-03, TS-06, TS-12, TS-13 | | ⬜ |
| US-03 | As a nurse, I want each vital-signs reading to be saved and scored with the reason for each point, so that I understand the patient's risk | TS-07, TS-08 | | ⬜ |
| US-04 | As a doctor, I want an alert suggesting re-triage to a more urgent level when a patient's NEWS2 risk band crosses the threshold, explaining why, so that I can decide sooner whether to change the triage level (the app never changes it on its own, D-41) | TS-07, TS-12 | | ⬜ |
| US-05 | As a doctor, I want a patient detail page with current vitals, NEWS2 score and triage history, so that I can review one patient at a glance | TS-03, TS-06, TS-12, TS-13 | | ⬜ |

## Functional stories (US): built with the team in the final session (5)

These must be **independent of each other**: each one adds its own files (endpoint, component) and touches shared files only to register a route or mount a component. They may use the technical stories and the baseline functional stories (US-01 to US-05) already merged into `main`.

| ID | Story | Depends on | Spec | Status |
|---|---|---|---|---|
| US-06 | As a doctor, I want a chart of a patient's vital signs history, so that I can see how they evolve | US-03, US-05 | | ⬜ |
| US-07 | As a nurse, I want to mark an alert as acknowledged, so that the team knows it has been handled | US-04 | | ⬜ |
| US-08 | As a doctor, I want a deterioration prediction warning when the NEWS2 score rises across the last 3 readings, so that I can act before the risk band crosses the re-triage threshold | US-03 | | ⬜ |
| US-09 | As a nurse, I want to filter and sort the patient list by triage level, so that I find the most urgent patients faster | US-02 | | ⬜ |
| US-10 | As a doctor, I want to export a patient's vital signs to CSV, so that I can share or analyze them | US-03 | | ⬜ |
