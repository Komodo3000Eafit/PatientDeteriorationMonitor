# Implementation Plan: Export Vital Signs to CSV

**Branch**: `026-export-vitals-csv` | **Date**: 2026-11-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/026-export-vitals-csv/spec.md`

## Summary

US-10 lets any signed-in clinician download all of a patient's stored readings as a CSV file from
the patient detail page. The existing readings endpoint returns at most 200 readings and can't be
paged without changing US-03's contract. This story therefore adds one small read-only endpoint,
`GET /api/patients/{identifier}/readings/export`, which returns **every** reading as JSON, oldest
first, each in the US-03 reading shape (reused `to_response`, stored score, never recomputed).
The browser turns that JSON into CSV with a pure function (fixed English header, stored values,
RFC 4180 quoting, CSV-injection guard) and saves it with a Blob as
`<code>-vital-signs-<YYYY-MM-DD>.csv`. A new `ExportReadingsButton` (shared `Button`, lucide
`Download` icon) is mounted with one line on `PatientDetailPage`. No migration and no new
dependency. Decision: **D-53** ([research R1, R2](research.md)).

## Technical Context

**Language/Version**: Python 3.13 (backend), JavaScript with React 19 (frontend)

**Primary Dependencies**: FastAPI, SQLAlchemy, Pydantic (existing); React 19, react-router 8.5.2,
lucide-react 1.77.0 (existing). **None added.**

**Storage**: PostgreSQL (Neon); read-only on `patients`, `vital_signs`, `reading_scores`. No
migration.

**Testing**: pytest + FastAPI `TestClient` on in-memory SQLite (backend); Vitest + Testing Library
on jsdom (frontend)

**Target Platform**: one Azure App Service (FastAPI serves the React build); modern browsers

**Project Type**: web application (`backend/` + `frontend/`)

**Performance Goals**: export of about 300 readings in under 5 s (SC-001). About 1 KB of JSON per
reading, so a day is about 0.3 MB, well inside the client's 10 s timeout ([R6](research.md))

**Constraints**: never recompute NEWS2; no change to US-03's readings contract or to other
functional stories' code beyond the mount; "news2" must not appear in backend `app/` outside
`app/scoring/` (`test_news2_confined`); the token travels only in the `Authorization` header;
tokens only (no raw colors); all UI text via i18n

**Scale/Scope**: academic demo, a handful of patients, at most a few thousand readings each; 1
endpoint, 1 component, 2 small helper modules, 3 translation keys

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* **Result: PASS (before
and after design). No violations.**

- [x] I. Spec-driven and traceable: every task below maps to AC1–AC10 or FR-001–FR-016; tests name
  the AC they verify.
- [x] II. Small Scrum story: one story (US-10) with 1 endpoint, 1 button and 2 small pure modules.
- [x] III. Independence: depends only on US-03 (merged) and the TS foundation, as
  `docs/BACKLOG.md` says. It does not depend on US-06 to US-09. It **reuses by import, without
  changes**, `find_patient`/`get_session` (`app/patients.py`), `to_response`/`ReadingResponse`
  (`app/readings_api.py`), `Button`, `isPatientCode` and `apiGet`. The only edit to another
  functional story's code is the allowed **mount** (one import and one JSX line in
  `PatientDetailPage.jsx`). The router registration in `app/main.py` and the new keys in
  `translations.js` follow the established pattern for every story. The US-03 readings endpoint is
  untouched; R1 explains why paging it was rejected.
- [x] IV. Multi-agent: each task has an owner agent (table below); work is logged in
  `specs/026-export-vitals-csv/agent-log.csv`.
- [x] V. Clinical logic: no scoring and no prediction here. `news2_total`/`risk_band` are read from
  `reading_scores` through `to_response`. No triage level is changed.
- [x] VI. Data privacy: synthetic data only. The CSV carries readings and the patient code (in the
  filename) but no name, age or sex. No secrets.
- [x] VII. Tests: the critical paths are the CSV generation (format, order, stored values,
  injection guard, filename) and the API endpoint (200 / 401 / 404 / 503, every reading, order, no
  ids, stored score). Both are covered by automated tests that run in CI.
- [x] VIII. Security baseline: `Depends(get_current_user)` on the endpoint; patient-code validation
  through `find_patient` (404, no query); fixed error messages, nothing echoed or logged except the
  error type; the CSV-injection guard; a filename built only from a validated code; the route stays
  inside `<RequireAuth>`.
- [x] IX. Deployable at low cost: no new service. It runs on the same App Service, Neon and GitHub
  Actions.
- [x] X. Stack: FastAPI, React, PostgreSQL.
- [x] XI. Language: code and docs in English; 3 UI keys in es (default) and en; the new glossary
  row "vital signs CSV export" is added in this PR. The CSV header is fixed English
  (machine-readable, spec AC8).
- [x] XII. Simplicity: no CSV or download library, no pagination, no cap, no new response model,
  no client change. About 30 backend lines and three small frontend files.

## Design

### Backend: `backend/app/readings_export_api.py` (new)

- `router = APIRouter()` and
  `@router.get("/patients/{identifier}/readings/export", response_model=ReadingExportResponse)`.
- `class ReadingExportResponse(BaseModel): readings: list[ReadingResponse]`. A local model whose
  docstring says "oldest first". `ReadingListResponse` is not reused because its docstring says
  "newest first".
- The body reuses US-03's `list_readings` pattern: `find_patient(session, identifier)`, then
  `select(VitalSign, ReadingScore).join(...).where(patient_id).order_by(VitalSign.recorded_at.asc(),
  VitalSign.id.asc())` with **no limit**, then `to_response` on each row. On `SQLAlchemyError`, it
  rolls back, logs `type(exc).__name__` and returns 503 "Service unavailable".
- `user: User = Depends(get_current_user)` with no role check.
- **Never write "news2"** in this file, docstrings and comments included.
- `app/main.py`: `from app import readings_export_api` and
  `app.include_router(readings_export_api.router, prefix="/api")`.

Contract: [contracts/readings-export-api.md](contracts/readings-export-api.md).

### Frontend: `frontend/src/pages/export-readings/` (new)

| File | Content |
|---|---|
| `readingsCsv.js` | Pure `CSV_COLUMNS`, `csvField`, `buildReadingsCsv(readings)`, `exportFileName(identifier, date)` |
| `downloadCsv.js` | `downloadCsv(text, filename)`: Blob + object URL + temporary `<a download>`, then revoke |
| `ExportReadingsButton.jsx` | `identifier` prop. `null` for an invalid code. Otherwise the shared `Button` (secondary) with a decorative `Download` icon; busy and disabled while running; `role="alert"` error |
| `ExportReadingsButton.module.css` | Wrapper/content layout and error text, tokens only |
| `readingsCsv.test.js`, `ExportReadingsButton.test.jsx` | Tests (below) |

Mount in `pages/patient-detail/PatientDetailPage.jsx` (allowed by Principle III):
`import ExportReadingsButton from "../export-readings/ExportReadingsButton.jsx";` and
`<ExportReadingsButton identifier={identifier} />` immediately after
`<RecordReadingButton identifier={identifier} />` in `.topRow`. Nothing else in the file changes.

Translations: `exportReadings.button`, `exportReadings.busy` and `exportReadings.error` in `es` and
`en`. Glossary row and full details: [contracts/ui.md](contracts/ui.md). Data mapping:
[data-model.md](data-model.md).

### Test plan

**Backend** `backend/tests/test_readings_export_api.py` (in-memory SQLite + `StaticPool` +
`dependency_overrides`, as in `test_readings_api.py`; synthetic data):

| Test | Covers |
|---|---|
| Doctor gets 200 and every reading; **205 readings** are all returned, more than the 200 cap | AC1, FR-002 |
| Order is `recorded_at` ascending; readings with the **same `recorded_at`** come back in save order | AC1, FR-002 |
| Values match the stored ones: temperature `"37.0"` as a string, boolean `on_oxygen`, ACVPU code | AC2, FR-003/004 |
| **Stored score, never recomputed**: change a `reading_scores` row's `total`/`band` directly, and the export returns the changed values | AC1, FR-003, SC-002 |
| Nurse also gets 200 (no role check) | FR-009 |
| Patient with no readings → `{"readings": []}` | AC4, FR-008 |
| Discharged patient → 200 with its readings | Edge case |
| No token, bad token or expired token → 401 with `WWW-Authenticate: Bearer` and no readings | AC5, FR-009 |
| Unknown code → 404; badly formatted code (e.g. `pat-1`, `PAT_1`) → 404, fixed body | FR-009 |
| Database error → 503 `{"detail": "Service unavailable"}`, logged by error type only | AC7, FR-011 |
| No `id`, `patient_id`, `vital_sign_id` or patient code in any item | Contract |
| The existing `GET .../readings` still caps at 200 and is newest first (regression) | AC10 |

`test_news2_confined` (existing) must stay green.

**Frontend** `readingsCsv.test.js` (pure, no DOM):

| Test | Covers |
|---|---|
| The header record equals the exact AC2 line plus `\r\n` | AC2 |
| `[]` → header-only text | AC4, FR-008 |
| Two readings → three records, in the given order (no re-sorting), each ending with `\r\n` | AC1, FR-002 |
| Values: `"37.0"` stays `37.0`; `false`/`true`; ACVPU letter; `score.total` and `score.band` used (with a mismatched made-up total to prove nothing is recomputed); `recorded_at` unchanged | AC2, FR-003/004 |
| `csvField` quoting: comma, double quote (doubled), `\n`, `\r`; plain values unquoted | AC2, FR-005 |
| Injection guard: each of `=` `+` `-` `@` `\t` `\r` at the start gets `'`; the same characters in the middle don't; guard then quote (`=1,2` → `"'=1,2"`); a crafted reading with `consciousness: '=cmd'` ends up neutralized in the full CSV | AC6, FR-006 |
| `exportFileName('PAT-001', new Date(2026, 10, 22))` → `PAT-001-vital-signs-2026-11-22.csv`; single-digit month and day are zero-padded; invalid codes (`'../x'`, `'PAT 1'`, `'pat-1'`, `''`, `'A'.repeat(21)`, `undefined`) → `null` | AC3, FR-007 |

**Frontend** `ExportReadingsButton.test.jsx` (fetch stubbed, `downloadCsv.js` replaced with
`vi.mock`):

| Test | Covers |
|---|---|
| Renders "Exportar CSV" (es default) and "Export CSV" after switching to en; the icon `svg` has `aria-hidden="true"` | AC8, AC9 |
| No request is made on render | R9 |
| Click → GET `/api/patients/PAT-001/readings/export` with the Bearer header → `downloadCsv` called once with the expected CSV text and `PAT-001-vital-signs-<local date>.csv` | AC1, AC3 |
| Empty `readings` → `downloadCsv` called with header-only text | AC4 |
| While pending, the button is disabled with "Exportando…" / "Exporting…"; a second click makes no second request | AC7 |
| 404, 503, a network error, or a body without a `readings` array → alert "No se pudo exportar el CSV. Inténtalo de nuevo." (and the en text), `downloadCsv` not called, button enabled again | AC7, FR-010 |
| Invalid code → renders nothing | FR-007 |
| Signed out: `renderApp(['/patients/PAT-001'])` shows the login page and no "Exportar CSV" | AC5 |
| Signed in on the detail page (`renderApp` + `stubBackend`) as doctor **and** as nurse: the export button is present next to the page title | FR-001, FR-009 |

Existing guards must stay green: `styles/noRawColors.test.js`, `styles/contrast.test.js`,
`translations.test.js`, the `PatientDetailPage` tests and `App.routes.test.jsx`.

### Owner agents (Principle IV)

| Work | Agent |
|---|---|
| `readings_export_api.py`, router registration, backend tests | backend-dev |
| `export-readings/*`, mount line, translations, glossary row | frontend-dev |
| Writing and running the full test plan, AC-by-AC check | qa-tester |
| Review: auth, code validation, injection guard, filename, logging | security-reviewer |
| BACKLOG/PROJECT_STATUS update, DECISIONS D-53 check, agent log, PR | orchestrator |

DevOps has no work: there is no CI, deploy or environment change.

## Project Structure

### Documentation (this feature)

```text
specs/026-export-vitals-csv/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R10
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── readings-export-api.md
│   └── ui.md
├── checklists/requirements.md
└── tasks.md             # next: /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── main.py                        # + import and include_router (registration only)
│   └── readings_export_api.py         # NEW: GET /api/patients/{identifier}/readings/export
└── tests/
    └── test_readings_export_api.py    # NEW

frontend/src/
├── i18n/translations.js               # + exportReadings.* (es, en)
└── pages/
    ├── export-readings/               # NEW (US-10)
    │   ├── readingsCsv.js
    │   ├── readingsCsv.test.js
    │   ├── downloadCsv.js
    │   ├── ExportReadingsButton.jsx
    │   ├── ExportReadingsButton.module.css
    │   └── ExportReadingsButton.test.jsx
    └── patient-detail/PatientDetailPage.jsx   # + import and one mount line

docs/
├── DECISIONS.md      # D-53 (added with this plan)
├── GLOSSARY.md       # + "vital signs CSV export" row
├── BACKLOG.md        # US-10 → done (at the end)
└── PROJECT_STATUS.md # US-10 done (at the end)
```

**Structure Decision**: web application layout (`backend/` + `frontend/`), following the existing
feature-folder convention (`pages/record-reading/` holds US-03's mounted `RecordReadingButton`,
so `pages/export-readings/` holds US-10's).

## Complexity Tracking

No violations. Nothing to justify.

Note for merging: D-53 is the next free decision number on `main` and on
`origin/025-patient-list-filter-sort` as of 2026-11-22. If another team-session story merges a D-53
first, renumber this entry when rebasing.
