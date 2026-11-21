---

description: "Task list for US-02 patient list"
---

# Tasks: Patient List

**Input**: Design documents from `specs/016-patient-list/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/patient-list-api.md](contracts/patient-list-api.md), [contracts/ui.md](contracts/ui.md), [quickstart.md](quickstart.md)

**Tests**: MANDATORY. This story adds an API endpoint and an authenticated clinical view (constitution Principle VII; spec FR-016): at least one test per acceptance criterion AC1–AC15. Per the project template, qa-tester writes and runs the tests after implementation, then security-reviewer reviews.

**Organization**: This feature has one story (US-02), so all story tasks carry the `[US-02]` label.

## Format: `[ID] [P?] [Story] Description (agent)`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks).
- **(agent)**: Owner agent at the end of the line: backend-dev, frontend-dev, qa-tester, security-reviewer or orchestrator.
- All paths are relative to the repository root. Backend commands run from `backend/` (venv active); frontend commands from `frontend/`.
- Edit files with the file tools (Edit/Write), never PowerShell (non-ASCII text such as `Código`, `…`; CLAUDE.md). Keep files UTF-8.
- **Only these paths change**: `backend/app/patient_list.py` (new), `backend/app/main.py`, `backend/tests/test_patient_list.py` (new), `frontend/src/pages/patient-list/*` (`PatientListPage.jsx` edited; the rest new), `frontend/src/i18n/translations.js`, `frontend/src/App.routes.test.jsx` and `frontend/src/pages/register-patient/RegisterPatientButton.test.jsx` (placeholder constant only), `docs/GLOSSARY.md`, `docs/DECISIONS.md`, `docs/BACKLOG.md`, `docs/PROJECT_STATUS.md` and this story's `agent-log.csv`. **Do not modify** code of US-01 (`backend/app/patients.py`, `pages/register-patient/*.jsx`) or US-03 (`backend/app/readings_api.py`, `readings.py`, `pages/record-reading/*`, `utils/bandStatus.js`) — import only (constitution v1.3.0, D-51). No migration, no new dependency, no change to `backend/app/models.py`, `auth.py`, `db.py`, `.github/`, `.specify/`.
- Agents log each step from the repo root, **one command at a time, never in parallel**: `/opt/homebrew/bin/pwsh -NoProfile -File scripts/log-agent.ps1 -Agent <agent> -Task <Txxx> -Action <assigned|started|done|failed|finding|verified|rework> -Details "<text>"` (writes `specs/016-patient-list/agent-log.csv`).
- Synthetic data only.

---

## Phase 1: Setup

- [ ] T001 [US-02] Baseline before any change: in `backend/` run `python -m pytest -q`; in `frontend/` run `npm ci`, `npm test` and `npm run build`. Record both passing test counts and that the build succeeds, for the PR description. Do not edit files (qa-tester)

---

## Phase 2: Foundational

None. TS-03 (tables), TS-06 (`get_current_user`, the API client's 401 handling), TS-12 (`Card`, tokens, guard tests), TS-13 (`<RequireAuth>`, `renderApp`, `fakeBackend`), US-01 (`get_session`, `<RegisterPatientButton />`, D-48 tokens) and US-03 (`reading_scores`, `RiskBandBadge`) are merged and reused unchanged.

---

## Phase 3: US-02 Patient list 🎯 MVP

**Goal**: Any signed-in clinician opens `/patients` and sees a table of the active patients ordered by who needs attention first, with triage level, latest NEWS2 score and risk band, and the time of the latest reading; the table refreshes every 15 s.

**Independent Test**: `python -m pytest` and `npm test` pass with the new tests; manually, with the simulator in `--demo`, the list on `/patients` updates within 15 s and the highest-scoring patient is at the top ([quickstart.md](quickstart.md) §2–§3).

### Backend implementation (backend-dev)

- [ ] T002 [US-02] Create `backend/app/patient_list.py` with docstring "Patient list (US-02). See specs/016-patient-list/contracts/patient-list-api.md." (research R1–R4, [contracts/patient-list-api.md](contracts/patient-list-api.md)):
  - Imports only: `get_current_user` from `app.auth`, `get_session` from `app.patients` (do not modify `patients.py`), models `Patient`, `VitalSign`, `ReadingScore`, `User` from `app.models`.
  - `LatestScore(BaseModel)`: `recorded_at: datetime`, `total: int`, `band: str`.
  - `PatientListItem(BaseModel)`: `identifier: str`, `name: str`, `age: int`, `sex: str`, `triage_level: int`, `admitted_at: datetime`, `latest_score: LatestScore | None`. No `id`, `patient_id`, `vital_sign_id`, score id, `status`, `system` or `entries`.
  - `PatientListResponse(BaseModel)`: `patients: list[PatientListItem]`.
  - `list_patients_query()` returning ONE SQLAlchemy `select` (research R2): subquery `ranked` = `select(VitalSign.patient_id, VitalSign.recorded_at, ReadingScore.total, ReadingScore.band, func.row_number().over(partition_by=VitalSign.patient_id, order_by=(VitalSign.recorded_at.desc(), VitalSign.id.desc())).label("rn")).join(ReadingScore, ReadingScore.vital_sign_id == VitalSign.id).subquery()`; outer `select(Patient.identifier, Patient.name, Patient.age, Patient.sex, Patient.triage_level, Patient.admitted_at, ranked.c.recorded_at, ranked.c.total, ranked.c.band).outerjoin(ranked, and_(ranked.c.patient_id == Patient.id, ranked.c.rn == 1)).where(Patient.status == "active").order_by(ranked.c.total.is_(None), ranked.c.total.desc(), Patient.triage_level.asc(), Patient.identifier.asc())`. No NEWS2 thresholds or band logic (Principle V).
  - `router = APIRouter()`; `@router.get("/patients", response_model=PatientListResponse)` handler `list_patients(user: User = Depends(get_current_user), session: Session = Depends(get_session))`: execute the query once; build each item with `latest_score=None` when `total is None`, otherwise `LatestScore(recorded_at, total, band)` exactly as stored; on `SQLAlchemyError` → `session.rollback()`, `logger.warning("Patient list failed (%s)", type(exc).__name__)`, `HTTPException(503, "Service unavailable")`.
  Depends on T001 (AC1–AC5, FR-001–FR-006) (backend-dev)
- [ ] T003 [US-02] Register the router in `backend/app/main.py`: `from app import patient_list` and `app.include_router(patient_list.router, prefix="/api")` next to the other `include_router` lines, before the static-serving block (D-44). Change nothing else. Confirm `POST /api/patients` (US-01) still works (its tests pass). Depends on T002 (FR-001) (backend-dev)

### Frontend implementation (frontend-dev)

- [ ] T004 [P] [US-02] In `frontend/src/i18n/translations.js` add, in both `es` and `en`, exactly the keys and texts of [contracts/ui.md](contracts/ui.md) §Texts: `patientList.colCode`, `.colName`, `.colTriage`, `.colScore`, `.colLatest`, `.noData`, `.empty`, `.loading`, `.loadError`, `.refreshError`, `.lastUpdated` (with `{time}`); remove `patients.placeholder` from both languages; keep every other key. Depends on T001 (AC15, FR-014) (frontend-dev)
- [ ] T005 [P] [US-02] Create `frontend/src/pages/patient-list/formatTime.js` exporting `formatSince(date, now, lang)` (research R7, contracts/ui.md §Time text): returns `"{relative} ({clock})"`; relative via `new Intl.RelativeTimeFormat(lang, { style: 'short', numeric: 'always' })` in seconds when < 60 s, minutes when < 60 min, hours when < 24 h, else days (negative values for the past, rounded down); clock via `Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' })`, adding `day: 'numeric', month: 'short'` when `date` is not on the same local day as `now`. Pure function, no React. Depends on T001 (AC6, AC15) (frontend-dev)
- [ ] T006 [P] [US-02] Create `frontend/src/pages/patient-list/usePatientList.js` (research R6, data-model.md "Page state"): a hook returning `{ patients, lastUpdated, status, refreshFailed }` with `status` `'loading' | 'ok' | 'error'`. On mount request `apiGet('/api/patients')` (existing client; 401 is already handled by it). After every request finishes (success or failure) schedule the next one with `setTimeout(…, 15000)` (export `REFRESH_MS = 15000`); never start a request while one is in flight. Success → `patients = body.patients`, `lastUpdated = new Date()`, `status = 'ok'`, `refreshFailed = false`. Failure with a list → keep `patients`/`lastUpdated`, `refreshFailed = true`; failure without a list → `status = 'error'`. Listen to `document` `visibilitychange`: when `document.hidden`, clear the timer; when visible, request at once (if none in flight) and restart the timer. On unmount clear the timer, remove the listener and ignore late answers. Depends on T001 (AC11–AC13, FR-012, FR-013) (frontend-dev)
- [ ] T007 [US-02] Create `frontend/src/pages/patient-list/PatientTable.jsx` and `PatientTable.module.css` ([contracts/ui.md](contracts/ui.md) §Patient table area, §Table; research R8–R9): uses `usePatientList()` and `useLanguage()` (`{ lang, t }`).
  - States: `loading` → `<p>{t('patientList.loading')}</p>`; `error` → `<p role="alert">{t('patientList.loadError')}</p>`; `ok` with `[]` → `<p>{t('patientList.empty')}</p>`; `ok` with patients → table.
  - Whenever `lastUpdated` is set: `<p>{t('patientList.lastUpdated', { time: formatSince(lastUpdated, new Date(), lang) })}</p>`; when `refreshFailed`: `<p role="alert">{t('patientList.refreshError')}</p>`.
  - Table: wrapper `<div className={styles.scroll}>` (`overflow-x: auto`); `<table aria-label={t('patients.title')}>` with **no `<caption>`** (so the text "Pacientes" appears only once on the page, in the Card heading; `aria-label` is used because the shared `Card` (TS-12) does not expose an `id` for its heading, so `aria-labelledby` cannot reference it, and `Card` is not changed); `<thead>` with five `<th scope="col">` (`colCode`, `colName`, `colTriage`, `colScore`, `colLatest`); one `<tr key={identifier}>` per patient **in the order received** (never re-sort): code cell `<Link to={'/patients/' + p.identifier}>{p.identifier}</Link>` (the only link); name; triage chip `<span className={`${styles.triage} ${styles['triage' + p.triage_level]}`}>{t('triageLevel.' + p.triage_level)}</span>`; score cell `p.latest_score ? <>{p.latest_score.total} <RiskBandBadge band={p.latest_score.band} /></> : t('patientList.noData')`; latest cell `p.latest_score ? formatSince(new Date(p.latest_score.recorded_at), new Date(), lang) : t('patientList.noData')`.
  - Import `RiskBandBadge` from `../record-reading/RiskBandBadge.jsx` (do not move or change it).
  - CSS: tokens only — `.triage1`…`.triage5` with `background: var(--color-triage-N-soft); border: 2px solid var(--color-triage-N); color: var(--color-text)`; spacing/font tokens only; no raw color, no inline style.
  Depends on T004, T005, T006 (AC6–AC10, AC12, AC13, FR-007–FR-011, FR-015) (frontend-dev)
- [ ] T008 [US-02] Edit `frontend/src/pages/patient-list/PatientListPage.jsx`: replace only `<p>{t('patients.placeholder')}</p>` inside the `Card` with `<PatientTable />` (import it); keep the `h1`, the `<RegisterPatientButton />` line, the `Card title={t('patients.title')}` and the whole health `useEffect` and `<section role="status">` exactly as they are; update the header comment ("Patient list (US-02); keeps the TS-04 /health check, once per load"). Depends on T007 (AC6, AC9, AC14, FR-010) (frontend-dev)

### Tests (qa-tester)

- [ ] T009 [P] [US-02] Create `backend/tests/test_patient_list.py` (header cites US-02 AC1–AC5 and [contracts/patient-list-api.md](contracts/patient-list-api.md); synthetic data; no real database, no network). Fixture: in-memory SQLite engine with `StaticPool`, `connect_args={"check_same_thread": False}`, `Base.metadata.create_all`; synthetic doctor and nurse `User`s; override `app.patients.get_session` and `app.auth.get_current_user`; `TestClient(app.main.app)`. Insert readings + scores directly as rows (`VitalSign` + `ReadingScore`) with chosen `recorded_at`, `total`, `band`. Tests, each naming its AC:
  - AC1: doctor and nurse both get 200 `{"patients": [...]}`; a `discharged` patient is absent; each item has exactly the keys `identifier, name, age, sex, triage_level, admitted_at, latest_score`; no `id`/`patient_id`/`vital_sign_id` anywhere in the body.
  - AC2: two readings → `latest_score` is the later `recorded_at` with its stored `total`/`band`; two readings with the same `recorded_at` → the one with the higher id; no readings → `latest_score` is `null`; a stored score that NEWS2 would compute differently is returned as stored. **Times**: compare `recorded_at` and `admitted_at` as values, not strings: parse the response text with `datetime.fromisoformat` and compare with the inserted datetime after normalising both to UTC (treat a naive value as UTC), because SQLite returns times without a time zone while PostgreSQL returns them with one.
  - AC3: ordering with ties: totals 7, 5, 5 (triage 3 and 2), 0, and two patients without readings (triage 1 and 4) → exact expected order of identifiers; equal total and triage → by identifier.
  - AC4: a `before_cursor_execute` listener on the test engine counts statements during the request → exactly 1 with 0, 1 and 10 patients.
  - AC5: no override of `get_current_user` and no token → 401, no `patients` key.
  - FR-006: `DATABASE_URL` unset and `get_session` not overridden → 503 `"Service unavailable"`; a `SQLAlchemyError` from the session → 503.
  - `POST /api/patients` still answers 201 for a nurse (US-01 route not shadowed).
  Depends on T003 (AC1–AC5) (qa-tester)
- [ ] T010 [P] [US-02] Frontend tests (header comments copy the exact Spanish texts from `translations.js`; use `renderApp`, `signInForTest(NURSE | DOCTOR)`, `stubBackend({ patients: (url, options) => … })` answering GET with a list (branch on `options?.method`), `vi.useFakeTimers({ shouldAdvanceTime: true })` where timing matters; no backend, no network):
  - `frontend/src/pages/patient-list/formatTime.test.js`: fixed `now`; 30 s → "hace 30 s (HH:MM)" style exact text in es and "30 sec. ago"-style exact text in en (copy what `Intl` produces in Node); 3 min; 2 h; another day adds the date.
  - `frontend/src/pages/patient-list/PatientTable.test.jsx`:
    - AC6: five column headers in es; rows in the order received (the stub returns a deliberately non-sorted list → the table keeps it); code, name, triage label "Triage II", score number + band badge text; latest time text; placeholder text absent.
    - AC7: the row of a patient with `latest_score: null` shows "Sin datos" twice and no "Desconocida" (check within that row, e.g. `within(row)`). In the same list, one more row with `latest_score: { recorded_at, total: 3, band: "bogus" }` shows its number and the badge's fallback label "Desconocida" (from `RiskBandBadge`, unchanged) and does not show "Sin datos" in its score cell: an unknown band and "no readings" stay distinct (spec edge case).
    - AC8: the code is a link with `href` `/patients/PAT-005`; clicking it → `currentPath()` is `/patients/PAT-005`; the row itself has no click handler/role link.
    - AC9: nurse sees "Registrar paciente" above the table; doctor does not.
    - AC10: `{"patients": []}` → "No hay pacientes activos."
    - AC11: after 15 s a second GET is made and the table shows the new data and a new "Actualizado:" text; no second request while the first is still pending; `document.hidden = true` + `visibilitychange` → no request after 15 s; visible again → a request at once; unmount → no further requests.
    - AC12: a list shown, then the refresh answers 500 / rejects → same rows still shown + "No se pudo actualizar la lista. Se muestra la última versión."; next success removes it.
    - AC13: pending first request → "Cargando pacientes…"; first request 500 → "No se pudo cargar la lista de pacientes. Se intentará de nuevo." and a retry after 15 s.
    - 401 on a refresh → `currentPath()` becomes `/login` (existing session-expiry handling).
    - AC14: the health texts ("API: funcionando", version, database) still appear, and `/health` is called once per page load even after refreshes.
    - AC15: after switching to EN the headers, "No data" and "Updated:" are English, the rows stay, and no extra GET is made by the switch.
  - Update only the `ES_LIST_PLACEHOLDER` constant (and its header comment line) in `frontend/src/App.routes.test.jsx` and `frontend/src/pages/register-patient/RegisterPatientButton.test.jsx` to the Card heading `'Pacientes'`; change no assertion logic (D-51). If any of those tests fails because of the new GET, report it to the orchestrator instead of changing more.
  Then run `npm test` and `npm run build`. Depends on T008 (AC6–AC15) (qa-tester)
- [ ] T011 [US-02] Run the full validation from [quickstart.md](quickstart.md) §1: `python -m pytest` in `backend/`; `npm test`, `npm run build`, `npm audit --audit-level=high` in `frontend/`. Every previously passing test still passes (counts ≥ T001 plus the new tests); `styles/noRawColors.test.js`, `contrast.test.js`, `tokens.test.js` pass; `git diff --stat -- backend/app/models.py backend/app/auth.py backend/app/db.py backend/app/patients.py backend/app/readings_api.py backend/app/readings.py backend/migrations frontend/src/pages/record-reading frontend/src/pages/register-patient/RegisterPatientButton.jsx frontend/src/utils frontend/package.json .github` is empty. Report counts next to the baseline. Depends on T009, T010 (SC-007) (qa-tester)

### Review (security-reviewer)

- [ ] T012 [US-02] Review the story (read-only, change no code). Check: `GET /api/patients` uses `get_current_user` (401 signed out) and returns only active patients; no internal id, `status`, `system` or `entries` leaks; the query is a single statement with no string-built SQL; 503 bodies are fixed and logs carry the error type only; no NEWS2 thresholds outside `app.scoring`; `/patients` stays inside `<RequireAuth>`; the page never renders server text (only fields as text, React-escaped); the refresh cannot overlap or run while hidden; no raw color, no hand-drawn SVG, no new dependency; US-01/US-03 code unchanged. Return findings as a report; the orchestrator logs them (constitution VIII) (security-reviewer)

---

## Phase 4: Polish

- [ ] T013 [P] Edit `docs/DECISIONS.md`: add **D-49** in its numeric place (before D-50; date 2026-11-21; Status "Active") with the text in [plan.md](plan.md) §"D-49": the list contract, one query, server-side order, 15 s chained refresh paused while hidden, and **`monitoring_status` is not used in US-02** (supersedes the PROJECT_STATUS note that US-02 maps risk bands to it). Reasons and rejected options from [research.md](research.md) R2, R6 (N+1 requests, Python sorting, `setInterval`, polling libraries) (FR-017) (orchestrator)
- [ ] T014 [P] Edit `docs/GLOSSARY.md` (D-40): update the **patient list** row (now a table of active patients, ordered by latest NEWS2 score, triage level, code; refreshes every 15 s; source `patientList.*`); add rows **latest score** = `latest_score` (`recorded_at`, `total`, `band`; "Sin datos" / "No data" when null) and **last update** ("Actualizado: …" / "Updated: …"); cite US-02 and D-49 (FR-014) (orchestrator)
- [ ] T015 [P] Edit `docs/BACKLOG.md` and `docs/PROJECT_STATUS.md`: mark US-02 done and link `specs/016-patient-list/spec.md` in the backlog's Spec column; in PROJECT_STATUS update "Last updated", "Current step"/"Next step" (US-04, US-05), mark the US-02 notes done (keep the button; replace the placeholder body; health block kept), note that D-49 supersedes the "US-02 maps bands to `monitoring_status`" note, and add: **US-04 / US-05** may import `formatTime.js` and the D-48 triage chip styles approach; **US-09** sorts/filters on top of `GET /api/patients` (FR-017) (orchestrator)
- [ ] T016 Check `specs/016-patient-list/agent-log.csv`: every task has `assigned`, `started` and `done` rows; log each T012 finding with `-Action finding` on the security-reviewer's behalf. Prepare the PR record: link to `specs/016-patient-list/`, which agent did what, the T001 and T011 test counts, and the security findings with how each was resolved; end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Depends on T011–T015 (orchestrator)

---

## Dependencies & Execution Order

- **Setup**: T001 before any edit.
- **Backend**: T002 → T003.
- **Frontend**: T004, T005, T006 in parallel → T007 → T008. Runs in parallel with the backend track (the page only needs the contract).
- **Tests**: T009 after T003; T010 after T008 (T009 and T010 in parallel). T011 after both.
- **Review**: T012 after T011.
- **Polish**: T013, T014, T015 in parallel after T011; T016 last.
- **Story dependencies**: TS-03, TS-06, TS-12, TS-13, US-01, US-03 (all merged; constitution v1.3.0, D-51). US-01/US-03 code is imported, never modified.

## Parallel Example

```text
# Round 1: T001 (qa-tester baseline)
# Round 2: backend-dev T002 → T003   ||   frontend-dev (T004 + T005 + T006) → T007 → T008
# Round 3: qa-tester T009 (after T003) + T010 (after T008) → T011
# Round 4: T012 (security-reviewer) → T013 + T014 + T015 → T016 (orchestrator)
```

## Implementation Strategy

US-02 is the whole MVP, built so each step stays green:

1. Baseline (T001).
2. Endpoint and router (T002–T003); texts, time helper, refresh hook, table, page body (T004–T008).
3. Tests for AC1–AC15 and full validation (T009–T011).
4. Security review (T012); D-49, glossary, backlog/status and PR record (T013–T016).

After T016, commit (`US-02: Patient list`), push and open the PR. CI runs the backend tests, frontend tests and build, and the dependency check; the PR includes the agent activity log.

## Notes

- The orchestrator assigns each task to its agent and logs `assigned` / `started` / `done` rows (see `docs/agents.md`), one log command at a time.
- Do not add anything not listed here (Principle XII): no filters or sorting controls (US-09), no detail content (US-05), no alerts (US-04), no `monitoring_status`, no migration, no new dependency, no change to US-01/US-03 code.
