# Implementation Plan: Save and Score Vital-Sign Readings

**Branch**: `017-vital-signs-scoring` | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/017-vital-signs-scoring/spec.md`

## Summary

Every reading is stored with its NEWS2 result. A new table `reading_scores` (one row per reading,
unique FK) holds the scoring system, NEWS2 score, risk band and the 7 explanation entries in a
JSON column (codes and numbers; decimals as strings). `record_reading` stays the only creation
point: it scores with `get_scoring_system()`, then adds the reading and its score in the caller's
transaction, so the simulator is unchanged. Migration `0002_reading_scores` creates the table and
backfills every existing reading in batches; its downgrade drops the table (scores are derived and
rebuilt by upgrading again). A new router `app/readings_api.py`
adds `POST /api/patients/{code}/readings` (nurses; 401/403/404/409/422) and `GET` (any signed-in
user; newest first, 50 default, `limit` 1–200). The frontend adds the nurse-only page
`/patients/:identifier/readings/new` (completeness and format checks only; 422 problems shown
next to each field) with a result view showing the stored score and the reason for each point in
ES/EN, plus a nurse-only "Registrar signos vitales" button mounted on the patient detail page.
No new dependency. Decision D-50 records the storage shape, backfill and API.

## Technical Context

**Language/Version**: Python 3.13 (FastAPI, Pydantic v2, SQLAlchemy 2, Alembic); JavaScript (ES modules), React 19.3, Vite 8

**Primary Dependencies**: existing only: FastAPI, SQLAlchemy, Alembic, pg8000; React, `react-router` 8.5.2 (D-45), `lucide-react` 1.77.0 (D-46). **No new dependency**

**Storage**: PostgreSQL on Neon; new table `reading_scores` (migration `0002_reading_scores` with backfill; downgrade drops the table); existing `vital_signs`, `patients`, `users` unchanged

**Testing**: pytest with in-memory SQLite (`StaticPool`, `get_session`/`get_current_user` overrides as in `test_patients.py`; migration run through Alembic `MigrationContext` + `Operations`); Vitest + jsdom + React Testing Library with `renderApp` and `stubBackend`. Baseline counts recorded in the first task

**Target Platform**: one Azure App Service (FastAPI serves the React build, D-39); local Vite dev server

**Project Type**: web application (`backend/` + `frontend/`)

**Performance Goals**: an entered reading answered within the existing 10 s client timeout; history ≤ 200 rows in one joined query; backfill in batches of 500

**Constraints**: routes under `/api` (D-44); limits only from `ACCEPTED_LIMITS` (the form checks no ranges); 422 never echoes values; NEWS2 rules only in `app/scoring`; tokens only, icons from `lucide-react` only; UI Spanish by default + English; synthetic data only

**Scale/Scope**: 1 table + 1 migration, 1 function changed, 2 endpoints, 1 page, 1 result component, 1 button, ~45 translation keys per language, ~35 backend and ~30 frontend tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] I. Spec-driven and traceable: every file below maps to AC1–AC20; tests name the AC they verify
- [x] II. Small Scrum story: one story (US-03); one table, one function change, two endpoints, one page
- [x] III. Independence: depends only on merged TS-03/06/07/08/12/13 (US-01 used as a pattern only). US-01's `app/patients.py` is **not modified**: `get_session` is imported, the router is new (research R5). Shared files change only to register a route (`main.py`, `App.jsx`) or mount a component (`PatientDetailPage.jsx`); technical-story files get small additive changes (`readings.py` as planned by TS-08, `models.py`, `demo_patients.py` delete list as noted by TS-08, `api/client.js` optional `detail`, `testing/fakeBackend.js` optional handler)
- [x] IV. Multi-agent: backend-dev (model, migration, `record_reading`, API), frontend-dev (page, result, button, texts), qa-tester (tests), security-reviewer (auth, validation, no echo, migration safety), devops (migration on a Neon branch), orchestrator logs `agent-log.csv`
- [x] V. Clinical logic: scoring only through `get_scoring_system()`; each stored score keeps which vitals and ranges produced every point; no triage level or alert is changed or created
- [x] VI. Data privacy: synthetic readings only in tests and demo; no secrets; 422 and logs never contain values
- [x] VII. Tests: scoring storage, backfill, API statuses and security controls covered by automated tests
- [x] VIII. Security baseline: auth on both endpoints, nurse role on POST, strict validation from the single limits source, unknown fields rejected, patient code format checked before any query, fixed error messages, page inside `<RequireAuth>`
- [x] IX. Deployable at low cost: no new service; same App Service and Neon database
- [x] X. Stack: FastAPI, React, PostgreSQL
- [x] XI. Language: English code/docs; ES default + EN texts in `translations.js`; glossary gains the new terms in this PR
- [x] XII. Simplicity: one JSON column instead of entry rows, no ORM relationship, no service layer, no new color tokens, no new library

**Post-design re-check (after Phase 1)**: still all pass; no Complexity Tracking entry needed.

## Project Structure

### Documentation (this feature)

```text
specs/017-vital-signs-scoring/
├── spec.md
├── plan.md              # This file
├── research.md          # R1–R9 decisions
├── data-model.md        # reading_scores, entry shape, write/read flows, migration
├── quickstart.md        # Automated, migration, simulator, API and UI validation
├── contracts/
│   ├── readings-api.md  # POST/GET /api/patients/{code}/readings, shared field names
│   └── ui.md            # Page, result view, button, errors, texts
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── models.py                 # EDIT: ReadingScore model (AC1, FR-001)
│   ├── readings.py               # EDIT: record_reading scores + stores; score_values() helper (AC1–AC4, FR-002)
│   ├── readings_api.py           # NEW: router, ReadingResponse, require_nurse_recorder, POST + GET (AC7–AC11, FR-005–FR-011)
│   ├── demo_patients.py          # EDIT: delete ReadingScore before VitalSign in reset_demo_patients (AC6, FR-004)
│   └── main.py                   # EDIT: include readings_api.router with prefix "/api" (route registration)
├── migrations/versions/
│   └── 0002_reading_scores.py    # NEW: create table + batched backfill; downgrade drops the table (AC5, FR-003)
└── tests/
    ├── test_readings.py                  # EDIT: score stored, equals module, all or nothing, single creation point
    ├── test_simulator.py                 # EDIT: simulator readings have scores (AC4)
    ├── test_demo_patients.py             # EDIT: reset with scores (AC6)
    ├── test_migrations.py                # EDIT: head 0002, 6 tables/FKs, downgrade drops reading_scores (offline head→base test unchanged)
    ├── test_reading_scores_migration.py  # NEW: backfill, empty table, batching, failure rolls back (AC5)
    └── test_readings_api.py              # NEW: AC7–AC11, FR-005–FR-011

frontend/src/
├── App.jsx                       # EDIT: <Route path="/patients/:identifier/readings/new"> in <RequireAuth> (AC17, AC18)
├── App.routes.test.jsx           # EDIT: route ranking, bad code → not-found (AC18)
├── api/client.js                 # EDIT: ApiError.detail for 422 (additive) (AC15)
├── api/client.test.js            # EDIT: 422 detail parsed; message unchanged
├── pages/
│   ├── record-reading/
│   │   ├── RecordReadingPage.jsx         # NEW: form / nurses-only message / errors (AC12, AC13, AC15–AC17, AC20)
│   │   ├── RecordReadingPage.module.css  # NEW: tokens only
│   │   ├── RecordReadingPage.test.jsx    # NEW
│   │   ├── ReadingResult.jsx             # NEW: stored score + reason table (AC14)
│   │   ├── ReadingResult.module.css      # NEW
│   │   ├── ReadingResult.test.jsx        # NEW: ES + EN
│   │   ├── formatReason.js               # NEW: entry → "21–24" / "≤ 8" / "≥ 25" / categories (display only)
│   │   ├── formatReason.test.js          # NEW
│   │   ├── RecordReadingButton.jsx       # NEW: nurse-only, Activity icon (AC19)
│   │   ├── RecordReadingButton.module.css
│   │   └── RecordReadingButton.test.jsx  # NEW
│   └── patient-detail/PatientDetailPage.jsx  # EDIT: mount <RecordReadingButton identifier={identifier} /> (one line + import)
├── i18n/translations.js          # EDIT: recordReading.*, parameter.*, consciousness.*, riskBand.*, yesNo.* (es + en)
└── testing/fakeBackend.js        # EDIT: optional `readings` handler for /api/patients/<code>/readings

docs/
├── GLOSSARY.md        # EDIT: stored score / reading_scores, entry keys, entry page, button, parameter, ACVPU, risk band and reason UI texts
├── DECISIONS.md       # EDIT: D-50 (stored score shape, backfill, readings API)
├── BACKLOG.md         # EDIT: US-03 done, spec link
└── PROJECT_STATUS.md  # EDIT: US-03 done
```

**Structure Decision**: web application (`backend/` + `frontend/`). New code lives in files owned
by US-03 (`app/readings_api.py`, `0002_reading_scores.py`, `pages/record-reading/`); TS-08's
`readings.py` is extended as TS-08 planned; shared files change only to register a route, mount a
component, add texts, add a model, or add small optional test-helper/client fields.

## Planned decision D-50 (written to `docs/DECISIONS.md` during implementation)

| D-50 | 2026-11-20 | Stored scores (US-03): every reading has **exactly one stored score** in a new table `reading_scores` (unique FK `vital_sign_id` → `vital_signs`, `ON DELETE RESTRICT`) with `system`, `total` (NEWS2 score), `band` (risk band) and `entries`, a **JSON column** holding the 7 explanation entries (`parameter`, `value`, `points`, `low`, `high`, `category`; codes and numbers only, temperature as a one-decimal string; the frontend translates them). **`record_reading` stays the only creation point**: it scores with `get_scoring_system()` and adds the reading and its score in the caller's transaction, so the simulator is unchanged. Later stories **read the stored score and never recompute it**. Migration `0002_reading_scores` creates the table and **backfills every existing reading** in batches in the same upgrade transaction (an invalid stored reading aborts the whole upgrade); its **downgrade drops the table**, since scores are derived from readings and upgrading again rebuilds them. **Deploy order**: the migration runs before the new code is live, so **the simulator must not run while the US-03 deploy is in progress**; a reading saved by the old code in that window would have no score. API: `POST /api/patients/{code}/readings` (nurses; 401/403/404/409 discharged/422 from `InvalidVitalSigns` without values) and `GET` (signed-in users; newest first, `limit` 1–200, default 50) in a new router `app/readings_api.py`; the form checks no value ranges (`ACCEPTED_LIMITS` is the single source) | One JSON column is the simplest shape for entries that are always read with their score (Principle XII); storing the score keeps what was shown at the time and saves later stories from recomputing it. Backfilling in the same upgrade means no reading is ever left without a score after `alembic upgrade head`. A dropping downgrade loses nothing (derived data) and keeps the existing head→base downgrade test working. A new router keeps US-01's `patients.py` unchanged (Principle III). Rejected: a row per entry (7× rows, a join on every read); columns on `vital_signs` (mixes measured and derived data); `JSONB` (PostgreSQL-only, breaks the SQLite tests); recomputing on read (the spec forbids it); a separate backfill command (can be forgotten); a downgrade that refuses (blocks the existing test for no data benefit); range checks in the form (a second copy of the limits) | Active |

## Notes for later stories

- **US-02** (latest NEWS2 score in the list) and **US-05** (detail) read the stored score: join
  `reading_scores` on the patient's latest `vital_signs` row, or call `GET
  /api/patients/{code}/readings?limit=1`. Field names are in [contracts/readings-api.md](contracts/readings-api.md).
- **US-05** keeps the `<RecordReadingButton identifier={identifier} />` line when it replaces the
  detail page body, and may reuse `ReadingResult` / `formatReason` for the latest reading.
- **US-04** reads `score.band` from the stored score; it must not recompute NEWS2.
- **US-06 / US-08 / US-10** use the GET history (`limit` up to 200); temperature arrives as a string.

## Complexity Tracking

No violations; nothing to justify.
