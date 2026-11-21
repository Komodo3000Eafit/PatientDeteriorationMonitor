---
description: "Task list for US-04 re-triage suggestion alerts"
---

# Tasks: Re-triage Suggestion Alerts

**Input**: Design documents from `specs/020-retriage-suggestion-alerts/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/retriage-api.md](contracts/retriage-api.md), [contracts/ui.md](contracts/ui.md), [quickstart.md](quickstart.md)

**Tests**: MANDATORY. This story adds the deterioration/re-triage decision path, three API endpoints and security controls (constitution Principle VII; spec FR-016): at least one test per acceptance criterion AC1â€“AC20. qa-tester writes and runs the tests after implementation, then security-reviewer reviews.

**Organization**: This feature has one story (US-04), so all story tasks carry the `[US-04]` label.

## Format: `[ID] [P?] [Story] Description (agent)`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks).
- **(agent)**: Owner agent at the end of the line: backend-dev, frontend-dev, qa-tester, security-reviewer, devops or orchestrator.
- All paths are relative to the repository root. Backend commands run from `backend/` (venv active); frontend commands from `frontend/`.
- Edit files with the file tools, not PowerShell (non-ASCII text such as `â‰¤`, `â€“`, `Ã­`, accents; CLAUDE.md). Keep files UTF-8.
- **Only these paths change**: `backend/app/retriage.py` (new), `backend/app/readings.py`, `backend/app/retriage_api.py` (new), `backend/app/main.py`, `backend/tests/test_retriage.py` (new), `backend/tests/test_retriage_api.py` (new), `backend/tests/test_readings.py`, `backend/tests/test_simulator.py`, `frontend/src/pages/patient-detail/RetriageSuggestion.jsx` (new), `frontend/src/pages/patient-detail/RetriageSuggestion.module.css` (new), `frontend/src/pages/patient-detail/RetriageSuggestion.test.jsx` (new), `frontend/src/pages/patient-detail/PatientDetailPage.jsx`, `frontend/src/i18n/translations.js`, `frontend/src/testing/fakeBackend.js`, `docs/GLOSSARY.md`, `docs/DECISIONS.md`, `docs/BACKLOG.md`, `docs/PROJECT_STATUS.md` and this story's `agent-log.csv`. **Not changed**: `backend/app/models.py` (no migration, tables reused as they are), `backend/app/patients.py` (US-01, only `get_session` imported), `backend/app/readings_api.py` (US-03), `backend/app/scoring/*`, `backend/app/simulator.py` (its code is unchanged; only its test asserts the new behavior), `auth.py`, `db.py`, `demo_patients.py`, `backend/migrations/*` (no migration), `.github/`, `.specify/`, `frontend/package.json`, `frontend/package-lock.json`, `backend/requirements.txt`, `frontend/src/styles/tokens.css` (no new token), `frontend/src/components/*`, `frontend/src/pages/record-reading/*` (reused, not changed), `frontend/src/App.jsx` (no new route â€” the component is mounted on the existing detail page).
- Agents log each step with `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/log-agent.ps1 -Agent <agent> -Task <Txxx> -Action <action> -Details "<text>"`. Action is one of `assigned`, `started`, `done`, `failed`, `finding`, `verified`, `rework`; the script writes to `specs/020-retriage-suggestion-alerts/agent-log.csv` (story taken from the branch name).
- Synthetic data only: fictitious patients, synthetic users, made-up vital signs; no real data.

---

## Phase 1: Setup

- [X] T001 [US-04] Baseline before any change: in `backend/` run `python -m pytest -q`; in `frontend/` run `npm ci`, `npm test` and `npm run build`. Record both passing test counts and that the build succeeds, for the PR description. Do not edit files (qa-tester)

---

## Phase 2: Foundational

None. TS-03 (tables `alerts`, `triage_events`, `patients`, `vital_signs`; `0001_initial_schema`), TS-06 (`get_current_user`, the no-echo 422 handler in `main.py`, the client's 401 session-expiry handling), TS-07 (`app.scoring`), TS-12 (`Button`, `Card`, `TriageLevelBadge`, tokens, guard tests), TS-13 (`<RequireAuth>`, `renderApp`, `stubBackend`, `isPatientCode`, `useAuth`), TS-14 (`lucide-react`) and US-03 (`record_reading`, `reading_scores`, `RiskBandBadge`, `readings_api.py` patterns) are merged and reused. **No migration** (FR-017): the `alerts` and `triage_events` tables are used as they are. US-01's `app/patients.py` is imported (`get_session`), not changed.

---

## Phase 3: US-04 Re-triage suggestion alerts ðŸŽ¯ MVP

**Goal**: A saved reading whose stored risk band crosses up into `medium`/`high` raises one open re-triage suggestion alert (severity + suggested level + reason), built from the stored score and never recomputing NEWS2; the app never changes the triage level on its own; a doctor accepts (manual triage event, level changed, alert acknowledged) or dismisses (alert acknowledged); any clinician reads the suggestions; the patient detail area shows the open suggestion, read-only for nurses and with Accept/Dismiss for doctors.

**Independent Test**: `python -m pytest` and `npm test` pass with the new tests; saving two readings for an active Triage III patient (first `low`, second `medium`) leaves exactly one open `alerts` row (severity `medium`, suggested level 2) and the patient's `triage_level` still 3 with no `source='automatic'` event; as the demo doctor, `GET /api/patients/PAT-00x/suggestions` returns it and `POST .../accept` sets the level to 2, writes one `source='manual'` triage event and acknowledges the alert; the detail page shows the suggestion with Accept/Dismiss for a doctor and read-only for a nurse ([quickstart.md](quickstart.md)).

### Backend implementation (backend-dev)

- [X] T002 [US-04] Create `backend/app/retriage.py` (docstring "Re-triage suggestion logic (US-04). See specs/020-retriage-suggestion-alerts/data-model.md and research R1â€“R5. Reads the stored risk band only; no NEWS2 rule lives here."; research R2, R3, R4):
  - Constants: `BAND_ORDER = {"low": 0, "low-medium": 1, "medium": 2, "high": 3}`; `BAND_SEVERITY = {"medium": "medium", "high": "high"}`; `BAND_STEP = {"medium": 1, "high": 2}`.
  - `suggested_level(current_level: int, band: str) -> int`: `max(1, current_level - BAND_STEP[band])`.
  - A machine tag helper pair, using the **canonical `[retriage band=â€¦;suggested=â€¦]` tag and regex defined in [data-model.md](data-model.md) Â§"Message/reason shape"**: `build_message(band, current_level, suggested_level, reason_text) -> str` returns `"[retriage band={band};suggested={suggested_level}] "` followed by the fixed human sentence naming the band, current and suggested level; `read_tag(message) -> tuple[str, int] | None` parses the leading tag back to `(band, int(n))` with `^\[retriage band=(?P<band>medium|high);suggested=(?P<n>[1-5])\]\s*(?P<human>.*)$` and returns `None` when absent. The tag carries only derived data (no submitted value or internal id).
  - `reason_from_entries(entries: list) -> str`: a fixed-shape, value-safe line naming the parameters that scored points and their points (from the stored explanation `entries`; e.g. "Respiratory rate +3, SpO2 +3, temperature +1"); never a raw NEWS2 computation.
  - `evaluate_retriage(session, patient, score) -> None`: do nothing unless `patient.status == "active"`; read the patient's **previous** stored reading band (the most recent `reading_scores.band` for this patient's readings **other than** the one just saved) â€” if there is no previous reading, return; if `BAND_ORDER[score.band] <= BAND_ORDER[previous_band]` or `score.band not in BAND_SEVERITY`, return; compute `new_level = suggested_level(patient.triage_level, score.band)`; if `new_level >= patient.triage_level` (patient already at/over Triage I), return; find any existing **open** suggestion alert for the patient and parse its band with `read_tag` â€” if one exists and `BAND_ORDER[score.band] <= BAND_ORDER[open_band]`, return (no-duplicate rule, R5); otherwise `session.add(Alert(patient_id=patient.id, severity=BAND_SEVERITY[score.band], message=build_message(...), status="open"))` in the caller's transaction (no commit). Import `Alert`, `ReadingScore`, `VitalSign` from `app.models`; never recompute a score.
  - `accept_suggestion(session, patient, alert, user_id) -> None` and `dismiss_suggestion(session, alert, user_id) -> None` pure helpers used by the API. Accept sets `patient.triage_level` to the suggested level (from `read_tag(alert.message)`) and adds the `manual` `TriageEvent` (`previous_level` = the level before, `new_level` = suggested level, `created_by_id` = `user_id`, `occurred_at` = server time, `reason` recording the accepted suggestion, **`score = None`** â€” the manual re-triage records a decision, not a score, matching US-01's initial event), then sets the alert acknowledged (`status`, `acknowledged_by_id`, `acknowledged_at`). Dismiss only acknowledges the alert. Neither commits.
  Depends on T001 (AC1â€“AC6, FR-001â€“FR-006, FR-008, FR-009) (backend-dev)
- [X] T003 [US-04] Extend `backend/app/readings.py` `record_reading`: after `session.add(ReadingScore(...))` and its `session.flush()`, call `evaluate_retriage(session, patient, score)` where `patient` is loaded by `patient_id` and `score` is the just-added `ReadingScore` (load it via the flushed `row.id`). Add `from app.retriage import evaluate_retriage` and the patient lookup. Keep the signature, the return value and "never commits" unchanged; the simulator and `readings_api.py` callers are not edited. Import scoring only from `app.scoring` (no NEWS2 rule here). Depends on T002 (AC1, AC3, FR-001) (backend-dev)
- [X] T004 [US-04] Create `backend/app/retriage_api.py` (docstring "List and act on re-triage suggestions (US-04). See specs/020-retriage-suggestion-alerts/contracts/retriage-api.md."; research R6â€“R8), reusing US-03's patterns (`PATIENT_CODE` regex, `find_patient`, `get_session` imported from `app.patients`, `SQLAlchemyError` â†’ 503 logged by type):
  - Pydantic `SuggestionResponse` (`id: int`, `severity: str`, `message: str`, `reason: str`, `current_level: int`, `suggested_level: int`, `status: str`, `created_at: datetime`) and `SuggestionListResponse` (`suggestions: list[SuggestionResponse]`). A `to_response(alert, current_level)` helper strips the machine tag from `message` with `read_tag`/a cleaner so the returned `message` is the human text only, and fills `suggested_level` from the tag. **No `patient_id`, `acknowledged_by_id`** in the body.
  - `require_doctor(user = Depends(get_current_user))` â†’ `HTTPException(403, "Only doctors can change the triage level")` unless `user.role == "doctor"`.
  - `@router.get("/patients/{identifier}/suggestions", response_model=SuggestionListResponse)` with `user = Depends(get_current_user)`: `find_patient` (404; any status); select the patient's suggestion alerts `order_by(Alert.created_at.desc(), Alert.id.desc())`; return `{"suggestions": [...]}` (empty when none).
  - `@router.post("/patients/{identifier}/suggestions/{alert_id}/accept", response_model=SuggestionResponse)` with `user = Depends(require_doctor)`: `find_patient`; load the alert by `id` and `patient_id` (404 `"Suggestion not found"`); if `patient.status == "discharged"` â†’ 409 `"Patient is discharged"`; if `alert.status == "acknowledged"` â†’ 409 `"Suggestion already handled"`; else `accept_suggestion(session, patient, alert, user.id)`, `session.commit()`, build and return the response.
  - `@router.post("/patients/{identifier}/suggestions/{alert_id}/dismiss", response_model=SuggestionResponse)` with `user = Depends(require_doctor)`: `find_patient`; load the alert (404); if already acknowledged â†’ 409 `"Suggestion already handled"`; else `dismiss_suggestion(session, alert, user.id)`, `session.commit()`, return the response.
  Check order per endpoint: 401 â†’ 403 â†’ 404 â†’ 409 â†’ 200. Never log or return submitted values or internal ids. Depends on T002 (AC7â€“AC13, FR-007â€“FR-011) (backend-dev)
- [X] T005 [US-04] Register the router in `backend/app/main.py`: import `retriage_api` with the other app modules and add `app.include_router(retriage_api.router, prefix="/api")` right after the readings_api router line, before the static-serving block (D-44). Change nothing else. Depends on T004 (FR-007, FR-010) (backend-dev)

### Frontend implementation (frontend-dev)

- [X] T006 [P] [US-04] Add the texts to `frontend/src/i18n/translations.js`, in both `es` and `en`, exactly as the table in [contracts/ui.md](contracts/ui.md) Â§"Translation keys": `retriage.title`, `retriage.currentLevel`, `retriage.suggestedLevel`, `retriage.severity.medium`, `retriage.severity.high`, `retriage.accept`, `retriage.dismiss`, `retriage.accepted`, `retriage.dismissed`, `retriage.none`, `retriage.loadError`, `retriage.actionError`. Keep existing keys unchanged; confirm each term against `docs/GLOSSARY.md`. Depends on T001 (AC18, FR-014) (frontend-dev)
- [X] T007 [US-04] Create `frontend/src/pages/patient-detail/RetriageSuggestion.jsx` and `RetriageSuggestion.module.css` per [contracts/ui.md](contracts/ui.md), reusing `Card`, `Button`, `RiskBandBadge` (from `../record-reading/RiskBandBadge.jsx`), `TriageLevelBadge` (from `../../components/`), `useAuth`, `useLanguage`, `apiGet`/`apiPost`, and following `RecordReadingPage.jsx`'s patterns (`mounted` ref, synchronous double-submit guard, messages as keys):
  - Props `{ identifier }`. On mount `apiGet('/api/patients/' + identifier + '/suggestions')`; keep the newest **open** suggestion (`status === 'open'`). While loading show nothing; on a load error show `retriage.loadError`; when there is no open suggestion show `retriage.none` (no buttons) (AC15).
  - Open suggestion inside one `Card`: title `retriage.title`; `<RiskBandBadge band={...} />` for the raising band (derive the band from the API `severity`: `medium`â†’`medium`, `high`â†’`high` â€” do **not** compute it another way); two `TriageLevelBadge`s labelled `retriage.currentLevel` (`current_level`) and `retriage.suggestedLevel` (`suggested_level`); the severity label `retriage.severity.<severity>`; the `reason` text as given (AC14, AC19).
  - Doctor only (`useAuth().user?.role === 'doctor'`): two shared `Button`s `retriage.accept` and `retriage.dismiss`. A nurse sees the Card read-only, no buttons (AC14).
  - Accept â†’ `apiPost('/api/patients/' + identifier + '/suggestions/' + id + '/accept', {})`; on success show `retriage.accepted` and the new current level from the answer. Dismiss â†’ `.../dismiss`; on success show `retriage.dismissed`. Both buttons disabled while the action is pending (AC16).
  - Errors (`ApiError` status only, never server text): 404/409/5xx/network/timeout â†’ `retriage.actionError`, suggestion kept, buttons usable again; 401 â†’ nothing (session-expiry handling) (AC17).
  - Tokens only, no raw color, no inline style; any icon imported from `lucide-react`, decorative (FR-015). State as keys so switching language keeps what is shown (AC18).
  Depends on T006 (AC14â€“AC18, FR-012, FR-013) (frontend-dev)
- [X] T008 [US-04] Mount the component: in `frontend/src/pages/patient-detail/PatientDetailPage.jsx` add one import and one `<RetriageSuggestion identifier={identifier} />` element below the existing `<RecordReadingButton identifier={identifier} />` line. **Keep the `RecordReadingButton` line** (US-03). Change nothing else in the file (Principle III). Depends on T007 (AC14, FR-012) (frontend-dev)

### Tests (qa-tester)

- [X] T009 [P] [US-04] Create `backend/tests/test_retriage.py` (synthetic data, in-memory SQLite; create only the five TS-03 tables / full metadata; insert synthetic users, patients and readings through `record_reading` or direct rows):
  - AC1: an active Triage III patient with a first reading scoring `low-medium`, then a reading scoring `medium` â†’ exactly one open `Alert`, `severity == "medium"`, `read_tag(message) == ("medium", 2)`, reason naming the scoring parameters (no raw value leak).
  - AC2: after that crossing, `patient.triage_level == 3` and no `TriageEvent` with `source == "automatic"` exists.
  - AC3: the **first** reading of a patient raises nothing; a `medium` â†’ `low` or `medium` â†’ `medium` sequence raises nothing; a crossing into `low-medium` (e.g. `low` â†’ `low-medium`) raises nothing (only `medium`/`high`).
  - AC5 + mappings: `BAND_SEVERITY == {"medium": "medium", "high": "high"}`, `BAND_STEP == {"medium": 1, "high": 2}`; a `high` crossing for Triage III suggests level 1; for Triage II also clamps at 1; a patient already at Triage I (level 1) gets no suggestion.
  - AC4: with an open `medium` suggestion, a later `medium` reading adds nothing; a later `high` reading adds a second open suggestion (`read_tag` â†’ `("high", â€¦)`); after `dismiss_suggestion`, a later `medium` crossing may suggest again.
  - AC11: a discharged patient gets no new suggestion.
  - AC12: a forced error while adding the alert (monkeypatch `Alert` or the flush to raise) followed by `session.rollback()` leaves no reading, score or alert.
  - `accept_suggestion`/`dismiss_suggestion` unit behavior: accept sets `triage_level`, adds one `source == "manual"` `TriageEvent` (previous/new level, `created_by_id`, `occurred_at`, **`score is None`**), sets the alert acknowledged; dismiss only acknowledges.
  Depends on T002, T003 (AC1â€“AC6, AC11, AC12) (qa-tester)
- [X] T010 [P] [US-04] Create `backend/tests/test_retriage_api.py` (header cites AC7â€“AC13 and [contracts/retriage-api.md](contracts/retriage-api.md); fixtures like `test_readings_api.py`: `StaticPool` SQLite, synthetic doctor and nurse, override `app.patients.get_session` and `app.auth.get_current_user`; seed an open suggestion for a patient):
  - AC8: doctor and nurse GET â†’ 200 suggestions newest first (two with the same `created_at` â†’ later id first); a patient with no suggestions â†’ `{"suggestions": []}`; discharged patient â†’ 200; no token â†’ 401; unknown code `PAT-999` and malformed `pat-001` â†’ 404 without a database query; the response has no `patient_id` / `acknowledged_by_id` and the `message` carries no machine tag.
  - AC6/AC9 accept: doctor accept â†’ 200, `status == "acknowledged"`, `current_level == suggested_level`; the patient row's `triage_level` is updated; exactly one `source == "manual"` `TriageEvent` stored; nurse accept â†’ 403 `"Only doctors can change the triage level"` and nothing changes; no token â†’ 401.
  - AC7/AC9 dismiss: doctor dismiss â†’ 200 acknowledged, triage level unchanged, no `TriageEvent`; nurse dismiss â†’ 403; no token â†’ 401.
  - AC10: accept/dismiss on an already acknowledged alert â†’ 409 `"Suggestion already handled"`; on an unknown `alert_id` â†’ 404 `"Suggestion not found"`; two accepts of the same open alert â†’ the second is 409 (nothing changes).
  - AC11: accept on a discharged patient â†’ 409 `"Patient is discharged"`; nothing stored.
  - AC13: a distinctive synthetic value never appears in any response body; `DATABASE_URL` unset / `get_session` not overridden â†’ 503 `"Service unavailable"` (FR-011).
  Depends on T005 (AC7â€“AC13, FR-007â€“FR-011) (qa-tester)
- [X] T011 [P] [US-04] Extend backend reading-path tests for the record-time behavior:
  - `backend/tests/test_readings.py`: saving a reading that crosses up into `medium`/`high` for an active patient with a previous less-urgent reading creates exactly one open `Alert` (AC1); a reading with no previous reading, or no crossing, creates none (AC3); `record_reading` still returns the reading and does not commit.
  - `backend/tests/test_simulator.py`: after a simulator run that produces a crossing, exactly one open suggestion exists for that patient and no `source == "automatic"` `TriageEvent` exists (AC2, AC4); the simulator's own output is unchanged.
  Depends on T003 (AC1, AC2, AC3, AC4) (qa-tester)
- [X] T012 [US-04] Create `frontend/src/pages/patient-detail/RetriageSuggestion.test.jsx` with `renderApp`, `signInForTest(DOCTOR | NURSE)`, a `suggestions` handler added to `stubBackend` in `frontend/src/testing/fakeBackend.js` (optional handler matching `/^\/api\/patients\/[^/]+\/suggestions/`, default 404 unchanged when not given), and exact Spanish strings copied from `translations.js`:
  - AC14/AC16 doctor, open suggestion: the Card shows the band badge, "Nivel actual" and "Nivel sugerido" triage badges, the severity label and the reason; "Aceptar" sends the accept path and shows "Retriage aplicado." with the new level; "Descartar" sends the dismiss path and shows "Sugerencia descartada."; both buttons disabled while pending (one request on double click).
  - AC14 nurse, open suggestion: the same Card renders with no "Aceptar"/"Descartar" buttons.
  - AC15: no open suggestion â†’ "No hay sugerencias de retriage abiertas." and no buttons.
  - AC17: a 409/500/network on accept keeps the suggestion shown and shows "No se pudo completar la acciÃ³n. IntÃ©ntalo de nuevo.", buttons usable again; a 401 sends to `/login`; a load error shows "No se pudieron cargar las sugerencias.".
  - AC18: English texts after the language switch ("Re-triage suggestion", "Current level", "Accept", â€¦); switching language keeps what is shown.
  Depends on T008 (AC14â€“AC18) (qa-tester)
- [X] T013 [US-04] Run the full validation from [quickstart.md](quickstart.md): `python -m pytest` in `backend/`; `npm test`, `npm run build`, `npm audit --audit-level=high` in `frontend/`. Every previously passing test still passes (counts â‰¥ T001 baseline plus the new tests); `styles/noRawColors.test.js` and `styles/contrast.test.js` pass (no new token); `git diff --stat -- backend/app/models.py backend/app/patients.py backend/app/readings_api.py backend/app/simulator.py backend/app/scoring backend/app/auth.py backend/app/db.py backend/app/demo_patients.py backend/migrations .github frontend/package.json frontend/package-lock.json backend/requirements.txt frontend/src/styles/tokens.css frontend/src/App.jsx` is empty (only `simulator.py`'s test changed, not its code; confirm `backend/app/simulator.py` itself is unchanged). Report the counts next to the baseline. If a check fails, send it back to the owning task. Depends on T009, T010, T011, T012 (SC-004) (qa-tester)

### Security review (security-reviewer)

- [X] T014 [US-04] Read-only review (no code changes; report findings with `log-agent.ps1 -Action finding`): confirm every endpoint uses `Depends(get_current_user)`; accept and dismiss require `role == "doctor"` (403 otherwise) and the read is open to any clinician (AC9, VIII); the patient code is validated with `PATIENT_CODE` before any query and `alert_id` is a typed path int; error bodies (401/403/404/409/422/503) are fixed and never echo a submitted value, a patient's data or an internal id, and the machine tag never reaches the client (FR-011); creating a suggestion never changes `triage_level` and never writes `source == "automatic"` (FR-005, AC2); scoring is read from `reading_scores` only, with no NEWS2 rule outside `app/scoring` (FR-010); synthetic data only; no secret added. Record findings and how they were resolved in the PR. Depends on T013 (VIII, FR-005, FR-010, FR-011) (security-reviewer)

### Documentation (orchestrator / backend-dev)

- [X] T015 [P] [US-04] Add decision **D-51** to `docs/DECISIONS.md` using the row drafted in [plan.md](plan.md) Â§"Planned decision D-51" (band crossing â†’ re-triage suggestion, bandâ†’severity/step mappings, no-duplicate rule, accept/dismiss, no migration, never `automatic`). Depends on T001 (FR-017) (backend-dev)
- [X] T016 [P] [US-04] Update `docs/GLOSSARY.md` in the same PR: add **re-triage suggestion alert**, **suggestion component** (`RetriageSuggestion`), **Accept / Dismiss** actions, **suggested triage level**, and the **bandâ†’severity / bandâ†’step mapping**; update Â§1 and Â§4 notes that mention `source = 'automatic'` and escalation so they reflect D-51 (the app suggests; a doctor's `manual` accept changes the level; `automatic` stays unused). Keep existing rows' preferred terms. Depends on T001 (FR-014) (frontend-dev)
- [X] T017 [US-04] Update `docs/BACKLOG.md` (US-04 row: Spec link `specs/020-retriage-suggestion-alerts/spec.md`, Status âœ…) and `docs/PROJECT_STATUS.md` (Step 12 and the US-04 carry-over notes resolved) to show US-04 as done, in the same PR. Depends on T013, T014, T015, T016 (constitution Workflow step 7) (orchestrator)

**Checkpoint**: US-04 is fully functional and independently testable; `pytest`, `npm test`, `npm run build` and `npm audit --audit-level=high` pass; the PR records the agent activity log and the security findings.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1, T001)**: no dependencies; run first (records the baseline).
- **Foundational (Phase 2)**: none for this story (all prerequisites are merged).
- **US-04 (Phase 3)**: all tasks depend on T001.

### Within US-04

- Backend: `retriage.py` (T002) â†’ `record_reading` wiring (T003) and the router (T004) â†’ router registration (T005). T003 and T004 both depend on T002 and may proceed in parallel after it.
- Frontend: texts (T006) â†’ component (T007) â†’ mount (T008).
- Backend and frontend tracks are independent and can run in parallel after T001.
- Tests (T009â€“T012) depend on the code they cover; the full validation (T013) depends on all tests; the security review (T014) depends on T013.
- Docs: D-51 (T015) and the glossary (T016) depend only on T001 and can run any time; BACKLOG/PROJECT_STATUS (T017) comes last.

### Parallel opportunities

- After T001: the backend track (T002â†’T003/T004â†’T005) and the frontend track (T006â†’T007â†’T008) run in parallel.
- `[P]` tasks touch different files and can run together: T009, T010, T011 (different backend test files); T015 and T016 (different docs).

---

## Parallel Example: US-04

```text
# After T001, two agents work in parallel:
backend-dev:  T002 â†’ (T003 âˆ¥ T004) â†’ T005
frontend-dev: T006 â†’ T007 â†’ T008

# Then qa-tester runs the test files in parallel:
Task: "backend/tests/test_retriage.py"        # T009
Task: "backend/tests/test_retriage_api.py"     # T010
Task: "backend/tests/test_readings.py + test_simulator.py"  # T011
# followed by T012 (frontend), then T013 (full validation), then T014 (review)
```

---

## Implementation Strategy

### MVP (this story only)

1. Phase 1: baseline (T001).
2. Phase 3 backend (T002â€“T005): the crossing rule, the alert creation in `record_reading`, the three endpoints.
3. Phase 3 frontend (T006â€“T008): the mounted suggestion component.
4. Tests (T009â€“T012) â†’ full validation (T013) â†’ security review (T014) â†’ docs (T015â€“T017).
5. **STOP and VALIDATE**: run the [quickstart.md](quickstart.md) checks; open the PR with the agent log and the security findings.

### Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks.
- Keep the story independent: the only shared files touched are `main.py` (register the router), `PatientDetailPage.jsx` (mount one component, keep the US-03 line), `translations.js` (add keys), `fakeBackend.js` (optional handler) and the four docs. No migration, no new token, no new dependency, no change to `models.py`, `scoring`, `patients.py`, `readings_api.py` or `simulator.py` code.
- Commit after each task or logical group; verify new tests fail before implementing where practical.
