# Implementation Plan: Re-triage Suggestion Alerts

**Branch**: `020-retriage-suggestion-alerts` | **Date**: 2026-11-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/020-retriage-suggestion-alerts/spec.md`

## Summary

When a reading is saved for an active patient and its **stored** risk band (from `reading_scores`,
US-03) becomes `medium` or `high` and is strictly more urgent than the patient's previous reading's
band, the system raises **one open re-triage suggestion alert** (`alerts` row): severity `medium`
or `high`, a message naming the raising band and the current and suggested triage level, and a
reason listing the vital signs and points. The app **never changes the triage level on its own**
(no `source = 'automatic'` event); the level changes only when a **doctor accepts**, which sets
`triage_level`, writes one `manual` `triage_event`, and acknowledges the alert, all in one
transaction. A **dismiss** acknowledges the alert and changes nothing else. The suggestion is
evaluated at reading-save time in a new helper that `record_reading` calls, so the simulator and
the nurse entry path both trigger it without changes to their own code. A new router
`app/retriage_api.py` adds `GET /api/patients/{code}/suggestions` (any clinician), and
`POST .../suggestions/{alert_id}/accept` and `.../dismiss` (doctors only). The frontend adds one
mounted component on the patient detail area showing the open suggestion (read-only for nurses,
with Accept/Dismiss for doctors). No new table, no migration, no new dependency. Decision D-51
records the band→severity and band→step mappings, the no-duplicate rule and the accept/dismiss
operations.

## Technical Context

**Language/Version**: Python 3.13 (FastAPI, Pydantic v2, SQLAlchemy 2, Alembic); JavaScript (ES modules), React 19.3, Vite 8

**Primary Dependencies**: existing only: FastAPI, SQLAlchemy, Alembic, pg8000; React, `react-router` 8.5.2 (D-45), `lucide-react` 1.77.0 (D-46). **No new dependency**

**Storage**: PostgreSQL on Neon; existing tables `alerts`, `triage_events`, `patients`, `vital_signs`, `reading_scores` used as they are. **No migration** (FR-017)

**Testing**: pytest with in-memory SQLite (`StaticPool`, `get_session`/`get_current_user` overrides as in `test_readings_api.py`); Vitest + jsdom + React Testing Library with `renderApp`/`stubBackend`. Baseline test counts recorded in the first task

**Target Platform**: one Azure App Service (FastAPI serves the React build, D-39); local Vite dev server

**Project Type**: web application (`backend/` + `frontend/`)

**Performance Goals**: an accept/dismiss answered within the existing 10 s client timeout; the suggestion evaluation reads one extra `reading_scores` row (the previous reading's band) per saved reading; the suggestion read returns a bounded list

**Constraints**: routes under `/api` (D-44); NEWS2 rules only in `app/scoring`, this story reads the stored band only; no `source = 'automatic'` event (D-41); error messages fixed and value-free; tokens only, icons from `lucide-react` only; UI Spanish by default + English; synthetic data only

**Scale/Scope**: 0 tables, 0 migrations; 1 new backend module (`retriage.py` logic) + 1 new router (`retriage_api.py`); 1 line added to `record_reading`; 3 endpoints; 1 mounted frontend component (+ small sub-parts); ~20 translation keys per language; ~30 backend and ~18 frontend tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] I. Spec-driven and traceable: every file below maps to AC1–AC20 / FR-001–FR-017; tests name the AC they verify
- [x] II. Small Scrum story: one story (US-04); no table, one logic module, one router, one mounted component
- [x] III. Independence: depends only on merged TS-03/06/07/12/13 and US-03 (the stored score). **Sanctioned shared-seam extension:** US-03's `app/readings.py` gains **one line** inside `record_reading` — its documented single reading-creation seam (US-03 plan, D-50) and the only path the simulator also uses — to call `evaluate_retriage`; `record_reading` keeps its signature, return value and "never commits" contract, so US-03's behavior is unchanged and its tests still pass. Evaluating only in the API endpoint was rejected because it would miss simulator readings (AC4). US-01's `app/patients.py` is **not modified** (`get_session` imported). Other shared files change only to register a route (`main.py`) or mount a component (`PatientDetailPage.jsx`, keeping the `<RecordReadingButton>` line)
- [x] IV. Multi-agent: backend-dev (retriage logic, alert creation in `record_reading`, API), frontend-dev (component, texts), qa-tester (tests), security-reviewer (auth/role on accept/dismiss, no echo, no automatic triage change), devops (confirm no migration needed), orchestrator logs `agent-log.csv`
- [x] V. Clinical logic: the band is read from the stored score (scoring stays only in `app/scoring`); every suggestion names the vitals and points that produced it (FR-004, AC19); the app only suggests — the level changes only on a doctor's `manual` accept, never `automatic` (D-41, FR-005)
- [x] VI. Data privacy: synthetic patients only; no secrets; messages and logs carry no submitted values or ids (FR-011)
- [x] VII. Tests: the crossing rule, the mappings, the no-duplicate rule, accept/dismiss, the role check and every API status have automated tests (FR-016)
- [x] VIII. Security baseline: both read and act require auth (401); accept/dismiss require role `doctor` (403); patient code and alert id validated before any query; fixed error messages; the component is inside `<RequireAuth>`
- [x] IX. Deployable at low cost: no new service, no migration; same App Service and Neon database
- [x] X. Stack: FastAPI, React, PostgreSQL
- [x] XI. Language: English code/docs; ES default + EN texts in `translations.js`; glossary gains the new terms in this PR (FR-014)
- [x] XII. Simplicity: reuse the existing `alerts`/`triage_events` tables (no migration); the raising band lives in the alert text, read back for the one comparison the no-duplicate rule needs; no new library; one JSON-free text message

**Post-design re-check (after Phase 1)**: still all pass; no Complexity Tracking entry needed.

## Project Structure

### Documentation (this feature)

```text
specs/020-retriage-suggestion-alerts/
├── spec.md
├── plan.md              # This file
├── research.md          # R1–R8 decisions
├── data-model.md        # alerts/triage_events usage, message/reason shape, band order, write/read flows
├── quickstart.md        # Automated, API and UI validation
├── contracts/
│   ├── retriage-api.md  # GET suggestions, POST accept, POST dismiss
│   └── ui.md            # Suggestion component, roles, states, errors, texts
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── retriage.py               # NEW: band order, BAND_SEVERITY, BAND_STEP, evaluate_retriage(session, patient, score), accept/dismiss helpers (AC1–AC6, FR-001–FR-006, FR-008/009)
│   ├── readings.py               # EDIT: record_reading calls evaluate_retriage after adding the score (one line + import) (AC1, FR-001)
│   ├── retriage_api.py           # NEW: router, response models, require_doctor, GET suggestions + POST accept/dismiss (AC8–AC13, FR-007–FR-011)
│   └── main.py                   # EDIT: include retriage_api.router with prefix "/api" (route registration)
└── tests/
    ├── test_retriage.py          # NEW: crossing rule, mappings, clamp, no-duplicate, evaluate_retriage all-or-nothing (AC1–AC6, AC12)
    ├── test_retriage_api.py      # NEW: GET/accept/dismiss statuses, role check, discharged, already-acknowledged (AC7–AC13, FR-007–FR-011)
    ├── test_readings.py          # EDIT: record_reading raises a suggestion on a crossing, none otherwise (AC1, AC3)
    └── test_simulator.py         # EDIT: a simulated crossing raises exactly one suggestion; no automatic triage event (AC2, AC4)

frontend/src/
├── App.jsx                       # (no new route; the component is mounted on the existing detail page)
├── api/client.js                 # (reused; no change expected — apiGet/apiPost already exist)
├── pages/
│   └── patient-detail/
│       ├── RetriageSuggestion.jsx          # NEW: fetch + show open suggestion; doctor-only Accept/Dismiss; no-suggestion message (AC14–AC18, FR-012/013)
│       ├── RetriageSuggestion.module.css   # NEW: tokens only
│       ├── RetriageSuggestion.test.jsx     # NEW: ES+EN, doctor vs nurse, accept/dismiss success, failed action, buttons disabled
│       └── PatientDetailPage.jsx           # EDIT: mount <RetriageSuggestion identifier={identifier} /> (one line + import; keep the RecordReadingButton line)
├── pages/record-reading/RiskBandBadge.jsx  # REUSE: show the stored band (US-03, no change)
├── components/TriageLevelBadge.jsx         # REUSE: current and suggested level (TS-12, no change)
├── i18n/translations.js          # EDIT: retriage.* (title, severity labels, suggestedLevel, accept, dismiss, accepted, dismissed, none, errors) (es + en)
└── testing/fakeBackend.js        # EDIT: optional `suggestions` handler for /api/patients/<code>/suggestions and accept/dismiss

docs/
├── GLOSSARY.md        # EDIT: re-triage suggestion alert, suggestion component, Accept/Dismiss, suggested triage level, band→severity/step mapping; update "escalation"/"automatic" notes to reflect D-51
├── DECISIONS.md       # EDIT: D-51 (band crossing → suggestion, mappings, no-duplicate, accept/dismiss, no migration)
├── BACKLOG.md         # EDIT: US-04 done, spec link
└── PROJECT_STATUS.md  # EDIT: US-04 done
```

**Structure Decision**: web application (`backend/` + `frontend/`). New code lives in files owned
by US-04 (`app/retriage.py`, `app/retriage_api.py`, `pages/patient-detail/RetriageSuggestion.jsx`).
US-03's `record_reading` is extended by one line at its documented single evaluation point;
US-05's future `PatientDetailPage` body change keeps the one-line mount (same pattern as the
`RecordReadingButton` line). Shared files change only to register a route, mount a component, add
texts, or add an optional test-helper handler.

## Planned decision D-51 (written to `docs/DECISIONS.md` during implementation)

| D-51 | 2026-11-21 | Re-triage suggestion alerts (US-04): when a reading is saved for an **active** patient and its **stored** risk band (`reading_scores.band`, US-03; never recomputed) is `medium` or `high` **and** strictly more urgent than the patient's previous reading's band (order `low` < `low-medium` < `medium` < `high`), the system creates **one open `alerts` row** suggesting a more urgent triage level. **Mappings in one place (`app/retriage.py`):** band → severity `medium`→`medium`, `high`→`high` (`low`/`low-medium` never suggest); band → step more urgent `medium`→1, `high`→2, the suggested level = current − step clamped at Triage I (level 1); a patient already at Triage I gets no suggestion. The alert's `message`/`reason` name the **raising band**, the current and suggested level and the vital signs and points (Principle V); the raising band is read back from that text for the **no-duplicate rule**: no second open suggestion unless a later reading's band is strictly more urgent than the open alert's recorded band (`medium`→`high`). **The app never changes the triage level on its own:** creating a suggestion changes no `triage_level` and writes **no `source = 'automatic'` event**; the `automatic` enum stays unused. The level changes only when a **doctor accepts** (`POST /api/patients/{code}/suggestions/{alert_id}/accept`): in one transaction set `triage_level` to the suggested level, write one `triage_event` (`source = 'manual'`, previous/new level, `created_by_id`, `occurred_at`, `reason`), and set the alert `acknowledged` (`acknowledged_by_id`, `acknowledged_at`). **Dismiss** (`.../dismiss`) only acknowledges the alert. Read (`GET /api/patients/{code}/suggestions`) is open to any signed-in clinician; accept/dismiss require role `doctor` (403 otherwise). No new table and **no migration** (the existing `alerts`/`triage_events` tables are used). The suggestion is evaluated in `evaluate_retriage`, called once by `record_reading`, so the simulator and nurse entry path are unchanged. Frontend: one mounted `RetriageSuggestion` component on the patient detail area shows the open suggestion with `RiskBandBadge` and `TriageLevelBadge`, read-only for a nurse and with Accept/Dismiss for a doctor; tokens only, `lucide-react` icons, ES default + EN | Reusing `alerts`/`triage_events` keeps the story migration-free (Principle XII); the band already encodes risk, so no NEWS2 is recomputed outside `app/scoring` (Principle V, D-41); only a `manual` accept changes the level, matching Resolución 5596 (a clinician decides, D-41). Storing the raising band in the alert text (not a new column) satisfies the one comparison the no-duplicate rule needs with no schema change; with only `medium`/`high` suggesting, this is unambiguous. Rejected: a new `alerts` column or a new table for the suggested level/band (needs a migration, out of scope); letting `source = 'automatic'` change the level (forbidden by D-41); recomputing NEWS2 here (US-03 forbids it); allowing nurses to accept (accepting changes the triage level, a doctor's decision per the clarify session); raising on `low-medium` (clarified: only `medium`/`high`) | Active |

## Notes for later stories

- **US-05** (patient detail) keeps the `<RetriageSuggestion identifier={identifier} />` line (and the existing `<RecordReadingButton>` line) when it replaces the detail page body.
- **US-07** (acknowledge an alert) builds on the `alerts` `status`/`acknowledged_*` fields; this story only acknowledges a suggestion through accept or dismiss on that patient, not a general alert list.
- **US-08** (deterioration prediction) reacts to a rising NEWS2 trend across readings, a different trigger from this story's single-reading band crossing; it may raise its own alert with the same `alerts` table.

## Complexity Tracking

No violations; nothing to justify.
