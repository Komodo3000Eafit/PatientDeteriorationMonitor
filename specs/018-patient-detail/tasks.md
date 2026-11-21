---

description: "Task list for US-05 patient detail page"
---

# Tasks: Patient Detail Page

**Input**: Design documents from `specs/018-patient-detail/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/patient-detail-api.md](contracts/patient-detail-api.md), [contracts/ui.md](contracts/ui.md), [quickstart.md](quickstart.md)

**Tests**: MANDATORY. This story adds two read-only API endpoints and security controls (constitution Principle VII; spec FR-019): at least one automated test per acceptance criterion AC1–AC12. qa-tester writes and runs the tests after implementation, then security-reviewer reviews.

**Organization**: This feature has one story (US-05), so all story tasks carry the `[US-05]` label.

## Format: `[ID] [P?] [Story] Description (agent)`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks).
- **(agent)**: Owner agent at the end of the line: backend-dev, frontend-dev, qa-tester, security-reviewer, devops or orchestrator.
- All paths are relative to the repository root. Backend commands run from `backend/` (venv active); frontend commands from `frontend/`.
- Edit files with the file tools, not PowerShell (non-ASCII text such as accents, `—`, `º`; CLAUDE.md). Keep files UTF-8.
- **Only these paths change**: `backend/app/patients.py` (EDIT: move `find_patient`/`PATIENT_CODE` in, add two GET endpoints + two response models), `backend/app/readings_api.py` (EDIT: import `find_patient`/`PATIENT_CODE` from `app.patients` instead of defining them), `backend/tests/test_patient_detail.py` (new), `backend/tests/test_readings_api.py` (EDIT only if the moved import needs it), `frontend/src/pages/patient-detail/PatientDetailPage.jsx` (EDIT: replace body), `frontend/src/pages/patient-detail/PatientDetailPage.module.css` (new), `frontend/src/pages/patient-detail/PatientDetailPage.test.jsx` (new), `frontend/src/i18n/translations.js` (EDIT: `patientDetail.*` keys), `frontend/src/testing/fakeBackend.js` (EDIT: optional `patient` + `triageEvents` handlers), `docs/GLOSSARY.md`, `docs/DECISIONS.md`, `docs/BACKLOG.md`, `docs/PROJECT_STATUS.md` and this story's `agent-log.csv`. **Not changed**: `frontend/src/App.jsx` (route `/patients/:identifier` already registered by TS-13), `frontend/src/components/*` (reused: `TriageLevelBadge`, `Card`, `Button`), `frontend/src/pages/record-reading/*` (reused: `ReadingResult`, `RiskBandBadge`, `formatReason`), `frontend/src/utils/*`, `frontend/src/styles/tokens.css`, `backend/app/scoring/*`, `backend/app/models.py`, `backend/app/readings.py`, `backend/migrations/*` (no migration), `.github/`, `.specify/`, `frontend/package.json`, `frontend/package-lock.json`, `backend/requirements.txt`.
- Agents log each step with `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/log-agent.ps1 -Agent <agent> -Task <Txxx> -Action <action> -Details "<text>"`. Action is one of `assigned`, `started`, `done`, `failed`, `finding`, `verified`, `rework`; the script writes to `specs/018-patient-detail/agent-log.csv` (story taken from the branch name).
- Synthetic data only: fictitious patients, synthetic users, made-up vital signs; no real data.

---

## Phase 1: Setup

- [X] T001 [US-05] Baseline before any change: in `backend/` run `python -m pytest -q`; in `frontend/` run `npm ci`, `npm test` and `npm run build`. Record both passing test counts and that the build succeeds, for the PR description. Do not edit files (qa-tester)

---

## Phase 2: Foundational

None. TS-03 (tables `patients`, `vital_signs`, `reading_scores`, `triage_events`; no migration here), TS-06 (`get_current_user`, the no-echo error handling in `main.py`, the client's 401 session-expiry handling), TS-12 (`TriageLevelBadge`, `Card`, `Button`, tokens, guard tests), TS-13 (`<RequireAuth>`, the registered route `/patients/:identifier`, `renderApp`, `stubBackend`, `isPatientCode`, `NotFoundPage`) and US-03 (`GET /api/patients/{identifier}/readings`, `ReadingResult`, `RiskBandBadge`, `formatReason`, `find_patient`/`PATIENT_CODE` in `readings_api.py`) are merged and reused. This story adds no table and no migration (research R8).

---

## Phase 3: US-05 Patient detail page 🎯 MVP

**Goal**: A signed-in clinician opens `/patients/:identifier` and sees three read-only blocks — the patient's data, the current reading with its stored NEWS2 score, risk band and reason per point, and the triage history newest-first — backed by two new read-only GET endpoints; no `monitoring_status` is introduced and NEWS2 is never recomputed.

**Independent Test**: `python -m pytest` and `npm test` pass with the new tests; `GET /api/patients/PAT-007` returns the patient data with `last_reading_at` and no `monitoring_status`/`id`; `GET /api/patients/PAT-007/triage-events` returns the events newest-first with no `id`/`patient_id`; the demo doctor opens the page and sees the three blocks, a patient with no reading shows "no readings yet", an unknown code shows "patient not found", and ES/EN both render ([quickstart.md](quickstart.md) §2–§4).

### Backend implementation (backend-dev)

- [X] T002 [US-05] In `backend/app/patients.py` move the patient-code lookup so both routers share it (research R2): add the module-level `PATIENT_CODE = re.compile(r"^[A-Z0-9-]{1,20}$")` (import `re`) and `find_patient(session: Session, identifier: str) -> Patient` (raises `HTTPException(404, "Patient not found")` when the code does not match `PATIENT_CODE` — no query — or when no patient has that `identifier`; otherwise returns the `Patient`). Keep the existing docstring style. Change nothing else in this task. Depends on T001 (AC6, AC8, AC9, FR-004) (backend-dev)
- [X] T003 [US-05] In `backend/app/readings_api.py` remove the local `PATIENT_CODE` and `find_patient` definitions and instead import them: `from app.patients import PATIENT_CODE, find_patient, get_session` (merge with the existing `get_session` import). No behavior change; `readings_api` already imports from `app.patients`, so there is no import cycle. Depends on T002 (research R2) (backend-dev)
- [X] T004 [US-05] In `backend/app/patients.py` add the detail response models after `PatientResponse` (data-model.md; contracts/patient-detail-api.md):
  - `PatientDetailResponse(BaseModel)`: `identifier: str`, `name: str`, `age: int`, `sex: str`, `triage_level: int`, `status: str`, `admitted_at: datetime`, `last_reading_at: datetime | None`. Docstring: "Patient data plus the time of the most recent reading; no internal id, no monitoring_status." **No `id`, no `monitoring_status` field.**
  - `TriageEventResponse(BaseModel)`: `occurred_at: datetime`, `previous_level: int | None`, `new_level: int`, `score: int | None`, `reason: str`, `source: str`. **No `id`, `patient_id`, `created_by_id`.**
  - `TriageEventListResponse(BaseModel)`: `triage_events: list[TriageEventResponse]`.
  Depends on T002 (AC8, AC9, FR-001, FR-002) (backend-dev)
- [X] T005 [US-05] In `backend/app/patients.py` add `@router.get("/patients/{identifier}", response_model=PatientDetailResponse)` `def get_patient(identifier, user: User = Depends(get_current_user), session: Session = Depends(get_session))` (contracts/patient-detail-api.md): wrap the body in `try/except SQLAlchemyError` → `session.rollback()`, `logger.warning("Patient detail failed (%s)", type(exc).__name__)`, `raise HTTPException(503, "Service unavailable")`; inside, `patient = find_patient(session, identifier)`, compute `last_reading_at = session.scalars(select(VitalSign.recorded_at).where(VitalSign.patient_id == patient.id).order_by(VitalSign.recorded_at.desc(), VitalSign.id.desc()).limit(1)).first()` (import `VitalSign` from `app.models`), then return `PatientDetailResponse(identifier=patient.identifier, name=patient.name, age=patient.age, sex=patient.sex, triage_level=patient.triage_level, status=patient.status, admitted_at=patient.admitted_at, last_reading_at=last_reading_at)`. Any role may read (only `get_current_user`, no nurse check). Depends on T004 (AC8, FR-001, FR-003, FR-004) (backend-dev)
- [X] T006 [US-05] In `backend/app/patients.py` add `@router.get("/patients/{identifier}/triage-events", response_model=TriageEventListResponse)` `def list_triage_events(identifier, user: User = Depends(get_current_user), session: Session = Depends(get_session))` (contracts/patient-detail-api.md): same `try/except SQLAlchemyError` → 503 wrapper (log `"Triage events failed (%s)"`); inside, `patient = find_patient(session, identifier)`, then `rows = session.scalars(select(TriageEvent).where(TriageEvent.patient_id == patient.id).order_by(TriageEvent.occurred_at.desc(), TriageEvent.id.desc())).all()` and return `TriageEventListResponse(triage_events=[TriageEventResponse(occurred_at=e.occurred_at, previous_level=e.previous_level, new_level=e.new_level, score=e.score, reason=e.reason, source=e.source) for e in rows])`. Any role may read. Depends on T004 (AC3, AC9, FR-002, FR-003, FR-004) (backend-dev)

### Frontend implementation (frontend-dev)

- [X] T007 [P] [US-05] In `frontend/src/i18n/translations.js` add the `patientDetail.*` keys to both `es` and `en` and remove the now-unused `patientDetail.placeholder` in both (contracts/ui.md "i18n keys"): `loading`, `notFoundTitle`, `notFoundBody`, `loadErrorTitle`, `loadErrorBody`, `retry`, `noReadingsTitle`, `noReadingsBody`, `noPreviousLevel`, `noScore`, `sex.female`/`sex.male`/`sex.other`, `status.active`/`status.discharged`, `source.initial`/`source.automatic`/`source.manual`, `col.occurredAt`/`col.previousLevel`/`col.newLevel`/`col.score`/`col.reason`/`col.source`, `section.patient`/`section.reading`/`section.history`. Spanish is the default; use glossary terms (Triage I–V and risk-band keys already exist). Keep `patientDetail.title` (`Paciente {code}` / `Patient {code}`). Depends on T001 (AC11, FR-017) (frontend-dev)
- [X] T008 [US-05] Replace the body of `frontend/src/pages/patient-detail/PatientDetailPage.jsx` (contracts/ui.md; research R4). Keep `const { identifier } = useParams()`; if `!isPatientCode(identifier)` return `<NotFoundPage />` with no backend call. Otherwise, in a `useEffect` keyed on `identifier`, run three `apiGet` calls through `../../api/client.js`: `GET /api/patients/${identifier}`, `GET /api/patients/${identifier}/readings?limit=1` (current reading = `readings[0]`), `GET /api/patients/${identifier}/triage-events`. Track `loading`; on the patient call's `ApiError` with `status === 404` show the not-found state; on any `ApiError` 503 / thrown network error / timeout show the load-error state with a retry `Button` that re-runs the load; let a 401 fall through to the existing `onUnauthorized` handler (do not catch it specially). Render: `<h1>{t('patientDetail.title', { code: identifier })}</h1>`, the mounted `<RecordReadingButton identifier={identifier} />` line (kept), then the three blocks below. Import `apiGet`, `ApiError`, `useParams`, `Link`, `useLanguage`, `isPatientCode`, `NotFoundPage`, `RecordReadingButton`, `Card`, `Button`, `TriageLevelBadge`, `ReadingResult`. Styling from `PatientDetailPage.module.css` (tokens only); any icon from `lucide-react`, decorative. Depends on T005, T006, T007 (AC1, AC2, AC4, AC5, AC6, AC10, AC12, FR-007–FR-015) (frontend-dev)
  - **Block 1 (patient data, `Card`)**: `name`, `age`, `sex` via `t('patientDetail.sex.' + patient.sex)`, `admitted_at` via `new Date(patient.admitted_at).toLocaleString(lang)`, `<TriageLevelBadge level={patient.triage_level} />`, status via `t('patientDetail.status.' + patient.status)`. No `StatusBadge`, no monitoring-status traffic light.
  - **Block 2 (current reading)**: when `readings[0]` exists render `<ReadingResult reading={readings[0]} />` (reused; shows `recorded_at`, NEWS2 score, risk band via `RiskBandBadge`, reason per point). When absent render the "no readings yet" state (`patientDetail.noReadingsTitle` + `noReadingsBody`); no band, no fabricated time.
  - **Block 3 (triage history, `Card`)**: render `triage_events` in order as received (the endpoint is newest-first). Per entry: `occurred_at` (`toLocaleString(lang)`), previous level (`<TriageLevelBadge>` when `previous_level != null`, else `t('patientDetail.noPreviousLevel')`), new level (`<TriageLevelBadge>`), score (the number, or `t('patientDetail.noScore')` when `null`), `reason` (shown as returned), source via `t('patientDetail.source.' + e.source)`. Column headers from `patientDetail.col.*`. Use a `key` such as `e.occurred_at + '-' + i`.
- [X] T009 [P] [US-05] Create `frontend/src/pages/patient-detail/PatientDetailPage.module.css` with layout for the three blocks, tokens only (no raw colors); reuse spacing/radius/type tokens from `tokens.css`. Depends on T001 (FR-016) (frontend-dev)
- [X] T010 [US-05] In `frontend/src/testing/fakeBackend.js` extend `stubBackend({ ... })` with two optional handlers, additively (research R7): `patient` routed by the exact path `/api/patients/<code>` (regex `^/api/patients/[^/]+$`) and `triageEvents` routed by `^/api/patients/[^/]+/triage-events$`. Order the matching so `/triage-events` and `/readings` are tested before the bare `/api/patients/<code>`, and the existing exact routes (`/api/patients`, `/health`, `/api/me`, `/api/auth/login`) and the `readings` handler keep working; when a handler is not provided its path answers 404 as today. Update the header comment to mention the new optional handlers. Depends on T001 (test infrastructure for T012) (frontend-dev)

### Tests (qa-tester)

- [X] T011 [US-05] Create `backend/tests/test_patient_detail.py` (contracts/patient-detail-api.md; quickstart.md §4), using the in-memory SQLite + `StaticPool` + `dependency_overrides` pattern from `test_readings_api.py` (override `app.patients.get_session` and `app.auth.get_current_user`; seed patients, a reading with its stored `ReadingScore`, and triage events). At least one test per criterion:
  - `GET /api/patients/{code}`: 200 shape with `last_reading_at` set when a reading exists and `null` when none (AC8); **no `monitoring_status` key and no `id` key** in the body (AC8, FR-001); unknown code → 404 `Patient not found`; malformed code (e.g. `bad code`, lowercase, `>20` chars) → 404; no token (real `get_current_user`, not overridden) → 401 (AC7); `get_session` not overridden with `DATABASE_URL` unset → 503 `Service unavailable` (AC8, FR-004).
  - `GET /api/patients/{code}/triage-events`: 200 newest-first by `occurred_at` then `id` (AC3, AC9); each item has only `occurred_at, previous_level, new_level, score, reason, source` — **no `id`/`patient_id`/`created_by_id`** (AC9, FR-002); `previous_level` and `score` may be `null` (initial event); unknown/malformed code → 404; no token → 401; database unavailable → 503.
  - No error body or log contains a submitted value (FR-004).
  Depends on T005, T006. Run `python -m pytest` and record the new total (qa-tester)
- [X] T012 [US-05] Create `frontend/src/pages/patient-detail/PatientDetailPage.test.jsx` (contracts/ui.md; quickstart.md §3) using `renderApp` + `stubBackend` with the new `patient` / `triageEvents` handlers and the existing `readings` handler. At least one test per criterion:
  - With data: the three blocks render; the patient block shows name/age/sex/status, a `TriageLevelBadge` and `admitted_at`, and **no** `StatusBadge`; the reading block shows the NEWS2 score, the risk band (via `RiskBandBadge`) and a reason row; the triage history is newest-first; the nurse-only `RecordReadingButton` shows for a nurse and not a doctor (AC1, AC2, AC3, AC4, AC10, AC12).
  - No readings (`readings` handler returns `{ readings: [] }`): the "no readings yet" state shows, no band, no fabricated time; the patient block and triage history still render (AC5).
  - Invalid code (`/patients/not-a-code`): the not-found page shows and no fetch to `/api/patients/...` is made (AC6).
  - Unknown code (`patient` handler returns 404): the "patient not found" state with a back link (AC6).
  - Load error (`patient` handler returns 503 or the fetch rejects): the "could not load" state with a retry button; retry re-requests (AC6/FR-014).
  - Language: every label, section heading, source label and message renders in ES (default) and after switching to EN; the loaded data is not lost (AC11).
  Depends on T008, T009, T010. Run `npm test` and `npm run build` and record the new totals (qa-tester)

### Docs (orchestrator / backend-dev)

- [X] T013 [P] [US-05] Update docs in the same PR: `docs/DECISIONS.md` add **D-51** (plan.md "Planned decision D-51": two read endpoints `GET /api/patients/{identifier}` and `/triage-events`; US-05 shows the stored risk band and introduces no `monitoring_status`; `find_patient` shared from `app.patients`); `docs/GLOSSARY.md` add the patient-detail UI texts and the triage-event source labels (initial / automatic / manual); `docs/BACKLOG.md` set US-05 to ✅ with the spec link; `docs/PROJECT_STATUS.md` mark US-05 done under Step 12. Depends on T001 (FR-017, FR-020) (orchestrator)

### Review (security-reviewer)

- [X] T014 [US-05] Read-only security review (no code changes; report findings and how they were resolved). Verify: both new endpoints require `Depends(get_current_user)` and return 401 without a valid token; the patient code is validated by the shared `find_patient`/`PATIENT_CODE` before any query (404 for malformed/unknown, no echo); error bodies and logs reveal no submitted value or internal detail (503 fixed message, logged by type only); responses omit `id`/`patient_id`/`created_by_id` and any `monitoring_status`; the endpoints are safe GETs that mutate nothing; the page stays inside `<RequireAuth>` (TS-13) and relies on the existing 401 session-expiry handling; no NEWS2 recomputation and no triage-level change. Confirm `backend/app/scoring/*`, `models.py`, `migrations/*`, `App.jsx`, `tokens.css`, US-02's `PatientListPage` and US-04 code are unchanged. Depends on T011, T012 (AC6, AC7, AC8, AC9, FR-003, FR-004, FR-018; Principles V, VI, VIII) (security-reviewer)

**Checkpoint**: US-05 is fully functional and independently testable; both suites green; security review clean.

---

## Dependencies & Execution Order

- **Phase 1 (Setup)**: T001 first; no file edits.
- **Phase 2 (Foundational)**: none.
- **Phase 3 (US-05)**:
  - Backend: T002 → T003 (import swap) and T002 → T004 → {T005, T006}. T005 and T006 are in the same file (`patients.py`) so they are **not** parallel with each other, but they are independent of the frontend tasks.
  - Frontend: T007 [P] and T009 [P] and T010 can start after T001 (different files). T008 depends on T005, T006 (endpoints), T007 (texts). T012 depends on T008, T009, T010.
  - T011 depends on T005, T006. T013 [P] can be done any time after T001.
  - T014 (review) is last, after T011 and T012.

## Parallel Opportunities

- **Across slices after T001**: the backend chain (T002→T004→T005/T006) and the independent frontend files (T007, T009, T010) and the docs (T013) can proceed in parallel.
- **Marked [P]**: T007, T009, T013 (different files, no dependency on incomplete tasks).
- T005 and T006 edit the same file (`patients.py`) → run sequentially.
- T011 (backend tests) and T012 (frontend tests) are different suites → parallel once their targets exist.

## Parallel Example

```bash
# After T001, in parallel:
Task T002/T004/T005/T006: backend endpoints in backend/app/patients.py  (backend-dev)
Task T007: patientDetail.* translations in frontend/src/i18n/translations.js  (frontend-dev)
Task T009: PatientDetailPage.module.css  (frontend-dev)
Task T013: docs (D-51, glossary, backlog, status)  (orchestrator)
```

## Implementation Strategy

Single story (US-05) = the MVP. Finish T001, then the backend endpoints (T002–T006) and the
frontend page (T007–T010) in parallel, then the tests (T011, T012) and docs (T013), then the
security review (T014). Validate against [quickstart.md](quickstart.md) and open the PR with both
suites green and the agent activity log.

## Notes

- One story per feature: every task carries `[US-05]`.
- No new table, no migration, no new dependency (research R8).
- `StatusBadge` is deliberately not used (reserved for the future monitoring-status traffic light,
  US-04 / a technical story). The risk band is shown by the existing `RiskBandBadge` via
  `ReadingResult`.
- `backend/app/patients.py` is edited by this story (it owns `/api/patients...`); US-02's
  `PatientListPage` and US-04 code are not touched (constitution Principle III).
- Keep files UTF-8; edit with the file tools, not PowerShell.
