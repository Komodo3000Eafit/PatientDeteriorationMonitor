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
| TS-09 | **CI pipeline**: GitHub Actions runs backend and frontend tests and a dependency check on every pull request | TS-01, TS-04 | | ⬜ |
| TS-10 | **Backend deployment**: Azure App Service settings (environment variables, Neon connection) and automatic deploy from GitHub Actions using OIDC | TS-03, TS-09 | | ⬜ |
| TS-11 | **Frontend deployment**: Azure Static Web Apps settings (production API URL) and automatic deploy; end-to-end check that the deployed frontend reaches the deployed backend | TS-05, TS-10 | | ⬜ |

## Functional stories (US): baseline, implemented first (5)

| ID | Story | Depends on | Spec | Status |
|---|---|---|---|---|
| US-01 | As a nurse, I want to register a triaged patient with their initial triage level, so that the system starts monitoring them | TS-03, TS-06 | | ⬜ |
| US-02 | As a nurse, I want a patient list showing each patient's current triage level and latest score, so that I see who needs attention first | TS-03, TS-06 | | ⬜ |
| US-03 | As a nurse, I want each vital-signs reading to be saved and scored with the reason for each point, so that I understand the patient's risk | TS-07, TS-08 | | ⬜ |
| US-04 | As a doctor, I want a patient to be escalated automatically to a more urgent triage level when the score crosses the threshold, with an alert explaining why, so that they are attended sooner | TS-07 | | ⬜ |
| US-05 | As a doctor, I want a patient detail page with current vitals, score and triage history, so that I can review one patient at a glance | TS-03, TS-06 | | ⬜ |

## Functional stories (US): built with the team in the final session (5)

These must be **independent of each other**: each one adds its own files (endpoint, component) and touches shared files only to register a route or mount a component. They may use the technical stories and the baseline functional stories (US-01 to US-05) already merged into `main`.

| ID | Story | Depends on | Spec | Status |
|---|---|---|---|---|
| US-06 | As a doctor, I want a chart of a patient's vital signs history, so that I can see how they evolve | US-03, US-05 | | ⬜ |
| US-07 | As a nurse, I want to mark an alert as attended, so that the team knows it has been handled | US-04 | | ⬜ |
| US-08 | As a doctor, I want a "worsening trend" warning when the score rises across the last 3 readings, so that I can act before escalation | US-03 | | ⬜ |
| US-09 | As a nurse, I want to filter and sort the patient list by triage level, so that I find the most urgent patients faster | US-02 | | ⬜ |
| US-10 | As a doctor, I want to export a patient's vital signs to CSV, so that I can share or analyze them | US-03 | | ⬜ |
