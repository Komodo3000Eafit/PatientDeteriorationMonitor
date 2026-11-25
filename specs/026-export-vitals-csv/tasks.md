---

description: "Task list for US-10 vital signs CSV export"
---

# Tasks: Export Vital Signs to CSV

**Input**: Design documents from `specs/026-export-vitals-csv/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/readings-export-api.md](contracts/readings-export-api.md), [contracts/ui.md](contracts/ui.md), [quickstart.md](quickstart.md)

**Tests**: MANDATORY. The CSV generation is the critical path, and the story adds one API endpoint and two security controls (CSV-injection guard, filename sanitization) (constitution Principle VII; spec FR-015). There is at least one automated test per acceptance criterion AC1–AC10. qa-tester writes and runs the tests after implementation, then security-reviewer reviews.

**Organization**: This feature has one story (US-10), so every story task carries the `[US-10]` label.

## Format: `[ID] [P?] [Story] Description (agent)`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks).
- **(agent)**: Owner agent at the end of the line: backend-dev, frontend-dev, qa-tester, security-reviewer or orchestrator.
- All paths are relative to the repository root. Backend commands run from `backend/` (venv active); frontend commands run from `frontend/`.
- Edit files with the file tools, not PowerShell (non-ASCII text such as accents, `…`, `—`). Keep files UTF-8.
- **Only these paths change**:
  - New: `backend/app/readings_export_api.py`, `backend/tests/test_readings_export_api.py`, everything under `frontend/src/pages/export-readings/`.
  - Edited: `backend/app/main.py` (import + `include_router` only), `frontend/src/pages/patient-detail/PatientDetailPage.jsx` (one import + one mount line only), `frontend/src/i18n/translations.js` (`exportReadings.*` keys), `docs/GLOSSARY.md`, `docs/DECISIONS.md` (D-54 already added by the plan; check only), `docs/BACKLOG.md`, `docs/PROJECT_STATUS.md`, and this story's `agent-log.csv`.
- **Not changed**: `backend/app/readings_api.py`, `backend/app/patients.py` (both reused by import only), `backend/app/readings.py`, `backend/app/scoring/*`, `backend/app/models.py`, `backend/migrations/*` (no migration), `frontend/src/api/client.js`, `frontend/src/components/*` (reused `Button`), `frontend/src/utils/*` (reused `isPatientCode`), `frontend/src/testing/*`, `frontend/src/styles/tokens.css`, `frontend/src/App.jsx`, the rest of `PatientDetailPage.jsx` and its CSS and tests, every US-01 to US-05 file not listed above, `.github/`, `.specify/`, `frontend/package.json`, `frontend/package-lock.json`, `backend/requirements.txt` (no new dependency).
- Agents log each step with `pwsh -NoProfile -File scripts/log-agent.ps1 -Agent <agent> -Task <Txxx> -Action <action> -Details "<text>"` (on Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File ...`). Action is one of `assigned`, `started`, `done`, `failed`, `finding`, `verified`, `rework`; the script writes to `specs/026-export-vitals-csv/agent-log.csv`.
- Synthetic data only: fictitious patients, synthetic users, made-up vital signs; no real data.
- **Never write the word "news2" (in any case) in `backend/app/readings_export_api.py`**, including docstrings and comments. `backend/tests/test_scoring_interface.py::test_news2_confined` fails otherwise (research R2). Say "stored score" instead.

---

## Phase 1: Setup

- [X] T001 [US-10] Baseline before any change: in `backend/` run `python -m pytest -q`; in `frontend/` run `npm ci`, `npm test` and `npm run build`. Record both passing test counts and that the build succeeds, for the PR description. Do not edit files (qa-tester)

---

## Phase 2: Foundational

None. Everything needed is merged and reused without changes: TS-03 (tables `patients`, `vital_signs`, `reading_scores`), TS-06 (`get_current_user`, the client's 401 session-expiry handling), TS-12 (`Button`, tokens, guard tests), TS-13 (`<RequireAuth>`, route `/patients/:identifier`, `renderApp`, `stubBackend`, `isPatientCode`), TS-14 (`lucide-react`), US-03 (`to_response`, `ReadingResponse` in `app/readings_api.py`), and `find_patient`/`get_session` in `app/patients.py`. There is no table and no migration (data-model.md).

---

## Phase 3: US-10 Export vital signs to CSV 🎯 MVP

**Goal**: A signed-in clinician (doctor or nurse) clicks "Exportar CSV" on `/patients/:identifier` and the browser downloads `<code>-vital-signs-<YYYY-MM-DD>.csv`. The file holds every stored reading of the patient, oldest first, with the fixed English header, stored values and the stored NEWS2 total and risk band (never recomputed), with formula-trigger values neutralized.

**Independent Test**: `python -m pytest` and `npm test` pass with the new tests. `GET /api/patients/PAT-001/readings/export` returns every reading oldest first (more than 200 when they exist) and 401 without a token. On the detail page the demo doctor downloads the CSV, and a just-registered patient exports a header-only file ([quickstart.md](quickstart.md)).

### Backend implementation (backend-dev)

- [X] T002 [US-10] Create `backend/app/readings_export_api.py` (contracts/readings-export-api.md; research R1, R6). Module docstring: `"""Export every reading of one patient with its stored score, oldest first (US-10). See specs/026-export-vitals-csv/contracts/readings-export-api.md."""`. Contents:
  - `logger = logging.getLogger(__name__)`.
  - Imports: `APIRouter, Depends, HTTPException` (fastapi), `BaseModel` (pydantic), `select` (sqlalchemy), `SQLAlchemyError`, `Session`, `get_current_user` (`app.auth`), `ReadingScore, User, VitalSign` (`app.models`), `find_patient, get_session` (`app.patients`), `ReadingResponse, to_response` (`app.readings_api`). Import only; change none of those modules.
  - `class ReadingExportResponse(BaseModel)` with the docstring "Every reading of a patient, oldest first." and the field `readings: list[ReadingResponse]`.
  - `router = APIRouter()` and `@router.get("/patients/{identifier}/readings/export", response_model=ReadingExportResponse)` `def export_readings(identifier: str, user: User = Depends(get_current_user), session: Session = Depends(get_session))`. Docstring: "Any signed-in user (doctor or nurse); any patient status. Scores are read, never recomputed. No limit."
  - Body: `try:` `patient = find_patient(session, identifier)`, then `rows = session.execute(select(VitalSign, ReadingScore).join(ReadingScore, ReadingScore.vital_sign_id == VitalSign.id).where(VitalSign.patient_id == patient.id).order_by(VitalSign.recorded_at.asc(), VitalSign.id.asc())).all()` with **no `.limit()`**, and return `ReadingExportResponse(readings=[to_response(v, s) for v, s in rows])`. `except SQLAlchemyError as exc:` → `session.rollback()`, `logger.warning("Reading export failed (%s)", type(exc).__name__)`, `raise HTTPException(503, "Service unavailable")`.
  - No role check, no query parameters, and no logging of values, the patient code or the user. **No "news2" text anywhere in the file.**
  Depends on T001 (AC1, AC2, AC4, AC5, AC7, FR-002, FR-003, FR-004, FR-008, FR-009, FR-011) (backend-dev)
- [X] T003 [US-10] In `backend/app/main.py` register the router, following the existing pattern: add `from app import readings_export_api` next to the other `from app import ...` lines, and `app.include_router(readings_export_api.router, prefix="/api")` right after `app.include_router(readings_api.router, prefix="/api")`. Change nothing else. Depends on T002 (FR-009, AC10) (backend-dev)

### Frontend implementation (frontend-dev)

- [X] T004 [P] [US-10] In `frontend/src/i18n/translations.js` add three keys to **both** `es` and `en`, next to the `recordReading.*` keys (contracts/ui.md "Translations"):
  - `exportReadings.button`: `'Exportar CSV'` / `'Export CSV'`
  - `exportReadings.busy`: `'Exportando…'` / `'Exporting…'`
  - `exportReadings.error`: `'No se pudo exportar el CSV. Inténtalo de nuevo.'` / `'Could not export the CSV. Please try again.'`
  Change no other key. Depends on T001 (AC8, FR-013) (frontend-dev)
- [X] T005 [P] [US-10] Create `frontend/src/pages/export-readings/readingsCsv.js`, pure with no React, network, DOM or logging (contracts/ui.md "readingsCsv.js"; data-model.md; research R3, R4, R7). Header comment: `// Builds the vital signs CSV from stored readings (US-10). Pure: no scoring, no sorting, no network.` Exports:
  - `CSV_COLUMNS = ['recorded_at','respiratory_rate','spo2','on_oxygen','systolic_bp','heart_rate','consciousness','temperature','news2_total','risk_band']`.
  - `csvField(value)`: `let text = String(value)`. If `/^[=+\-@\t\r]/.test(text)`, set `text = "'" + text`. Then, if `/[",\r\n]/.test(text)`, return `'"' + text.replaceAll('"', '""') + '"'`. Otherwise return `text`.
  - `buildReadingsCsv(readings)`: a record is `fields.map(csvField).join(',') + '\r\n'`. The header record is `CSV_COLUMNS`. Then one record per reading **in the given order**, with `[r.recorded_at, r.respiratory_rate, r.spo2, r.on_oxygen, r.systolic_bp, r.heart_rate, r.consciousness, r.temperature, r.score.total, r.score.band]`. Every value is written as received (temperature as the one-decimal string, `recorded_at` unconverted, booleans as `true`/`false`). Return the concatenation; `[]` gives the header record only. No BOM.
  - `exportFileName(identifier, date = new Date())`: return `null` when `!isPatientCode(identifier)` (import from `../../utils/patientCode.js`). Otherwise return `` `${identifier}-vital-signs-${yyyy}-${mm}-${dd}.csv` `` from `date.getFullYear()`, `String(date.getMonth() + 1).padStart(2, '0')` and `String(date.getDate()).padStart(2, '0')` (local date).
  Depends on T001 (AC1, AC2, AC3, AC4, AC6, FR-003–FR-008) (frontend-dev)
- [X] T006 [P] [US-10] Create `frontend/src/pages/export-readings/downloadCsv.js` (contracts/ui.md "downloadCsv.js"; research R5). `export function downloadCsv(text, filename)`:
  1. Create `blob = new Blob([text], { type: 'text/csv;charset=utf-8' })` and `url = URL.createObjectURL(blob)`.
  2. Create an `a` element with `href = url`, `download = filename` and `hidden = true`, append it to `document.body` and call `a.click()`.
  3. In a `finally` block, remove the element and call `URL.revokeObjectURL(url)`.
  No return value, no logging and no dependency. Depends on T001 (AC1, FR-002) (frontend-dev)
- [X] T007 [US-10] Create `frontend/src/pages/export-readings/ExportReadingsButton.jsx` and `ExportReadingsButton.module.css` (contracts/ui.md "ExportReadingsButton.jsx"; research R8–R10).
  - Header comment: `// Button on the patient detail page that downloads every stored reading as CSV (US-10). Any signed-in role. Mounted on the patient detail page.`
  - `export default function ExportReadingsButton({ identifier })`. Use `useLanguage()` for `t`, and the state `busy` (false) and `failed` (false).
  - Render `null` when `!isPatientCode(identifier)`.
  - Otherwise render `<div className={styles.wrapper}>` containing:
    - `<Button variant="secondary" onClick={handleExport} disabled={busy}>` with `<span className={styles.content}><Download aria-hidden="true" focusable="false" size="1.25em" /><span>{busy ? t('exportReadings.busy') : t('exportReadings.button')}</span></span>`. `Download` comes from `lucide-react`.
    - `{failed && <p role="alert" className={styles.error}>{t('exportReadings.error')}</p>}`.
  - `async function handleExport()`:
    1. If `busy`, return. Set `busy` to true and `failed` to false.
    2. `try`: `body = await apiGet('/api/patients/' + identifier + '/readings/export')` (from `../../api/client.js`). If `!Array.isArray(body?.readings)`, throw. Otherwise `downloadCsv(buildReadingsCsv(body.readings), exportFileName(identifier))`.
    3. `catch`: set `failed` to true. Don't special-case 401: the client already clears the session and redirects.
    4. `finally`: set `busy` to false.
  - Make no request on render. Don't log or sort.
  - CSS (tokens only, no raw colors): `.wrapper` and `.content`, an inline-flex row with `gap: var(--space-2)` and centered items, like `RecordReadingButton.module.css`. `.error` uses `color: var(--color-text)` and `font-size: var(--font-size-base)`. Set no other font size; the button inherits the shared `Button` styles. Use only tokens that exist in `frontend/src/styles/tokens.css`.
  Depends on T004, T005, T006 (AC1, AC3, AC4, AC7, AC8, AC9, FR-001, FR-007, FR-010, FR-011, FR-012) (frontend-dev)
- [X] T008 [US-10] Mount the control in `frontend/src/pages/patient-detail/PatientDetailPage.jsx` (research R9; Principle III mount exception):
  - Add `import ExportReadingsButton from "../export-readings/ExportReadingsButton.jsx";` right after the `RecordReadingButton` import.
  - Add `<ExportReadingsButton identifier={identifier} />` on the line right after `<RecordReadingButton identifier={identifier} />` inside the `.topRow` div.
  Change **nothing else** in the file or in its CSS or tests. Depends on T007 (AC10, FR-001) (frontend-dev)

### Tests (qa-tester)

- [X] T009 [US-10] Create `backend/tests/test_readings_export_api.py` (contracts/readings-export-api.md; plan.md "Test plan"). Use the in-memory SQLite + `StaticPool` + `dependency_overrides` pattern from `test_readings_api.py` and `test_patient_detail.py`: override `app.patients.get_session` and `app.auth.get_current_user`, seed synthetic patients and users, and create readings with `app.readings.record_reading` so each has its stored score. Module docstring: list the ACs covered. At least:
  - Doctor → 200. With **205 readings**, all 205 are returned (more than the US-03 cap of 200) (AC1, FR-002).
  - Order is `recorded_at` ascending. Give two readings the **same `recorded_at`** (set the column directly) and check they come back in save (`id`) order (AC1, FR-002).
  - Values are as stored: `temperature` is the string `"37.0"` for 37 and `"38.4"` for 38.4; `on_oxygen` is a JSON boolean; `consciousness` is the ACVPU letter (AC2, FR-003, FR-004).
  - **Stored score, never recomputed**: update one `ReadingScore` row to `total=19, band="high"` directly in the session, and the export returns `19`/`"high"` for that reading (AC1, FR-003, SC-002).
  - Nurse → 200, so there is no role check (FR-009).
  - Patient with no readings → `{"readings": []}` (AC4, FR-008). A discharged patient → 200 with its readings (edge case).
  - With the real `get_current_user` (not overridden): no token, a malformed token and an expired token each give 401 `{"detail": "Not authenticated"}` with `WWW-Authenticate: Bearer`, and the body has no `readings` (AC5, FR-009).
  - Unknown code `PAT-999` → 404 `{"detail": "Patient not found"}`. Malformed codes `pat-1`, `PAT_1` and `A` × 21 → 404 with the same body (FR-009).
  - With `get_session` not overridden and `DATABASE_URL` unset → 503 `{"detail": "Service unavailable"}` (AC7, FR-011). With `caplog`, a forced `SQLAlchemyError` logs only the error type name and no value.
  - No item has `id`, `patient_id`, `vital_sign_id` or `identifier` (contract).
  - Regression: `GET /api/patients/{code}/readings?limit=200` with 205 readings still returns 200 items, newest first, and `limit=201` → 422 (AC10).
  Depends on T003. Run `python -m pytest` (the existing `test_news2_confined` must stay green) and record the new total (qa-tester)
- [X] T010 [P] [US-10] Create `frontend/src/pages/export-readings/readingsCsv.test.js` (pure, no DOM; contracts/ui.md examples). At least:
  - `buildReadingsCsv([])` equals exactly `'recorded_at,respiratory_rate,spo2,on_oxygen,systolic_bp,heart_rate,consciousness,temperature,news2_total,risk_band\r\n'` (AC2, AC4, FR-008).
  - Two synthetic readings give 3 records, each ending with `\r\n`, in the **given** order. Pass them newest-first and check the output keeps that order, which proves the util does not sort (AC1, FR-002).
  - Values: `temperature: "37.0"` is written as `37.0`; `on_oxygen` `false`/`true` as `false`/`true`; `recorded_at` byte-identical; `score.total`/`score.band` used. Use `total: 19, band: 'low'` with vitals that would score otherwise, to show nothing is recomputed (AC2, FR-003, FR-004).
  - `csvField` quoting: `'a,b'` → `"a,b"`; `'say "hi"'` → `"say ""hi"""`; values containing `\n` and `\r` are quoted; `37`, `false` and `'low-medium'` are unchanged (AC2, FR-005).
  - Injection guard: each of `'=1'`, `'+1'`, `'-1'`, `'@x'`, `'\tx'`, `'\rx'` gets a leading `'`; `'a=b'` and `'a-b'` are unchanged; `'=1,2'` → `"'=1,2"`; a crafted reading with `consciousness: '=HYPERLINK("x")'` appears neutralized and quoted in the full CSV (AC6, FR-006).
  - `exportFileName('PAT-001', new Date(2026, 10, 22))` → `'PAT-001-vital-signs-2026-11-22.csv'`; `new Date(2026, 0, 5)` gives `-2026-01-05`. `'../x'`, `'PAT 1'`, `'pat-1'`, `''`, `'A'.repeat(21)`, `'PAT-1/..'`, `undefined` and `null` each give `null` (AC3, FR-007).
  Depends on T005. Run `npm test` (qa-tester)
- [X] T011 [US-10] Create `frontend/src/pages/export-readings/ExportReadingsButton.test.jsx`. **Do not change `frontend/src/testing/*`.**
  - **Setup**:
    - `vi.mock('./downloadCsv.js', () => ({ downloadCsv: vi.fn() }))`.
    - Sign in with `signInForTest(user)`.
    - Build the base mock with `const base = stubBackend({ me, patient, readings, triageEvents, suggestions })` (synthetic handlers, as in `PatientDetailPage.test.jsx`). `stubBackend` installs `base` as the global fetch.
    - **Wrap it**: `const fetchMock = vi.fn((url, options) => EXPORT_PATH.test(new URL(url).pathname) ? exportHandler(url, options) : base(url, options))`, then `vi.stubGlobal('fetch', fetchMock)`. Here `EXPORT_PATH = /^\/api\/patients\/[^/]+\/readings\/export$/`, and `exportHandler` is set per test: success `jsonResponse({ readings })`, empty `jsonResponse({ readings: [] })`, 404, 503, `jsonResponse({})`, a never-resolving promise for the pending case, `Promise.reject(new TypeError('Failed to fetch'))` for the network case, and `Promise.reject(new DOMException('Aborted', 'AbortError'))` for the timeout case. Every other call passes through to `base`.
    - Render with `renderApp(['/patients/PAT-001'])`, wait for `/api/me` with `callsTo(fetchMock, '/api/me')`, and use the header ES/EN switch to change language.
    - Only the invalid-code case renders the component directly, inside `LanguageProvider`.
  - **Cases** (at least):
  - It renders "Exportar CSV" (es default) and, after switching language, "Export CSV". The icon `svg` has `aria-hidden="true"` and `focusable="false"` (AC8, AC9).
  - No call to the export path is made on render (research R9).
  - Click: the export path `/api/patients/PAT-001/readings/export` is called once with the header `Authorization: Bearer test-token`. `downloadCsv` is called once with `buildReadingsCsv(readings)` and `exportFileName('PAT-001')` (compute the expected values in the test) (AC1, AC3).
  - `{ readings: [] }` → `downloadCsv` is called with header-only text (AC4).
  - Pending export: the button is disabled and shows "Exportando…" (and "Exporting…" in en); a second click makes no second call to the export path; when the export resolves the button is enabled again (AC7).
  - Error path: 404, 503, a network error (`TypeError`), a **timeout (`AbortError`)** and a body `{}` without `readings` each show the alert "No se pudo exportar el CSV. Inténtalo de nuevo." (and the en text). `downloadCsv` is not called and the button is enabled again. The `AbortError` case asserts exactly the same result as the 503 and network cases (AC7, FR-010).
  - `<LanguageProvider><ExportReadingsButton identifier="not a code" /></LanguageProvider>` renders nothing (FR-007).
  - Signed out: `resetSession()`, `stubBackend()`, `renderApp(['/patients/PAT-001'])` → the login page shows and there is no "Exportar CSV" button (AC5).
  - Signed in as `DOCTOR` and as `NURSE` (same wrapped mock): the "Exportar CSV" button is present on the detail page for both roles (FR-001, FR-009).
  Depends on T007, T008. Run `npm test` (the raw-color, contrast, translations, `PatientDetailPage` and `App.routes` tests must stay green) and `npm run build`, and record the new totals (qa-tester)

### Docs (orchestrator)

- [X] T012 [P] [US-10] In `docs/GLOSSARY.md` §4, add the "vital signs CSV export" row from contracts/ui.md "Glossary" next to the "record vital signs button" row. In `docs/DECISIONS.md` check that **D-54** (added with the plan) matches what was built; if another story merged a D-54 first, renumber it and its references in `plan.md`, `contracts/ui.md` and the glossary row. Depends on T001 (FR-013, FR-016) (orchestrator)
- [X] T013 [US-10] When T009–T011 pass: in `docs/BACKLOG.md` set US-10 to ✅ with a link to `specs/026-export-vitals-csv/spec.md`; in `docs/PROJECT_STATUS.md` add US-10 ✅ under Step 12 (endpoint `GET /api/patients/{identifier}/readings/export`, every reading oldest first, CSV built in the browser with the injection guard, `ExportReadingsButton` mounted on the detail page, no migration and no new dependency, D-54) and update "Last updated". Depends on T009, T010, T011 (FR-016) (orchestrator)

### Manual validation (qa-tester, with a team member for the browser and spreadsheet steps)

- [ ] T014 [US-10] Run [quickstart.md](quickstart.md) "Manual check (local)" steps 1–9 locally, then the "Unauthenticated API check". This covers:
  - a **real browser download**, which jsdom cannot do (filename `PAT-001-vital-signs-<today>.csv`, exact header line, rows oldest first, the latest row matching "Lectura actual");
  - opening the file in a spreadsheet (Excel, LibreOffice Calc or Google Sheets) to confirm **10 columns in order and no value treated as a formula** (SC-003);
  - the header-only file for a new patient, the English label, nurse access, the signed-out redirect, and the error message with the backend stopped.
  Also note the **SC-001** check: with about 300 readings for one patient (run the simulator in demo mode long enough, or record synthetic readings), the download finishes in under 5 s. Write down the observed time.
  Record each step as pass or fail, the spreadsheet used and the SC-001 time in the PR description. Synthetic data only. Depends on T009, T010, T011 (SC-001, SC-003, AC1–AC8) (qa-tester)

### Review (security-reviewer)

- [X] T015 [US-10] Read-only security review (no code changes; report findings and how they were resolved). Verify:
  - The endpoint uses `Depends(get_current_user)`, answers 401 without a valid token, validates the code through `find_patient` before any query (404, no echo), returns the fixed 503 message logged by error type only, returns no internal ids, and mutates nothing.
  - `csvField` neutralizes `=` `+` `-` `@` tab and CR on every field before quoting, and quoting doubles inner quotes.
  - The filename comes only from a code matching `^[A-Z0-9-]{1,20}$`.
  - The token is sent only in the `Authorization` header (never in a URL), and the object URL is revoked.
  - Nothing is logged in the browser.
  - The route stays inside `<RequireAuth>`.
  - There is no NEWS2 recomputation, no triage-level change and no new dependency (`package.json`/`requirements.txt` unchanged).
  - The only edits to other stories' files are the T003 registration and the T008 mount; `readings_api.py`, `patients.py`, `client.js`, `testing/*`, `tokens.css` and `scoring/*` are unchanged.
  Depends on T009, T010, T011, T014 (AC5, AC6, AC10, FR-006, FR-007, FR-009, FR-011, FR-014; Principles III, V, VI, VIII) (security-reviewer)

**Checkpoint**: US-10 is fully functional and independently testable, both suites are green, and the security review is clean.

---

## Dependencies & Execution Order

- **Phase 1 (Setup)**: T001 first; no file edits.
- **Phase 2 (Foundational)**: none.
- **Phase 3 (US-10)**:
  - Backend: T002 → T003 → T009.
  - Frontend: T004, T005 and T006 can start after T001 (different files). T007 depends on T004–T006. T008 depends on T007. T010 depends on T005. T011 depends on T007 and T008.
  - Docs: T012 any time after T001. T013 after T009–T011.
  - Manual validation: T014 after T009–T011.
  - Review: T015 last, after T009–T011 and T014.
- The backend and frontend chains are independent. The frontend tests stub fetch, so they don't need the backend running.

## Parallel Opportunities

- After T001, the backend chain (T002→T003), the frontend files T004, T005 and T006, and the docs task T012 can all proceed at once.
- T010 can run as soon as T005 is done, in parallel with T007/T008.
- T009 (pytest) and T010/T011 (Vitest) are different suites and run in parallel once their targets exist.

## Parallel Example

```bash
# After T001, in parallel:
Task T002 → T003: export endpoint + router registration          (backend-dev)
Task T004: exportReadings.* keys in frontend/src/i18n/translations.js   (frontend-dev)
Task T005: frontend/src/pages/export-readings/readingsCsv.js             (frontend-dev)
Task T006: frontend/src/pages/export-readings/downloadCsv.js             (frontend-dev)
Task T012: glossary row + D-54 check                                     (orchestrator)
# Then: T007 → T008 (frontend), T010 (as soon as T005 is done), T009, T011, T013, T014, T015
```

## Implementation Strategy

The single story US-10 is the MVP:

1. Run the T001 baseline.
2. Build the endpoint (T002–T003) and the CSV util, download helper and control (T004–T008) in parallel.
3. Run the tests (T009–T011) and the docs tasks (T012–T013).
4. Run the manual quickstart validation (T014).
5. Run the security review (T015).

Then validate with [quickstart.md](quickstart.md) and open the PR with both suites green and the agent activity log.

## Notes

- One story per feature: every task carries `[US-10]`.
- No new table, no migration, no new dependency (plan.md Constitution Check XII).
- US-03's `GET .../readings` (`limit` ≤ 200, newest first) is deliberately unchanged. The new endpoint exists because that one cannot be paged (research R1, D-54).
- The CSV is built in the browser because the shared client only reads JSON, and because "news2" must stay out of backend `app/` (research R2).
- Keep files UTF-8; edit with the file tools, not PowerShell.
