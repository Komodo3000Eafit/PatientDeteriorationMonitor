# Implementation Plan: Deterioration Prediction

**Branch**: `024-deterioration-prediction` | **Date**: 2026-11-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/024-deterioration-prediction/spec.md`

## Summary

US-08 adds a **deterioration prediction**: a simple rule (D-25, no machine learning) that is true when the stored NEWS2 scores of a patient's 3 most recent readings are strictly increasing (t1 < t2 < t3, Clarifications 2026-11-23). It is **computed on read** by a new read-only endpoint `GET /api/patients/{identifier}/prediction` and **stores nothing** (no alert row, no triage event, no migration). The rule is a pure function in its own module, so it is unit-tested without a database. The frontend adds one self-contained `DeteriorationPrediction` component, mounted with one line on the patient detail page, that shows a warning card with the three scores and the newest risk band.

## Technical Context

**Language/Version**: Python 3.13 (backend), JavaScript / React 19 (frontend)

**Primary Dependencies**: FastAPI, SQLAlchemy, Pydantic (backend); React, react-router, lucide-react (frontend). **No new dependency.**

**Storage**: PostgreSQL (Neon). Read-only: `vital_signs` and `reading_scores`. No migration.

**Testing**: pytest (backend), Vitest + Testing Library (frontend)

**Target Platform**: one Azure App Service (FastAPI serves the React build)

**Project Type**: web application (`backend/` + `frontend/`)

**Performance Goals**: one indexed query of at most 3 rows per request; no specific target beyond the existing endpoints

**Constraints**: no write of any kind; no `news2` text in `backend/app/` outside `app/scoring/` (`test_news2_confined`); no change to US-03 or US-04 code; CSS Modules and tokens only

**Scale/Scope**: academic demo (a few patients, a reading every 5 minutes)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] I. Spec-driven and traceable: every task will trace to AC1–AC13 / FR-001–FR-015 of spec 024.
- [x] II. Small Scrum story: one read endpoint, one pure rule function, one component.
- [x] III. Independence: depends only on merged US-03 (stored scores), TS-06, TS-12, TS-13 and US-05; not on US-04 or US-07. Other stories' code is only touched to register a route (`main.py`, one `include_router` line) and to mount a component (`PatientDetailPage.jsx`, one line). `RiskBandBadge`, `Card`, `find_patient` and `apiGet` are imported without changes.
- [x] IV. Multi-agent: backend-dev (rule + endpoint), frontend-dev (component, translations), qa-tester (tests), security-reviewer (review); logged in `agent-log.csv`.
- [x] V. Clinical logic: only stored scores are read, NEWS2 is never recomputed and the prediction module never imports NEWS2 rules; the warning shows the three scores and the band that produced it (explainable); the triage level is never changed and nothing is stored (D-41).
- [x] VI. Data privacy: synthetic data only; the response carries no internal ids and no vital values.
- [x] VII. Tests: rule unit tests, endpoint tests and component tests (see quickstart).
- [x] VIII. Security baseline: signed-in clinician required (401); patient code validated by `find_patient` (404); safe fixed 503; no secrets.
- [x] IX. Deployable at low cost: no new service.
- [x] X. Stack: Python (FastAPI), React, PostgreSQL.
- [x] XI. Language: English code and docs; UI Spanish by default with English switch; glossary entry "deterioration prediction" updated in this PR.
- [x] XII. Simplicity: compute on read, no table, no cache, no live refresh, no new token or dependency.

**Post-design re-check (after Phase 1)**: all items still pass. No Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/024-deterioration-prediction/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── prediction-api.md   # GET /api/patients/{identifier}/prediction
│   └── ui.md               # DeteriorationPrediction component
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── prediction.py          # NEW: pure rule, no DB access (is_rising, predict)
│   ├── prediction_api.py      # NEW: GET /api/patients/{identifier}/prediction
│   └── main.py                # +1 line: app.include_router(prediction_api.router, prefix="/api")
└── tests/
    ├── test_prediction.py     # NEW: rule unit tests (no database)
    └── test_prediction_api.py # NEW: endpoint tests

frontend/src/
├── pages/patient-detail/
│   ├── DeteriorationPrediction.jsx         # NEW
│   ├── DeteriorationPrediction.module.css  # NEW
│   ├── DeteriorationPrediction.test.jsx    # NEW
│   └── PatientDetailPage.jsx               # +1 mount line (and its import)
└── i18n/translations.js                    # + prediction.* keys (es, en)

docs/
├── DECISIONS.md       # + D-55
├── GLOSSARY.md        # "deterioration prediction" row: rule + US-08 built; §8 resolved name row
├── BACKLOG.md         # US-08 spec link, ✅ when done
└── PROJECT_STATUS.md  # US-08 done
```

**Structure Decision**: existing web application layout (`backend/app/` flat modules, `frontend/src/pages/<page>/`). The rule and the endpoint are separate modules so the rule has no FastAPI or database import, like `retriage.py` / `retriage_api.py` in US-04.

**Untouched (Principle III)**: `readings.py`, `readings_api.py`, `retriage.py`, `retriage_api.py`, `RetriageSuggestion.jsx`, `RecordReadingButton.jsx`, `RiskBandBadge.jsx`, `models.py`, migrations.

## Complexity Tracking

No violations.
