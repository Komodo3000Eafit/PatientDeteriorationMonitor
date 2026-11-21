# Implementation Plan: Patient List

**Branch**: `016-patient-list` | **Date**: 2026-11-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/016-patient-list/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Any signed-in clinician sees, on `/patients`, a table of the active patients ordered by "who needs
attention first": highest latest NEWS2 score, then most urgent triage level, then patient code,
with patients without readings last. A new endpoint `GET /api/patients` builds the list in one
query, reading the stored score of each patient's latest reading (D-50, never recomputed). The page
keeps the nurse-only register button and the health section, refreshes every 15 seconds (paused in
a hidden tab), and keeps the last list when a refresh fails. No migration, no new dependency.

## Technical Context

**Language/Version**: Python 3.13 (FastAPI 0.162.4, Pydantic v2, SQLAlchemy 2); JavaScript (ES modules), React 19.3, Vite 8

**Primary Dependencies**: existing only: FastAPI, SQLAlchemy, pg8000; React, `react-router` 8.5.2 (D-45), `lucide-react` 1.77.0 (D-46). **No new dependency**; time text uses the built-in `Intl` APIs

**Storage**: PostgreSQL on Neon; read-only use of `patients`, `vital_signs`, `reading_scores` (TS-03, US-03); no migration

**Testing**: pytest + `TestClient` with an in-memory SQLite engine (`StaticPool`), `get_session` and `get_current_user` overridden (as in US-01/US-03); a statement counter (`before_cursor_execute`) proves one query. Vitest + jsdom + React Testing Library with `renderApp`, `fakeBackend` (`patients` handler branching on method) and `vi.useFakeTimers()` for the 15-second refresh. Baseline counts recorded in the first task

**Target Platform**: one Azure App Service (FastAPI serves the React build, D-39); local Vite dev server

**Project Type**: web application (`backend/` + `frontend/`)

**Performance Goals**: one database query per list request (SC-003); one request every 15 s per open, visible page

**Constraints**: route under `/api` (D-44); no NEWS2 rules outside `app.scoring` (Principle V); no change to code of US-01 or US-03 except the allowed placeholder test assertions (D-52); tokens only, no raw colors; icons only from `lucide-react`; Spanish default + English

**Scale/Scope**: 1 endpoint, 1 page body + 1 table component + 1 hook + 1 time helper, 11 translation keys per language, ~15 backend and ~25 frontend tests; tens of active patients, no pagination

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Check each principle of `.specify/memory/constitution.md` (v1.3.0). Any unchecked item must be justified in Complexity Tracking.

- [x] I. Spec-driven and traceable: every file below maps to AC1–AC15; tests name the AC they verify
- [x] II. Small Scrum story: one story (US-02): one read endpoint and one page body
- [x] III. Independence: dependencies TS-03, TS-06, TS-12, TS-13, US-01, US-03 match `docs/BACKLOG.md`; US-01 and US-03 are merged (v1.3.0, D-52). Their code is only imported (`get_session`, `RiskBandBadge`, `RegisterPatientButton`), never modified; the only edits to their files are the placeholder-constant lines in two tests (allowed by D-52); new backend code is in a new module, not in `patients.py`
- [x] IV. Multi-agent: backend-dev (endpoint), frontend-dev (page, table, hook, texts), qa-tester (tests), security-reviewer (auth, no ids, no echo), orchestrator (docs, D-49, log)
- [x] V. Clinical logic: scores are read as stored; ordering uses only the stored total and the clinician's triage level, no NEWS2 thresholds; no re-triage suggestion in this story; the app does not change any triage level
- [x] VI. Data privacy: synthetic patients only; no internal ids in the answer; no secrets
- [x] VII. Tests: endpoint (auth, fields, order, one query, 503) and page behavior covered by automated tests
- [x] VIII. Security baseline: `get_current_user` on the endpoint; page inside `<RequireAuth>`; no query parameters to validate; fixed error messages; the page never renders server text
- [x] IX. Deployable at low cost: no new service; one extra light query every 15 s per open page
- [x] X. Stack: FastAPI, React, PostgreSQL
- [x] XI. Language: English code/docs; Spanish default + English texts; glossary gains the new UI texts in this PR
- [x] XII. Simplicity: one SQL statement with a window function; chained `setTimeout` + Page Visibility API; `Intl` for time text; no polling or date library

**Post-design re-check (after Phase 1)**: still all pass; no Complexity Tracking entry needed.

## Project Structure

### Documentation (this feature)

```text
specs/016-patient-list/
├── spec.md
├── plan.md              # This file
├── research.md          # R1–R10 decisions
├── data-model.md        # Fields read, response item, order, page states
├── quickstart.md        # Automated, API and UI validation
├── contracts/
│   ├── patient-list-api.md  # GET /api/patients
│   └── ui.md                # Page, table, time text, refresh, texts
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── patient_list.py          # NEW: router GET /patients, PatientListResponse, one-query list (AC1–AC5)
│   └── main.py                  # EDIT: include patient_list.router with prefix "/api" (route registration)
└── tests/
    └── test_patient_list.py     # NEW: AC1–AC5, FR-001–FR-006

frontend/src/
├── pages/patient-list/
│   ├── PatientListPage.jsx          # EDIT (TS-13 placeholder body): placeholder <p> → <PatientTable />;
│   │                                #       h1, <RegisterPatientButton /> line and health section unchanged
│   ├── PatientTable.jsx             # NEW: loading / error / empty / table / last update / refresh error (AC6–AC13)
│   ├── PatientTable.module.css      # NEW: table, scroll wrapper, triage chips (D-48 tokens only)
│   ├── usePatientList.js            # NEW: fetch + 15 s chained refresh + visibility pause (AC11–AC13)
│   ├── formatTime.js                # NEW: "hace 3 min (14:32)" / "3 min ago (14:32)" (AC6, AC15)
│   ├── PatientTable.test.jsx        # NEW
│   ├── usePatientList.test.jsx      # NEW (or within PatientTable.test.jsx)
│   └── formatTime.test.js           # NEW
├── i18n/translations.js             # EDIT: patientList.* keys (es, en); remove patients.placeholder
├── App.routes.test.jsx              # EDIT: ES_LIST_PLACEHOLDER constant only → 'Pacientes' (D-52)
└── pages/register-patient/RegisterPatientButton.test.jsx  # EDIT: same constant only (D-52)

docs/
├── GLOSSARY.md        # EDIT: patient list row (now a table), latest score, last update, "Sin datos" text
├── DECISIONS.md       # EDIT: D-49
├── BACKLOG.md         # EDIT: US-02 done, spec link
└── PROJECT_STATUS.md  # EDIT: US-02 done; mark US-02 notes done; note D-49 supersedes the monitoring_status note
```

**Structure Decision**: web application (`backend/` + `frontend/`). All new code is in files US-02
owns (`app/patient_list.py`, new files in `pages/patient-list/`). Shared files change only to
register the router, replace the TS-13 placeholder body, add texts, and update two placeholder test
constants.

## D-49 (to record in `docs/DECISIONS.md`)

Patient list (US-02): `GET /api/patients` for any signed-in clinician, active patients only, each
with `latest_score` (`recorded_at`, `total`, `band`) read from `reading_scores` or `null`; one query
(window function over the latest reading per patient); server-side order: score present, `total`
desc, `triage_level` asc, `identifier` asc; the `/patients` page shows a table refreshed every 15 s
(chained, paused while the tab is hidden). **`monitoring_status` is not used in US-02**: the list
shows the stored risk band with `RiskBandBadge` and "Sin datos" for no readings; this supersedes the
PROJECT_STATUS note that US-02 maps risk bands to `monitoring_status`.

## Notes for later stories

- **US-09** (filter/sort) works on this list's response; the default order stays the server's.
- **US-04 / US-05** may reuse `formatTime.js` by import (D-52) for reading times.

## Complexity Tracking

No violations; nothing to justify.
