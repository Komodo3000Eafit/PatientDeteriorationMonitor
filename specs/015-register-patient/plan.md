# Implementation Plan: Register Patient

**Branch**: `015-register-patient` | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/015-register-patient/spec.md`

## Summary

A nurse registers a triaged patient (fictitious name, age, sex, the triage level a clinician
already assigned) on a protected page `/patients/new`. The backend endpoint `POST /api/patients`
(nurse only) generates the next patient code `PAT-NNN` (highest + 1, never below `PAT-007`),
stores the patient and its `initial` triage event in one commit, retries once on a code conflict,
and answers 201 with the code; the page then goes to `/patients/<code>`. A nurse-only "Register
patient" button is mounted on the patient list. No migration, no new dependency.

## Technical Context

**Language/Version**: Python 3.13 (FastAPI 0.162.4, Pydantic v2, SQLAlchemy 2); JavaScript (ES modules), React 19.3, Vite 8

**Primary Dependencies**: existing only: FastAPI, SQLAlchemy, pg8000; React, `react-router` 8.5.2 (D-45), `lucide-react` 1.77.0 (D-46). **No new dependency**

**Storage**: PostgreSQL on Neon; existing `patients` and `triage_events` tables (TS-03), no migration

**Testing**: pytest + FastAPI `TestClient` with an in-memory SQLite session (`get_session` and `get_current_user` overridden), as in `test_readings.py`; Vitest + jsdom + React Testing Library with `renderApp` and `fakeBackend` (TS-13). Baseline counts recorded in the first task

**Target Platform**: one Azure App Service (FastAPI serves the React build, D-39); local Vite dev server

**Project Type**: web application (`backend/` + `frontend/`)

**Performance Goals**: registration answered within the existing 10 s client timeout; code generation reads only patient codes (tens of rows)

**Constraints**: route under `/api` (D-44); 422 never echoes values; tokens only, no raw colors (TS-12 guard); icons from `lucide-react` only (D-46); UI Spanish by default + English; synthetic data only

**Scale/Scope**: 1 endpoint, 1 page, 1 button component, ~19 translation keys per language, ~20 backend and ~20 frontend tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] I. Spec-driven and traceable: every file below maps to AC1–AC14; tests name the AC they verify
- [x] II. Small Scrum story: one story (US-01), one endpoint and one page
- [x] III. Independence: depends only on TS-03, TS-06, TS-12, TS-13 (merged); touches shared files only to register a route (`main.py`, `App.jsx`) or mount a component (`PatientListPage.jsx`); adds one optional handler to the test helper `fakeBackend.js`
- [x] IV. Multi-agent: backend-dev (endpoint), frontend-dev (page, button, texts), qa-tester (tests), security-reviewer (role check, validation, no echo), orchestrator logs `agent-log.csv`
- [x] V. Clinical logic: no scoring touched; the triage level is entered by the nurse from a clinician's triage, never computed or defaulted; the initial event records who set it
- [x] VI. Data privacy: name labeled fictitious with "do not use real data"; tests use synthetic names; no secrets
- [x] VII. Tests: API endpoint and security controls (401/403, validation, no echo, retry, atomicity) covered by automated tests
- [x] VIII. Security baseline: strict body validation with unknown fields rejected; auth + nurse role on the endpoint; page inside `<RequireAuth>`; fixed error messages; client cannot choose the patient code
- [x] IX. Deployable at low cost: no new service; same App Service and Neon database
- [x] X. Stack: FastAPI, React, PostgreSQL
- [x] XI. Language: English code/docs; Spanish default + English texts in `translations.js`; glossary gains the new UI texts in this PR
- [x] XII. Simplicity: one module with a plain function and one small session dependency; code generation in Python; no lock, sequence, service layer or new library

**Post-design re-check (after Phase 1)**: still all pass; no Complexity Tracking entry needed.

## Project Structure

### Documentation (this feature)

```text
specs/015-register-patient/
├── spec.md
├── plan.md              # This file
├── research.md          # R1–R9 decisions
├── data-model.md        # Fields written, registration flow
├── quickstart.md        # Automated, API and UI validation
├── contracts/
│   ├── patients-api.md  # POST /api/patients
│   └── ui.md            # Page, button, texts, error mapping
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── patients.py              # NEW: router, PatientCreate/PatientResponse, get_session,
│   │                            #      require_nurse, next_patient_code, register_patient (AC1–AC6)
│   └── main.py                  # EDIT: include patients.router with prefix "/api" (route registration)
└── tests/
    └── test_patients.py         # NEW: AC1–AC6, FR-001–FR-009

frontend/src/
├── App.jsx                      # EDIT: <Route path="/patients/new"> inside <RequireAuth> (AC12, AC13)
├── pages/
│   ├── register-patient/
│   │   ├── RegisterPatientPage.jsx        # NEW: form / nurses-only message (AC7–AC10, AC12, AC14)
│   │   ├── RegisterPatientPage.module.css # NEW: tokens only
│   │   ├── RegisterPatientPage.test.jsx   # NEW
│   │   ├── RegisterPatientButton.jsx      # NEW: nurse-only button, UserPlus icon (AC11)
│   │   └── RegisterPatientButton.test.jsx # NEW
│   └── patient-list/PatientListPage.jsx   # EDIT: mount <RegisterPatientButton /> (one import, one element)
├── i18n/translations.js         # EDIT: registerPatient.* and sex.* keys, es + en (AC14)
└── testing/fakeBackend.js       # EDIT: optional `patients` handler for /api/patients

docs/
├── GLOSSARY.md        # EDIT: UI texts for register, name/age/sex/triage level fields, nurses-only message
├── DECISIONS.md       # EDIT: D-47 patient code rule
├── BACKLOG.md         # EDIT: US-01 done, spec link
└── PROJECT_STATUS.md  # EDIT: US-01 done
```

**Structure Decision**: web application (`backend/` + `frontend/`). All new code lives in files
owned by US-01 (`app/patients.py`, `pages/register-patient/`); shared files change only to register
the route, mount the button, add texts and add one test-helper handler.

## Notes for later stories

- **US-02** replaces the body of `PatientListPage` and must keep `<RegisterPatientButton />`.
  It may reuse `get_session` from `app/patients.py` for its `GET /api/patients`.
- **US-05** reads the patient by `identifier`; patients registered here have exactly one `initial` triage event.

## Complexity Tracking

No violations; nothing to justify.
