# Implementation Plan: Patient Detail Page

**Branch**: `018-patient-detail` | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/018-patient-detail/spec.md`

## Summary

US-05 gives a doctor (or nurse) a read-only patient detail page at `/patients/:identifier` with
three blocks: the patient's data, the current reading with its stored NEWS2 score and the reason
per point, and the triage history newest-first. The backend adds **two** read-only GET endpoints
in the existing `app/patients.py` router: `GET /api/patients/{identifier}` (patient data plus the
time of the most recent reading; no `monitoring_status`, no internal `id`) and
`GET /api/patients/{identifier}/triage-events` (triage events newest-first; no `id`/`patient_id`).
Both require authentication (`Depends(get_current_user)`), reuse `find_patient` for code
validation and 404, and return 503 on a database error with a fixed message. The frontend replaces
the body of `PatientDetailPage`: it reads the code with `useParams().identifier`, shows the
not-found page when `isPatientCode` is false (no call), otherwise loads the patient from
`GET /api/patients/{identifier}`, the current reading from the existing
`GET /api/patients/{identifier}/readings?limit=1` (US-03 contract unchanged, never recompute
NEWS2) and the history from `GET /api/patients/{identifier}/triage-events`. The current reading is
rendered by reusing the existing `ReadingResult` component (which already shows the score, the
band via `RiskBandBadge`, and the reason table); the risk band is therefore shown by the existing
band-tinted `RiskBandBadge`, **not** `StatusBadge`. The patient block reuses `TriageLevelBadge`,
`Card` and `Button`; the `<RecordReadingButton identifier={identifier} />` line is kept. No new
table, no migration, no new dependency. Decision D-51 records the two endpoints and that US-05
shows the stored risk band and introduces no `monitoring_status`.

## Technical Context

**Language/Version**: Python 3.13 (FastAPI, Pydantic v2, SQLAlchemy 2); JavaScript (ES modules), React 19.3, Vite 8

**Primary Dependencies**: existing only: FastAPI, SQLAlchemy, pg8000; React, `react-router` 8.5.2 (D-45), `lucide-react` 1.77.0 (D-46). **No new dependency**

**Storage**: PostgreSQL on Neon; tables `patients`, `vital_signs`, `reading_scores`, `triage_events` already exist. **No new table, no migration** — read-only story

**Testing**: pytest with in-memory SQLite (`StaticPool`, `get_session` / `get_current_user` overrides as in `test_readings_api.py` / `test_patients.py`); Vitest + jsdom + React Testing Library with `renderApp` and `stubBackend`. Baseline counts recorded in the first task

**Target Platform**: one Azure App Service (FastAPI serves the React build, D-39); local Vite dev server

**Project Type**: web application (`backend/` + `frontend/`)

**Performance Goals**: the page loads within the existing 10 s client timeout; each GET is a single indexed lookup (patient by `identifier`) plus one small ordered query (triage events, or readings `limit=1`)

**Constraints**: routes under `/api` (D-44); no page path starts with `/api` or equals `/health`; NEWS2 read-only (never recomputed, rules stay in `app/scoring`); scores/bands read from the US-03 readings contract; 404 for unknown/badly-formatted code before any value is echoed; 503 fixed message, logged by error type only; tokens only, icons from `lucide-react` only; UI Spanish by default + English; synthetic data only; `StatusBadge` not reused (reserved for the future monitoring-status traffic light)

**Scale/Scope**: 0 tables, 0 migrations, 2 new endpoints + 2 response models in an existing router, 1 page body replaced, 0 new shared components (reuse `ReadingResult`, `RiskBandBadge`, `TriageLevelBadge`, `Card`, `Button`), ~18 translation keys per language, ~16 backend and ~14 frontend tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] I. Spec-driven and traceable: every file below maps to AC1–AC12 / FR-001–FR-020; tests name the AC/FR they verify
- [x] II. Small Scrum story: one story (US-05); two read-only endpoints, one page body, no new component or table
- [x] III. Independence: depends only on merged TS-03/06/12/13 and US-03. **US-02 (`PatientListPage`) and US-04 are not touched.** US-01's `app/patients.py` router is extended with two additive GET handlers (it owns `/api/patients...`; the route group is `patients.router`, so this is adding handlers to an existing router, not modifying US-02/US-04 code). Shared frontend files change only to replace this page's own body (`PatientDetailPage.jsx`), add texts (`translations.js`) and add optional test handlers (`fakeBackend.js`). `App.jsx` is **not** changed (the `/patients/:identifier` route already exists from TS-13). `ReadingResult` / `RiskBandBadge` / `formatReason` are imported unchanged (US-03 is a merged dependency)
- [x] IV. Multi-agent: backend-dev (two endpoints + response models), frontend-dev (page body, texts), qa-tester (backend + frontend tests), security-reviewer (auth on both endpoints, code validation, no id leaked, no echoed values, safe errors), devops (none — no migration/deploy change), orchestrator logs `agent-log.csv`
- [x] V. Clinical logic: the page reads the **stored** NEWS2 score/band through the US-03 readings endpoint and never recomputes NEWS2; no scoring rule lives outside `app/scoring`; the page creates/changes **no** triage level and **no** alert; the triage history is shown read-only; no `monitoring_status` traffic light is introduced (deferred to US-04 / a technical story)
- [x] VI. Data privacy: synthetic patients only; no secrets; 404/503 and logs never contain submitted values; responses omit internal `id`/`patient_id`
- [x] VII. Tests: both API endpoints (success with/without readings, 401, 404 unknown + malformed, no id/patient_id leaked, triage newest-first, 503) and the page states have automated tests; they run in CI
- [x] VIII. Security baseline: `Depends(get_current_user)` on both endpoints, patient-code format checked before any query (reusing `find_patient`), fixed safe error messages, page inside `<RequireAuth>` (TS-13, unchanged)
- [x] IX. Deployable at low cost: no new service; same App Service and Neon database; no migration
- [x] X. Stack: FastAPI, React, PostgreSQL
- [x] XI. Language: English code/docs; ES default + EN texts in `translations.js`; glossary gains the new UI texts in this PR (triage-event source labels, "no readings yet", "no previous level", "no score", load-error and patient-not-found messages)
- [x] XII. Simplicity: reuses `find_patient`, the existing router, and the existing `ReadingResult` / `RiskBandBadge` for the reading block, so no new component and no new band-presentation code; the risk-band presentation decision is "reuse the existing `RiskBandBadge`" — the simplest clear option that is not `StatusBadge`. No new dependency, table or abstraction

**Post-design re-check (after Phase 1)**: still all pass; no Complexity Tracking entry needed.

## Project Structure

### Documentation (this feature)

```text
specs/018-patient-detail/
├── spec.md
├── plan.md              # This file
├── research.md          # R1–R8 decisions
├── data-model.md        # Response shapes read from existing tables; no new table
├── quickstart.md        # Automated, API and UI validation
├── contracts/
│   ├── patient-detail-api.md   # GET /api/patients/{id} and /triage-events response shapes
│   └── ui.md                   # Page blocks, states, texts
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
backend/
├── app/
│   └── patients.py               # EDIT: add PatientDetailResponse, TriageEventResponse, GET /patients/{identifier}, GET /patients/{identifier}/triage-events; reuse find_patient (moved/shared) (AC8, AC9, FR-001–FR-004)
└── tests/
    └── test_patient_detail.py    # NEW: both endpoints — success with/without readings, 401, 404 unknown + malformed, no id/patient_id, triage newest-first, 503 (AC8, AC9, FR-001–FR-004, FR-019)

frontend/src/
├── pages/patient-detail/
│   ├── PatientDetailPage.jsx         # EDIT: replace body; load 3 blocks; keep <RecordReadingButton>; useParams().identifier; isPatientCode guard (AC1–AC7, AC10–AC12, FR-007–FR-015)
│   ├── PatientDetailPage.module.css  # NEW: tokens only
│   └── PatientDetailPage.test.jsx    # NEW: with data (band shown), no-readings, not-found, 404, load error, ES + EN, button kept (FR-019)
├── i18n/translations.js              # EDIT: patientDetail.* keys (es + en)
└── testing/fakeBackend.js            # EDIT: optional `patient` and `triageEvents` handlers for the two new paths (additive)

docs/
├── GLOSSARY.md        # EDIT: triage-event source labels, patient-detail UI texts
├── DECISIONS.md       # EDIT: D-51 (two read endpoints; US-05 shows stored band, no monitoring_status)
├── BACKLOG.md         # EDIT: US-05 done, spec link
└── PROJECT_STATUS.md  # EDIT: US-05 done
```

**Structure Decision**: web application (`backend/` + `frontend/`). New backend code is two
additive GET handlers plus two response models in the existing `app/patients.py` router (the
module that already owns `/api/patients...`). `find_patient` (today in `app/readings_api.py`) is
shared so both routers validate the code identically (see research R2). The frontend replaces only
this page's own body and reuses existing components; `App.jsx` is unchanged because TS-13 already
registered `/patients/:identifier`.

## Planned decision D-51 (written to `docs/DECISIONS.md` during implementation)

| D-51 | 2026-11-20 | Patient detail (US-05): **two separate read-only GET endpoints** in `app/patients.py` — `GET /api/patients/{identifier}` returns the patient's own data (`identifier`, `name`, `age`, `sex`, `triage_level`, `status`, `admitted_at`) plus `last_reading_at` (the most recent reading's `recorded_at`, or `null`); `GET /api/patients/{identifier}/triage-events` returns `{ "triage_events": [...] }` newest-first, each with `occurred_at`, `previous_level`, `new_level`, `score`, `reason`, `source`. Both require `Depends(get_current_user)` (any role), reuse `find_patient` (404 for a code not matching `^[A-Z0-9-]{1,20}$` or not found), return 503 with a fixed message on a database error, and **never** return an internal `id`/`patient_id` or echo a submitted value. The detail page reads the **current reading + stored score/band** from the existing `GET /api/patients/{identifier}/readings?limit=1` and **never recomputes NEWS2**. **US-05 does NOT introduce or compute a `monitoring_status` traffic light** (stable/warning/critical/no_data); it shows the already-stored NEWS2 **risk band** of the most recent reading via the existing `RiskBandBadge` (US-03), not `StatusBadge`. `monitoring_status` is deferred to US-04 or a dedicated technical story (constitution Principle V). | Two single-purpose endpoints mirror the existing resource pattern (`/patients/{id}/readings`) and let each page block load and be tested independently (clarified 2026-11-20). Putting them in `app/patients.py` keeps patient reads with the patient resource and reuses `find_patient`; reusing the readings endpoint for the current reading keeps US-05 independent of changes to the readings payload (Principle III) and avoids duplicating the reading shape. Reusing `RiskBandBadge` means no new presentation code (Principle XII). Rejected: one combined endpoint (couples two resources, bigger response, harder independent tests); embedding the latest reading in the patient endpoint (duplicates the US-03 shape, two sources of truth); computing `monitoring_status` here (clinical logic that belongs to US-04 per Principle V); a brand-new router for patient reads (would fragment `/api/patients...` ownership). | Active |

## Notes for later stories

- **US-04** (re-triage suggestion) or a dedicated technical story defines `monitoring_status`
  (stable/warning/critical/no_data) and may reuse `StatusBadge`; US-05 deliberately leaves that
  component unused.
- **US-06** (vitals chart) reuses `GET /api/patients/{identifier}/readings` (history, `limit` up
  to 200) and may mount a chart component on this detail page body.

## Complexity Tracking

No violations; nothing to justify.
