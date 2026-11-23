# Implementation Plan: Alert Acknowledgement

**Branch**: `023-alert-acknowledgement` | **Date**: 2026-11-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/023-alert-acknowledgement/spec.md`

## Summary

US-07 lets a **nurse mark a patient's open re-triage suggestion as seen** (option B). The marker is stored in the existing `alerts.acknowledged_by_id` and `alerts.acknowledged_at` columns while `alerts.status` stays `open`, so the doctor still accepts or dismisses the suggestion with US-04; the doctor's action then overwrites the marker (accepted, D-56). One new backend module, `app/alert_ack_api.py`, adds `POST /api/patients/{identifier}/alerts/{alert_id}/seen` (nurses only, local check, one conditional `UPDATE` so the first nurse wins) and `GET /api/patients/{identifier}/alerts/acknowledgement` (any clinician, one query joined to `users` for `full_name`). The **shown alert** is the newest open alert, or the newest alert when none is open. The frontend adds one `AlertAcknowledgement` component mounted with one line below the re-triage section. No migration, no new dependency.

## Technical Context

**Language/Version**: Python 3.13 (backend), JavaScript / React 19 (frontend)

**Primary Dependencies**: FastAPI, SQLAlchemy, Pydantic (backend); React, react-router, lucide-react (frontend). **No new dependency.**

**Storage**: PostgreSQL (Neon). Existing `alerts` (write: `acknowledged_by_id`, `acknowledged_at` only) and `users` (read: `full_name`). No migration.

**Testing**: pytest (backend), Vitest + Testing Library (frontend)

**Target Platform**: one Azure App Service (FastAPI serves the React build)

**Project Type**: web application (`backend/` + `frontend/`)

**Performance Goals**: one indexed query per read (LIMIT 1), one lookup plus one conditional `UPDATE` per mark; no target beyond the existing endpoints

**Constraints**: no change to US-03, US-04 or US-08 code, nor to `patients.py`; status stays `open` on mark; no internal user id, username or machine tag in any answer; CSS Modules and tokens only

**Scale/Scope**: academic demo (a few patients, a handful of alerts)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] I. Spec-driven and traceable: every task will trace to AC1–AC16 / FR-001–FR-017 of spec 023.
- [x] II. Small Scrum story: two small endpoints in one module, one component.
- [x] III. Independence: depends only on merged US-04 (alert rows), TS-03, TS-06, TS-12, TS-13 and US-05; not on US-06, US-08, US-09 or US-10. Other stories' code is only touched to register a route (`main.py`, one `include_router` line), mount a component (`PatientDetailPage.jsx`, one line plus its import) and add an optional test handler to `fakeBackend.js` (additive only, defaults to 404 so existing tests are unchanged, following the US-04 `suggestions` and US-08 `prediction` handler precedent). `find_patient`, `get_session`, `get_current_user`, `Card`, `Button`, `apiGet`, `apiPost` are imported unchanged.
- [x] IV. Multi-agent: backend-dev (module + route), frontend-dev (component, translations), qa-tester (tests), security-reviewer (review); logged in `agent-log.csv`.
- [x] V. Clinical logic: the marker never changes the triage level, never creates a triage event and never acknowledges the suggestion; the doctor still decides (D-41, D-51).
- [x] VI. Data privacy: synthetic data only; the answer carries the clinician's full name and time only (no user id, no username).
- [x] VII. Tests: endpoint tests (including the first-nurse-wins rule and the US-04 interaction) and component tests (see quickstart).
- [x] VIII. Security baseline: signed-in user required (401); nurses only for the write (403); patient code validated by `find_patient` and alert scoped to the patient (404); safe fixed 409/503; no secrets.
- [x] IX. Deployable at low cost: no new service.
- [x] X. Stack: Python (FastAPI), React, PostgreSQL.
- [x] XI. Language: English code and docs; UI Spanish by default with English switch; glossary gets "seen" and the updated "acknowledged" entry in this PR.
- [x] XII. Simplicity: reuse two existing columns, no table, no history, no live refresh, no new token or dependency.

**Post-design re-check (after Phase 1)**: all items still pass. No Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/023-alert-acknowledgement/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── alert-ack-api.md # POST …/alerts/{alert_id}/seen, GET …/alerts/acknowledgement
│   └── ui.md            # AlertAcknowledgement component
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── alert_ack_api.py         # NEW: local nurse check, GET acknowledgement, POST seen
│   └── main.py                  # +1 line: app.include_router(alert_ack_api.router, prefix="/api")
└── tests/
    └── test_alert_ack_api.py    # NEW: endpoint tests (+ US-04 interaction)

frontend/src/
├── pages/patient-detail/
│   ├── AlertAcknowledgement.jsx         # NEW
│   ├── AlertAcknowledgement.module.css  # NEW
│   ├── AlertAcknowledgement.test.jsx    # NEW
│   └── PatientDetailPage.jsx            # +1 mount line (and its import)
├── testing/fakeBackend.js               # + optional alertAck handler (404 by default)
└── i18n/translations.js                 # + alertAck.* keys (es, en)

docs/
├── DECISIONS.md       # + D-56
├── GLOSSARY.md        # + "seen" row; "acknowledged" row updated (US-04 doctor action, US-07 seen marker)
├── BACKLOG.md         # US-07 spec link, ✅ when done
└── PROJECT_STATUS.md  # US-07 done
```

**Structure Decision**: existing web application layout (`backend/app/` flat modules, `frontend/src/pages/<page>/`). There is no rule worth a separate pure module (the logic is one conditional update and one query), so the routes and their helpers live in `alert_ack_api.py` only.

**Untouched (Principle III)**: `patients.py`, `retriage.py`, `retriage_api.py`, `readings.py`, `readings_api.py`, `prediction.py`, `prediction_api.py`, `RetriageSuggestion.jsx`, `OpenSuggestionsBanner.jsx`, `DeteriorationPrediction.jsx`, `RecordReadingButton.jsx`, `models.py`, migrations.

## Complexity Tracking

No violations.
