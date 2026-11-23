---
description: "Task list for US-08 deterioration prediction"
---

# Tasks: Deterioration Prediction

**Input**: Design documents from `specs/024-deterioration-prediction/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/prediction-api.md](contracts/prediction-api.md), [contracts/ui.md](contracts/ui.md), [quickstart.md](quickstart.md)

**Tests**: MANDATORY and **written before the code they cover** (user request; constitution Principle VII; spec FR-014). The rule, the endpoint and the component each get a failing test task first, then the implementation task that makes it pass. At least one test per acceptance criterion AC1–AC13.

**Organization**: This feature has one story (US-08), so all story tasks carry the `[US-08]` label. One task per file.

## Format: `[ID] [P?] [Story] Description (agent)`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks).
- **(agent)**: Owner agent at the end of the line: backend-dev, frontend-dev, qa-tester, security-reviewer, devops or orchestrator.
- All paths are relative to the repository root. Backend commands run from `backend/` (venv active); frontend commands from `frontend/`.
- Edit files with the file tools, not PowerShell (non-ASCII text such as accents and `→`; CLAUDE.md). Keep files UTF-8.
- **Only these paths change**: `backend/app/prediction.py` (new), `backend/app/prediction_api.py` (new), `backend/app/main.py` (one `include_router` line and its import), `backend/tests/test_prediction.py` (new), `backend/tests/test_prediction_api.py` (new), `frontend/src/pages/patient-detail/DeteriorationPrediction.jsx` (new), `frontend/src/pages/patient-detail/DeteriorationPrediction.module.css` (new), `frontend/src/pages/patient-detail/DeteriorationPrediction.test.jsx` (new), `frontend/src/pages/patient-detail/PatientDetailPage.jsx` (one mount line and its import), `frontend/src/testing/fakeBackend.js` (optional `prediction` handler), `frontend/src/i18n/translations.js`, `docs/DECISIONS.md`, `docs/GLOSSARY.md`, `docs/BACKLOG.md`, `docs/PROJECT_STATUS.md` and this story's `agent-log.csv`.
- **Not changed** (Principle III, FR-008, FR-009): `backend/app/models.py`, `backend/migrations/*` (no migration), `backend/app/readings.py`, `backend/app/readings_api.py` (US-03), `backend/app/retriage.py`, `backend/app/retriage_api.py` (US-04), `backend/app/patients.py` (only `find_patient` and `get_session` imported), `backend/app/scoring/*`, `backend/app/simulator.py`, `frontend/src/pages/patient-detail/RetriageSuggestion.jsx`, `frontend/src/pages/record-reading/*` (`RiskBandBadge` imported, `RecordReadingButton` untouched), `frontend/src/components/*`, `frontend/src/styles/tokens.css` (no new token), `frontend/package.json`, `frontend/package-lock.json`, `backend/requirements.txt` (no new dependency), `.github/`, `.specify/`.
- **No "news2" text** (any case, including comments and docstrings) in `backend/app/prediction.py` or `backend/app/prediction_api.py`: `backend/tests/test_scoring_interface.py::test_news2_confined` scans file text.
- Agents log each step with `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/log-agent.ps1 -Agent <agent> -Task <Txxx> -Action <action> -Details "<text>"`. Action is one of `assigned`, `started`, `done`, `failed`, `finding`, `verified`, `rework`; the script writes to `specs/024-deterioration-prediction/agent-log.csv` (story taken from the branch name).
- Synthetic data only: fictitious patients, synthetic users, made-up vital signs; no real data.

---

## Phase 1: Setup

- [X] T001 [US-08] Baseline before any change: in `backend/` run `python -m pytest -q`; in `frontend/` run `npm ci`, `npm test` and `npm run build`. Record both passing test counts and that the build succeeds, for the PR description. Do not edit files (qa-tester)

---

## Phase 2: Foundational

None. US-03 (`vital_signs`, `reading_scores` with `total` and `band`, `RiskBandBadge`), TS-06 (`get_current_user`, the client's 401 session-expiry handling), TS-12 (`Card`, tokens, raw-color and contrast guard tests), TS-13 (`<RequireAuth>`, `renderApp`, `stubBackend`), TS-14 (`lucide-react`) and US-05 (`PatientDetailPage.jsx`) are merged and reused. **No migration**, **no new dependency**.

---

## Phase 3: US-08 Deterioration prediction 🎯 MVP

**Goal**: a signed-in clinician opening a patient's detail page sees a deterioration prediction warning, with the three scores and the newest risk band, when the stored scores of the 3 most recent readings are strictly increasing (t1 < t2 < t3). Nothing is stored and the triage level never changes.

**Independent test**: `pytest tests/test_prediction.py tests/test_prediction_api.py tests/test_scoring_interface.py` and `npx vitest run src/pages/patient-detail` pass; the manual check in [quickstart.md](quickstart.md) shows the warning after three rising readings and no change to the triage level or to the re-triage suggestion section.

### Rule (pure function, no database)

- [X] T002 [P] [US-08] Write failing unit tests in `backend/tests/test_prediction.py` (no database fixture, no app client) for `is_rising(totals)` and `predict(totals)` from `app.prediction` per [data-model.md](data-model.md): `[2, 4, 6]` → `(True, None)`; `[2, 2, 5]` equal step → `(False, "not_rising")`; `[6, 4, 2]` falling → `not_rising`; `[5, 4, 6]` mixed → `not_rising`; `[3, 3, 3]` flat → `not_rising`; `[]`, `[4]`, `[2, 4]` → `(False, "not_enough_readings")`; `[2, None, 5]` → `(False, "missing_score")`; precedence `[None, 4]` → `not_enough_readings`; `is_rising` is False for any list whose length is not 3. Include a test that `app/prediction.py` imports nothing from `sqlalchemy`, `fastapi` or `app.scoring` (read the module source). Covers AC1–AC4, FR-002, FR-004. Run them and confirm they fail because the module does not exist (qa-tester)
- [X] T003 [US-08] Create `backend/app/prediction.py` (depends on T002): module docstring citing US-08, spec 024 and D-55; `REASONS = ("not_enough_readings", "missing_score", "not_rising")`; `is_rising(totals: list[int]) -> bool` returning `len(totals) == 3 and totals[0] < totals[1] < totals[2]`; `predict(totals: list[int | None]) -> tuple[bool, str | None]` with the precedence: fewer than 3 → `(False, "not_enough_readings")`; any `None` → `(False, "missing_score")`; `is_rising` → `(True, None)`; else `(False, "not_rising")`. Pure: standard library only, no band or patient status input (Clarifications 2026-11-23), no "news2" text. Make T002 pass (backend-dev)

### Endpoint

- [X] T004 [P] [US-08] Write failing API tests in `backend/tests/test_prediction_api.py` for `GET /api/patients/{identifier}/prediction` per [contracts/prediction-api.md](contracts/prediction-api.md), **copying** (not importing) the fixture pattern of `backend/tests/test_retriage_api.py` into this file: `engine`, `users`, `db`, `sign_in`, `as_doctor`, `as_nurse` (`conftest.py` only provides `isolate_database`). Seed data **directly**, like `seed_scored_reading` there: insert a synthetic patient, then `vital_signs` rows with a chosen `recorded_at` and, for each, a `reading_scores` row with a chosen `total` and `band`; a `missing_score` reading is a `vital_signs` row with **no** `reading_scores` row. Do **not** use `record_reading` in these tests. Cases: 401 without token (AC7); 200 for both doctor and nurse (AC7); 404 `"Patient not found"` for an unknown code and for a malformed code such as `abc` (AC8); 200 rising for scores 2 → 4 → 6, with `readings` oldest first, each `{total, recorded_at}`, and `latest_band` equal to the newest stored band (AC1); 200 `not_rising` for a flat or falling sequence (AC2); 200 `not_enough_readings` with 0 readings (`readings: []`, `latest_band: null`) and with 2 readings (AC3); with 5 readings only the 3 most recent count (AC4); two readings with the same `recorded_at` are ordered by id desc (AC4); a `vital_signs` row seeded with no `reading_scores` row among the 3 most recent gives `missing_score` with `total: null` for that reading (edge case); rising with the newest band `high` still gives `rising: true` (Clarifications); a discharged patient gets the same answer as when active (Clarifications); the response keys are exactly `{"rising", "reason", "readings", "latest_band"}`, each reading's keys exactly `{"total", "recorded_at"}`, and no `id`, `patient_id` or vital-sign field appears (FR-006); after several calls the counts of `alerts`, `triage_events`, `vital_signs` and `reading_scores` and the patient's `triage_level` are unchanged (AC6, FR-008); a forced `SQLAlchemyError` gives 503 `"Service unavailable"` and the log line holds only the error type name (AC8). Run them and confirm they fail (qa-tester)
- [X] T005 [US-08] Create `backend/app/prediction_api.py` (depends on T003, T004): module docstring citing US-08 and `specs/024-deterioration-prediction/contracts/prediction-api.md`; Pydantic models `PredictionReading(total: int | None, recorded_at: datetime)` and `PredictionResponse(rising: bool, reason: str | None, readings: list[PredictionReading], latest_band: str | None)`; `router = APIRouter()` with `@router.get("/patients/{identifier}/prediction", response_model=PredictionResponse)` taking `identifier`, `user = Depends(get_current_user)` (from `app.auth`) and `session = Depends(get_session)` (from `app.patients`). Inside `try`: `patient = find_patient(session, identifier)` (from `app.patients`); one query selecting `VitalSign.recorded_at, ReadingScore.total, ReadingScore.band` from `VitalSign` **LEFT OUTER JOIN** `ReadingScore` on `ReadingScore.vital_sign_id == VitalSign.id`, `where VitalSign.patient_id == patient.id`, `order_by(VitalSign.recorded_at.desc(), VitalSign.id.desc())`, `limit(3)` (research R3); reverse to oldest first; `rising, reason = predict([r.total for r in rows])`; `latest_band` = band of the newest row or `None`. `except SQLAlchemyError as exc`: `session.rollback()`, `logger.warning("Prediction read failed (%s)", type(exc).__name__)`, `raise HTTPException(503, "Service unavailable")`. Read only: no `add`, `commit` or `flush`; no status check; no "news2" text. Make T004 pass (backend-dev)
- [X] T006 [US-08] Register the router in `backend/app/main.py` (depends on T005): add `from app import prediction_api` next to the other `from app import ...` lines and one line `app.include_router(prediction_api.router, prefix="/api")` after the `retriage_api` line. No other change. Re-run T004 tests and `tests/test_scoring_interface.py` (backend-dev)

### Component

- [X] T007 [P] [US-08] Add an optional `prediction` handler to `stubBackend` in `frontend/src/testing/fakeBackend.js`, following the `suggestions` pattern: a `PREDICTION_PATH = /^\/api\/patients\/[^/]+\/prediction$/` regex and, when no handler is given, the path answers 404 as before (so existing page tests keep their behavior). Add a comment line like the other optional handlers (frontend-dev)
- [X] T008 [P] [US-08] Write failing component tests in `frontend/src/pages/patient-detail/DeteriorationPrediction.test.jsx` (depends on T007) per [contracts/ui.md](contracts/ui.md), rendering `<DeteriorationPrediction identifier="PAT-001" />` signed in, with `stubBackend({ prediction })`: rising answer shows the title "Predicción de deterioro", the scores 2, 4, 6 in that order and the `RiskBandBadge` label for `medium`, plus an icon with `aria-hidden` (AC9); `not_rising` and `missing_score` show "Sin predicción de deterioro." and no warning title (AC10); `not_enough_readings` shows the "at least 3 readings" note (AC10); while the request is pending nothing is rendered: no title, score, band or note (AC11); a 503, a network failure and a timeout show the fixed load-error text and never the server text (AC11); a **404 renders nothing** (no note, no error line), and a 401 shows nothing from the component (the client's session-expiry handling applies) (AC11, contracts/ui.md); after switching to English the rising card shows "Deterioration prediction" and the same scores without a new request (AC12); the request goes to `/api/patients/PAT-001/prediction` (use `callsTo`). Add **one page-level test** in the same file: render the app at `/patients/PAT-001` with `renderApp` (patient, readings and triage-events handlers as in `PatientDetailPage.test.jsx`) and the `prediction` handler answering 503; assert the patient data (name) and the record-reading button still render and the prediction load-error text is shown (AC11; this test passes only after T012 mounts the component). Run them and confirm they fail (qa-tester)
- [X] T009 [P] [US-08] Add the `prediction.*` keys to both languages in `frontend/src/i18n/translations.js` (es default, en) with the texts in [contracts/ui.md](contracts/ui.md): `prediction.title`, `prediction.rising`, `prediction.scores`, `prediction.latestBand`, `prediction.none`, `prediction.notEnough`, `prediction.loadError`. Use the glossary term "predicción de deterioro" / "deterioration prediction"; never "tendencia de empeoramiento" / "worsening trend". `translations.test.js` (same keys in both languages) must pass (frontend-dev)
- [X] T010 [P] [US-08] Create `frontend/src/pages/patient-detail/DeteriorationPrediction.module.css`: a `.card` modifier with `background: var(--color-warning-soft)` and a left border `var(--color-warning)`, `.icon` tinted `var(--color-warning)`, text `var(--color-text)`, `.scores` and `.note` spacing with existing spacing tokens. Tokens only, no raw colors, no new token; the raw-color and contrast guard tests must pass (AC13, FR-013) (frontend-dev)
- [X] T011 [US-08] Create `frontend/src/pages/patient-detail/DeteriorationPrediction.jsx` (depends on T008, T009, T010): header comment citing US-08 and `contracts/ui.md`; props `{ identifier }`; `apiGet(\`/api/patients/${identifier}/prediction\`)` from `../../api/client.js` in a `useEffect` on `identifier` with an `ignore` flag; state `data` (null until success) and `errorKey`. A 401 `ApiError` is re-thrown and the fired promise is caught (pattern of `PatientDetailPage.jsx`), so the component stays silent; a 404 `ApiError` sets no state, so the component renders nothing (the page shows its own not-found card); any other failure (5xx, network error, timeout) sets `errorKey = "prediction.loadError"`. Render: nothing while `data` and `errorKey` are null; `errorKey` → `<p>` with `t(errorKey)`; `data.rising` → `Card` (from `../../components/Card.jsx`) with `TrendingUpIcon` from `lucide-react` (`aria-hidden="true"`), `t("prediction.title")`, `t("prediction.rising")`, the `readings` totals in order joined with " → " under `t("prediction.scores")`, and `<RiskBandBadge band={data.latest_band} />` (from `../record-reading/RiskBandBadge.jsx`) under `t("prediction.latestBand")`; `reason === "not_enough_readings"` → note `t("prediction.notEnough")`; otherwise → note `t("prediction.none")`. Never compute a score, band or prediction. Make T008 pass (frontend-dev)
- [X] T012 [US-08] Mount the component in `frontend/src/pages/patient-detail/PatientDetailPage.jsx` (depends on T011): add `import DeteriorationPrediction from "./DeteriorationPrediction.jsx";` and one line `<DeteriorationPrediction identifier={identifier} />` directly after the US-04 retriage `</section>`. Do not change `RecordReadingButton`, the retriage section or anything else. `PatientDetailPage.test.jsx` and `RetriageSuggestion.test.jsx` must still pass (frontend-dev)

### Verification

- [X] T013 [US-08] Run the full suites (depends on T006, T012): in `backend/` `python -m pytest -q`; in `frontend/` `npm test`, `npm run build` and `npm audit --audit-level=high`. Compare counts with T001 (only additions, no failures). Confirm `git diff --stat main` touches only the paths listed above and that `test_news2_confined`, `translations.test.js` and the raw-color and contrast guards pass. Map each AC1–AC13 to at least one test in the agent log (qa-tester)
- [X] T014 [US-08] Security review of `backend/app/prediction_api.py`, `backend/app/prediction.py` and `frontend/src/pages/patient-detail/DeteriorationPrediction.jsx` (depends on T013): auth required on the endpoint, patient code validated through `find_patient`, no write path, fixed safe error messages, no internal ids or vital values in the response, 503 logged by error type only, no raw server text in the UI. Report findings in the agent log; do not change code (security-reviewer)

---

## Phase 4: Polish & Cross-Cutting

- [X] T015 [P] Add **D-55** to `docs/DECISIONS.md` (dated 2026-11-23): the deterioration prediction is computed on read by `GET /api/patients/{identifier}/prediction`; rule = stored scores of the 3 most recent readings strictly increasing (t1 < t2 < t3), independent of the risk band, same answer for discharged patients; no alert row (US-04 lists every alert row), no migration, no hook in `record_reading`, never changes the triage level or creates a triage event (D-41). Note that D-53 is claimed by open branches 022 and 026 and D-54 is kept free for that renumbering (orchestrator)
- [X] T016 [P] Update `docs/GLOSSARY.md`: the "deterioration prediction" row states the rule (strictly increasing, 3 most recent readings, stored scores, computed on read, no alert) with sources `prediction.py`, `prediction_api.py`, US-08, D-55; add the API field `latest_band` to that row (the newest reading's risk band); add a row for the warning component (`DeteriorationPrediction`, UI "Predicción de deterioro"); in the §8 resolved-names table change "— (US-08 not built)" to the built names (orchestrator)
- [X] T017 [P] Update `docs/BACKLOG.md`: US-08 row gets the spec link `[024-deterioration-prediction](../specs/024-deterioration-prediction/spec.md)` and status ✅ (orchestrator)
- [X] T018 [P] Update `docs/PROJECT_STATUS.md`: mark US-08 done with a one-line summary (computed on read, no migration, D-55) and the next step (orchestrator)
- [X] T019 Run the [quickstart.md](quickstart.md) checks on a **Neon test branch** (depends on T013–T018): create a temporary branch of the project database (see memory note on the Neon project; never use the production branch's data), set `DATABASE_URL` to that branch only in the local shell (never commit it or write it to a file in the repo), run `alembic upgrade head` (expect no new migration) and `python -m pytest -q` against it, then run the manual check steps 1–7 with the backend pointed at that branch and synthetic demo patients. Record the results in the agent log and the PR description, then delete the temporary Neon branch (devops)

---

## Dependencies & Execution Order

- T001 → everything.
- Rule: T002 → T003.
- Endpoint: T004 → T005 (also needs T003) → T006.
- Component: T007 → T008; T008, T009, T010 → T011 → T012.
- T006 and T012 → T013 → T014.
- T015–T018 can start after T013; T019 is last.
- Backend (T002–T006) and frontend (T007–T012) tracks are independent of each other.

## Parallel Example

```text
After T001:
  qa-tester:    T002 (rule tests), T004 (API tests)
  frontend-dev: T007 (fake backend), T009 (translations), T010 (CSS)
Then:
  backend-dev:  T003 → T005 → T006
  qa-tester:    T008 (component tests, after T007)
  frontend-dev: T011 → T012
After T013:
  orchestrator: T015, T016, T017, T018 in parallel
```

## Implementation Strategy

Single story, single MVP. Backend first gives a testable endpoint (T002–T006, curl-checkable); frontend then shows it (T007–T012). Stop at T013 if time runs short: the feature is complete and tested; T014–T019 are review, docs and the live check required before the PR.
