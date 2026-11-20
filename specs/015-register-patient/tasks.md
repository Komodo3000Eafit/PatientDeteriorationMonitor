---

description: "Task list for US-01 register patient"
---

# Tasks: Register Patient

**Input**: Design documents from `specs/015-register-patient/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/patients-api.md](contracts/patients-api.md), [contracts/ui.md](contracts/ui.md), [quickstart.md](quickstart.md)

**Tests**: MANDATORY. This story adds an API endpoint and security controls (constitution Principle VII): at least one test per acceptance criterion AC1–AC14. Per the project template, qa-tester writes and runs the tests after implementation, then security-reviewer reviews.

**Organization**: This feature has one story (US-01), so all story tasks carry the `[US-01]` label.

## Format: `[ID] [P?] [Story] Description (agent)`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks).
- **(agent)**: Owner agent at the end of the line: backend-dev, frontend-dev, qa-tester, security-reviewer or orchestrator.
- All paths are relative to the repository root. Backend commands run from `backend/` (venv active); frontend commands from `frontend/`.
- Edit files with the file tools, not PowerShell (non-ASCII text such as `años`, `…`; CLAUDE.md). Keep files UTF-8.
- **Only these paths change**: `backend/app/patients.py` (new), `backend/app/main.py`, `backend/tests/test_patients.py` (new), `frontend/src/App.jsx`, `frontend/src/pages/register-patient/*` (new), `frontend/src/pages/patient-list/PatientListPage.jsx`, `frontend/src/i18n/translations.js`, `frontend/src/testing/fakeBackend.js`, `frontend/src/styles/tokens.css`, `frontend/src/styles/contrast.test.js` and `frontend/src/styles/tokens.test.js` (added by the 2026-11-20 triage tiles rework, D-48), `docs/GLOSSARY.md`, `docs/DECISIONS.md`, `docs/BACKLOG.md`, `docs/PROJECT_STATUS.md` and this story's `agent-log.csv`. No migration, no new dependency, no change to `backend/app/models.py`, `auth.py`, `db.py`, `.github/` or `.specify/`.
- Agents log each step with `/opt/homebrew/bin/pwsh -NoProfile -File scripts/log-agent.ps1 -Agent <agent> -Task <Txxx> -Action <action> -Details "<text>"` (PowerShell 7.7.0; use the full path, `pwsh` may not be on the shell's PATH). Action is one of `assigned`, `started`, `done`, `failed`, `finding`, `verified`, `rework`; the script writes to `specs/015-register-patient/agent-log.csv` (story taken from the branch name).
- Synthetic data only: test and example names like "Paciente Ficticio Siete"; no real names.

---

## Phase 1: Setup

- [X] T001 [US-01] Baseline before any change: in `backend/` run `python -m pytest -q`; in `frontend/` run `npm ci`, `npm test` and `npm run build`. Record both passing test counts and that the build succeeds, for the PR description. Do not edit files (qa-tester)

---

## Phase 2: Foundational

None. TS-03 (`patients`, `triage_events`, `users` tables), TS-06 (`get_current_user`, the no-echo 422 handler in `main.py`, the client's 401 session-expiry handling), TS-12 (`Button`, `Card`, `TriageLevelBadge`, tokens, guard tests), TS-13 (`<RequireAuth>` route group, `renderApp`, `fakeBackend`) and TS-14 (`lucide-react` 1.77.0) are merged and reused unchanged.

---

## Phase 3: US-01 Register patient 🎯 MVP

**Goal**: A signed-in nurse fills in name, age, sex and triage level on `/patients/new`; the system generates the patient code, stores the patient and its `initial` triage event together, and the app opens `/patients/<code>`. Doctors and signed-out callers cannot register.

**Independent Test**: `python -m pytest` and `npm test` pass with the new `test_patients.py` and register-patient tests; manually, the demo nurse registers a patient from the patient list and lands on `/patients/PAT-007` (or the next code), and the demo doctor sees no button and gets the nurses-only message on `/patients/new` ([quickstart.md](quickstart.md) §2–§3).

### Backend implementation (backend-dev)

- [X] T002 [US-01] Create `backend/app/patients.py` with module docstring "Register patients (US-01). See specs/015-register-patient/contracts/patients-api.md." and these pieces (research R1–R7, [contracts/patients-api.md](contracts/patients-api.md)):
  - `PatientCreate(BaseModel)` with `model_config = ConfigDict(extra="forbid")` and fields: `name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]`; `age: Annotated[int, Field(strict=True, ge=0, le=130)]`; `sex: Literal["female", "male", "other"]`; `triage_level: Annotated[int, Field(strict=True, ge=1, le=5)]` (so `"40"`, `40.5`, `true` and any unknown field such as `identifier` give 422).
  - `PatientResponse(BaseModel)`: `identifier: str`, `name: str`, `age: int`, `sex: str`, `triage_level: int`, `status: str`, `admitted_at: datetime`. No `id`.
  - `get_session()` generator dependency: if `database_url()` is `None` raise `HTTPException(503, "Service unavailable")`; else `session = Session(get_engine())`, `yield session`, close it in `finally`.
  - `require_nurse(user: User = Depends(get_current_user)) -> User`: raise `HTTPException(403, "Only nurses can register patients")` unless `user.role == "nurse"`; return the user.
  - `INITIAL_REASON = "Initial triage at registration"`, `FIRST_CODE_NUMBER = 7`, `CODE_PREFIX = "PAT-"`.
  - `next_patient_code(session) -> str`: select `Patient.identifier` where it starts with `"PAT-"`; keep only those whose suffix after `PAT-` is all ASCII digits (`str.isdigit()` plus `isascii()`); `number = max(highest + 1, 7)` (highest = 0 when none); return `f"PAT-{number:03d}"`. Gaps are not filled; non-`PAT-<digits>` codes are ignored; `PAT-1000` past 999 is fine.
  - `register_patient(session, data: PatientCreate, user_id: int) -> Patient`: up to 2 attempts. Each attempt runs inside one `try` block that covers **add, flush, the event and commit** (on SQLite the unique-code error appears at `flush()`, on PostgreSQL at `flush()` or `commit()`): `now = datetime.now(timezone.utc)`; `patient = Patient(identifier=next_patient_code(session), name=data.name, age=data.age, sex=data.sex, triage_level=data.triage_level, status="active", admitted_at=now)`; `session.add(patient)`; `session.flush()`; add `TriageEvent(patient_id=patient.id, occurred_at=now, previous_level=None, new_level=data.triage_level, score=None, reason=INITIAL_REASON, source="initial", created_by_id=user_id)`; `session.commit()`; `session.refresh(patient)`; return patient. On `IntegrityError` (from any of those steps): `session.rollback()` and try again; after the second `IntegrityError` raise `HTTPException(409, "Could not assign a patient code; try again")`. On any other `SQLAlchemyError`: `session.rollback()`, `logger.warning("Patient registration failed (%s)", type(exc).__name__)`, raise `HTTPException(503, "Service unavailable")`. Never log or return submitted values.
  - `router = APIRouter()` and `@router.post("/patients", status_code=201, response_model=PatientResponse)` handler `create_patient(body: PatientCreate, user: User = Depends(require_nurse), session = Depends(get_session))` that calls `register_patient(session, body, user.id)` and returns `PatientResponse.model_validate(patient, from_attributes=True)`, built **inside the handler while the session is still open**: never return the ORM object itself, because the `get_session` dependency may close the session before the response is serialized, and then the expired attributes would raise `DetachedInstanceError` (a 500 on success).
  Depends on T001 (AC1–AC6, FR-001–FR-009) (backend-dev)
- [X] T003 [US-01] Register the router in `backend/app/main.py`: `from app import patients` and `app.include_router(patients.router, prefix="/api")` right after the auth router line, before the static-serving block, so `POST /api/patients` wins over the SPA fallback (D-44). Change nothing else in `main.py`. Depends on T002 (FR-001) (backend-dev)

### Frontend implementation (frontend-dev)

- [X] T004 [P] [US-01] Add the texts to `frontend/src/i18n/translations.js`, in both `es` and `en`, exactly as the table in [contracts/ui.md](contracts/ui.md) §Texts: `registerPatient.button`, `.title`, `.name`, `.nameHint`, `.age`, `.sex`, `.triageLevel`, `.triageHint`, `.submit`, `.submitting`, `.required`, `.ageInvalid`, `.errorInvalid`, `.errorConflict`, `.errorFailed`, `.nursesOnly`, and `sex.female`, `sex.male`, `sex.other`. Keep the existing keys unchanged. Depends on T001 (AC14, FR-017) (frontend-dev)
  - Rework 2026-11-20: change request from the manual check (spec AC7, FR-011, contracts/ui.md). `registerPatient.name` is now "Nombre" (es) / "Name" (en) instead of "Nombre (ficticio)" / "Name (fictitious)"; the hint `registerPatient.nameHint` is unchanged. The header comment in `RegisterPatientPage.jsx` now says "a synthetic name".
  - Rework 2026-11-20 (second manual check, spec AC7, contracts/ui.md "Triage level tiles"): the key `registerPatient.triageScale` (es "I = más urgente · V = menos urgente", en "I = most urgent · V = least urgent") added in the first rework is removed from both languages; the severity line is no longer shown. Logged as a T004 rework by frontend-dev, as the user asked.
- [X] T005 [US-01] Create `frontend/src/pages/register-patient/RegisterPatientPage.jsx` and `RegisterPatientPage.module.css` per [contracts/ui.md](contracts/ui.md) and research R8:
  - Reads `useAuth().user`; if `user?.role !== 'nurse'`: `<main>` with `h1` `registerPatient.title` and a `Card` containing `registerPatient.nursesOnly` and `<Link to="/patients">{t('nav.backToPatients')}</Link>`; no form (AC12).
  - Nurse: `<main>` with `h1` `registerPatient.title`, a `Card` with a `<form noValidate>`: name text input (`maxLength={100}`, label `registerPatient.name`, hint `registerPatient.nameHint` linked with `aria-describedby`); age `type="number"` `min={0}` `max={130}` `step={1}` (label `registerPatient.age`); sex radio group in `fieldset`/`legend` (`registerPatient.sex`) with `female`/`male`/`other` labeled `sex.*`; triage level radio group in `fieldset`/`legend` (`registerPatient.triageLevel`, hint `registerPatient.triageHint`) with values 1–5, each label showing `<TriageLevelBadge level={n} />`. **Nothing pre-filled or pre-selected**; no patient code or time field (AC7, FR-011).
  - Field state in component `useState` (not keyed by language), so switching language keeps typed values (AC14).
  - On submit: client check: name required after trim; age required and `/^\d+$/` and 0–130 (`registerPatient.ageInvalid`); sex and triage level chosen (`registerPatient.required`). Show each message next to its field with `aria-invalid` and `aria-describedby`; if any fails, send nothing (AC8, FR-012).
  - Valid: set saving; `Button type="submit"` disabled with label `registerPatient.submitting`; `apiPost('/api/patients', { name: name.trim(), age: Number(age), sex, triage_level: Number(level) })`; on success `navigate('/patients/' + result.identifier)` (AC9, FR-013).
  - On error (`ApiError` status only, never server text): 422 → `registerPatient.errorInvalid`; 409 → `registerPatient.errorConflict`; 403 → `registerPatient.nursesOnly`; 401 → nothing extra (client's session-expiry handling redirects); any other status, network error or timeout → `registerPatient.errorFailed`. Show it in one `role="alert"` element, keep the values, re-enable the button (AC10, FR-014).
  - CSS module uses design tokens (`var(--…)`) only; no raw color, no inline `style` (FR-018).
  Depends on T004 (frontend-dev)
  - Rework 2026-11-20: change request from the manual check (spec AC7, FR-011, FR-018; contracts/ui.md "Layout", "Triage level tiles"). Layout: name full width with hint; age and sex in one `.row` grid (`repeat(auto-fit, minmax(16rem, 1fr))`, side by side when wide, stacked when narrow); triage level below; submit last. The triage level is now five native `<input type="radio" name="triage_level">` tiles in order I → V (input visually hidden with the clip technique, still focusable; focus ring on the tile via `:has(:focus-visible)`), each with background `--color-triage-N-soft`, border `--color-triage-N`, dark `--color-text`, a decorative Roman numeral and the `triageLevel.N` text (the radio's accessible name via `aria-labelledby`); the checked tile gets a thicker border (inset shadow in the same token) and a decorative `lucide-react` `Check` icon (`aria-hidden`, `focusable="false"`, currentColor). `TriageLevelBadge` is no longer used on this page and is unchanged. New text `registerPatient.triageScale` ("I = más urgente · V = menos urgente" / "I = most urgent · V = least urgent") in `translations.js`, shown under the legend and linked to the group with `aria-describedby` (logged under T005 as the user asked, no separate T004 rework). Ten tokens `--color-triage-1..5` and `--color-triage-1..5-soft` added to `tokens.css` (D-48). All earlier behavior kept.
  - Rework 2026-11-20 (second manual check, spec AC7, FR-011; contracts/ui.md "Layout", "Triage level tiles"): age and sex are full width, one below the other (the `.row` grid is removed); the severity line paragraph and its id in the fieldset's `aria-describedby` are removed (now the hint, plus the error after an empty submit); `.tiles` is `grid-template-columns: repeat(5, minmax(0, 1fr))`, always one row of five, I → V; each tile shows only `triageLevel.N`, once, centered (the Roman numeral span, `TRIAGE_NUMERALS` and `.numeral` are removed); the radio keeps its accessible name via `aria-labelledby`. Unchanged: D-48 colors, thicker border (inset shadow) and `Check` icon on the selected tile, visually hidden focusable native radios, nothing pre-selected, the hint. **Narrow-screen default (chosen by the team, the user did not decide):** at about 360px the label may wrap inside its tile but never overflows or is clipped (`min-width: 0` on the tile, `overflow-wrap: anywhere` and `text-align: center` on the label, font size unchanged; extra top padding keeps the check icon off the label). Known effect: "Triage" may break mid-word at the narrowest widths; checked by hand in quickstart §3 step 2.
  - Rework 2026-11-20 (third manual check, spec FR-011; contracts/ui.md "Layout" item 5): the submit button is full width, the same width as the fields above it and aligned with their left and right edges. In `RegisterPatientPage.module.css` the rule `.form button[type='submit']` changes from `justify-self: start; min-width: 12rem;` to `justify-self: stretch; width: 100%;`. The shared `Button` component is unchanged. Tests (19 files, 363 tests) and build pass; the width is checked by hand in quickstart §3 step 2 (jsdom has no layout).
- [X] T006 [P] [US-01] Create `frontend/src/pages/register-patient/RegisterPatientButton.jsx`: returns `null` unless `useAuth().user?.role === 'nurse'`; otherwise a shared `Button` (primary) that calls `useNavigate()('/patients/new')`, containing `<UserPlus aria-hidden="true" focusable="false" size="1.25em" />` from `lucide-react` and `t('registerPatient.button')`. No raw color, no inline style (AC11, FR-016, FR-018). Depends on T004 (frontend-dev)
  - Rework 2026-11-20: a manual check showed the button touching the patient list Card below it. Fix: the nurse branch now wraps the `Button` in `<div className={styles.wrapper}>` with `.wrapper { margin-block-end: var(--space-4); }` in `RegisterPatientButton.module.css` (tokens only; non-nurses still get `null`). Tests (19 files, 334 tests) and build pass.
- [X] T007 [US-01] Register and mount: in `frontend/src/App.jsx` add `<Route path="/patients/new" element={<RegisterPatientPage />} />` inside the `<RequireAuth>` group (replace the "Functional stories: add protected pages here" comment line's US-01 example, keep the comment for others) with its import; in `frontend/src/pages/patient-list/PatientListPage.jsx` add one import and one `<RegisterPatientButton />` element under the `h1`. Change nothing else in either file (Principle III: register a route / mount a component). Depends on T005, T006 (AC11, AC12, AC13, FR-010, FR-016) (frontend-dev)

### Tests (qa-tester)

- [X] T008 [P] [US-01] Create `backend/tests/test_patients.py` (header cites US-01 AC1–AC6 and [contracts/patients-api.md](contracts/patients-api.md); synthetic data only; no real database, no network). Fixture: in-memory SQLite engine with `poolclass=StaticPool` and `connect_args={"check_same_thread": False}`, `Base.metadata.create_all`; save a synthetic nurse and a synthetic doctor `User`; override `app.patients.get_session` with a session on that engine and `app.auth.get_current_user` with the chosen user; `TestClient(app.main.app)`. Tests, each naming its AC:
  - AC1: valid body → 201 with `identifier`, `name` (trimmed), `age`, `sex`, `triage_level`, `status == "active"`, `admitted_at`, and no `id`; exactly one `TriageEvent` for the patient with `source == "initial"`, `previous_level is None`, `new_level` = level, `score is None`, `created_by_id` = nurse id, `occurred_at == admitted_at`.
  - AC2: empty table → `PAT-007`; only demo `PAT-001`–`PAT-006` → `PAT-007`; `PAT-007` and `PAT-009` exist → `PAT-010` (gap not filled); a `TEST-1` / `PAT-ABC` code is ignored; `PAT-999` exists → `PAT-1000`; a body with `"identifier": "PAT-001"` → 422 naming `identifier`.
  - AC3: monkeypatch `app.patients.next_patient_code` to return an existing code first, then a free one → 201 with the free code; to return the existing code twice → 409 `"Could not assign a patient code; try again"` and the patient and triage-event counts are unchanged.
  - AC4: make adding the triage event fail (e.g. monkeypatch to raise `SQLAlchemyError` on commit) → 503 and no patient row remains.
  - AC5: no override of `get_current_user` and no token → 401; doctor → 403 `"Only nurses can register patients"`; doctor with an invalid body → still 403; nothing stored in each case.
  - AC6 (parametrized): missing each field; name `""` and `"   "`; name of 101 chars; age `-1`, `131`, `"40"`, `40.5`, `true`; sex `"unknown"`; triage level `0`, `6`, `"3"`; extra field → 422 with `loc` naming the field; a distinctive submitted value (e.g. name `"ZZ-UNIQUE-VALUE"` of 101+ chars, sex `"QQ-SECRET"`) never appears in the response text; nothing stored.
  - `DATABASE_URL` unset and `get_session` not overridden → 503 `"Service unavailable"` (FR-009).
  Depends on T003 (AC1–AC6, FR-001–FR-009) (qa-tester)
- [X] T009 [P] [US-01] Add an optional `patients` handler to `stubBackend` in `frontend/src/testing/fakeBackend.js` for the path `/api/patients` (default: `jsonResponse({}, 404)` behavior unchanged when not given), then create `frontend/src/pages/register-patient/RegisterPatientPage.test.jsx` and `RegisterPatientButton.test.jsx` with `renderApp`, `signInForTest(NURSE | DOCTOR)` and exact Spanish strings copied from `translations.js` in the header comment. Tests, each naming its AC:
  - AC7: nurse at `/patients/new` sees the form in a card, the name label "Nombre" and hint "No uses datos reales.", the five options "Triage I"–"Triage V", no radio checked, no patient code or time field.
  - AC8: submitting empty shows a message next to each field and `fetch` is never called with `/api/patients`; age `131` shows the age message; typed values stay.
  - AC9: valid submit sends `{ name, age, sex, triage_level }` as numbers/trimmed to `/api/patients` and `currentPath()` becomes `/patients/PAT-007` from the stubbed answer.
  - AC10: answers 422, 409, 500 and a rejected fetch each show the mapped `role="alert"` text, keep the values and re-enable the button; while the request is pending the button is disabled. A 403 answer shows "Solo el personal de enfermería puede registrar pacientes." in the alert. A 401 answer (stored token) clears the session and `currentPath()` becomes `/login` (existing session-expiry handling, FR-014 and the session-expiry edge case).
  - AC11: nurse on `/patients` sees "Registrar paciente" with one `aria-hidden` svg and clicking it goes to `/patients/new`; doctor sees no such button.
  - AC12: signed out at `/patients/new` → `/login`; doctor sees "Solo el personal de enfermería puede registrar pacientes." and the back link, and no form.
  - AC13: `/patients/new` renders the registration page, not the patient detail or not-found page.
  - AC14: after switching to EN the texts are English ("Register patient", "Name", "Do not use real data.") and a typed name and age are still there.
  - Added during implementation: `frontend/src/App.routes.test.jsx` has the TS-13 test "edge case: signed in /patients/new shows the not-found page today", which asserted the pre-US-01 behavior and now fails by design; replace it in place with the AC13 route-ranking check (this one test file is added to the allowed paths for this reason only).
  No backend, no network. Depends on T007 (AC7–AC14) (qa-tester)
  - Rework 2026-11-20: after the T004 label change, `RegisterPatientPage.test.jsx` and `RegisterPatientButton.test.jsx` expect "Nombre" / "Name" (exact match; header comments and the AC7 test title updated); the hint is still asserted. Tests (19 files, 334 tests) and build pass.
  - Rework 2026-11-20 (triage tiles): `RegisterPatientPage.test.jsx` gains a block "US-01 AC7 triage level tiles" (9 runs): five radios in order Triage I → V with numerals; nothing pre-selected and no check icon; click on "Triage III" checks it and only its tile shows the check icon; keyboard: radio-group semantics the browser's arrow keys rely on (same name, one fieldset, focusable, not hidden; `@testing-library/user-event` is not installed and jsdom does not move radios on arrow keys, so real key presses are a manual quickstart check); the severity line in es and en and inside the group description; the group error description; the selected tile I / V sends `triage_level` 1 / 5. `styles/contrast.test.js` adds 10 checks (text on each triage soft ≥ 4.5:1, each triage solid on white ≥ 3:1) and `styles/tokens.test.js` pins the ten values. Result: 19 files, 363 tests (was 334); build OK; `npm audit --audit-level=high` 0 vulnerabilities.
  - Rework 2026-11-20 (second manual check): `RegisterPatientPage.test.jsx` drops the numeral check and the two severity-line tests; adds "each tile shows only its Triage N label, exactly once within the triage group" and "there is no severity line in Spanish or English"; the group description test now expects the hint on open and hint + error after an empty submit. Kept: order I → V by accessible name, nothing pre-selected, click selection with the check icon on that tile only, native radio group, level sent as a number, field errors. Result: 19 files, 363 tests (2 removed, 2 added); build OK; `npm audit --audit-level=high` 0 vulnerabilities.
- [X] T010 [US-01] Run the full validation from [quickstart.md](quickstart.md) §1: `python -m pytest` in `backend/`; `npm test`, `npm run build`, `npm audit --audit-level=high` in `frontend/`. Every previously passing test still passes (counts ≥ T001 baseline plus the new tests); `styles/noRawColors.test.js` and `styles/contrast.test.js` pass; `git diff --stat -- backend/app/models.py backend/app/auth.py backend/app/db.py backend/migrations backend/alembic.ini .github frontend/package.json frontend/package-lock.json` is empty (path corrected during implementation: the migrations live in `backend/migrations`, not `backend/alembic`). Report the counts next to the baseline. If a check fails, send it back to the owning task. Depends on T008, T009 (SC-007) (qa-tester)

### Review (security-reviewer)

- [X] T011 [US-01] Review the story (read-only, change no code). Check: `POST /api/patients` uses `get_current_user` and the nurse check, with 401 and 403 before body validation; the body forbids unknown fields and uses strict ints, so the client cannot set `identifier`, `admitted_at` or `status`; 401/403/409/422/503 bodies are fixed and contain no submitted value, stack trace or database text; logs carry the error type only; the patient and the triage event are committed together; the code generator never yields `PAT-001`–`PAT-006` and only produces `[A-Z0-9-]` codes (TS-08 note); `/patients/new` is inside `<RequireAuth>`; the page never renders server text; no raw color or hand-drawn SVG; no secret or real data in code or tests. Return findings as a report; the orchestrator logs them (constitution VIII) (security-reviewer)
  - Rework 2026-11-20 (triage tiles): read-only review of the changed frontend files. No security findings (tokens only in `tokens.css`, solid triage colors as border/shadow only, dark text, decorative `Check`, focusable radios, no server text, no new dependency). One Low traceability finding: `tokens.css` and the CSS module cited D-48 before it existed; resolved by adding D-48 (T013).

---

## Phase 4: Polish

- [X] T012 [P] Edit `docs/GLOSSARY.md` (D-40): in §1 fill the UI column for `name` ("Nombre"; rework 2026-11-20, was "Nombre (ficticio)" before the change request), `age` ("Edad (años)"), `sex` ("Sexo"; values Femenino / Masculino / Otro), **triage level** form label ("Nivel de triage") and **register (a patient)** ("Registrar paciente"; English "Register patient"); add a row **registration page** = `RegisterPatientPage` at `/patients/new` (nurse only; others see "Solo el personal de enfermería puede registrar pacientes."), and note in the **patient code** row that new codes are system-generated from `PAT-007` (D-47). Cite `translations.js` (`registerPatient.*`, `sex.*`) and US-01 as sources (FR-017) (orchestrator)
  - Rework 2026-11-20 (second manual check): the **severity line** row is removed; the **triage level tile** row now says label only ("Triage I" … "Triage V", once, centered), one row of five equal columns, I → V.
- [X] T013 [P] Edit `docs/DECISIONS.md`: add **D-47** after D-46 (date 2026-11-20, Status "Active"): patient codes for registered patients (US-01) are **generated by the system** as `PAT-` + at least 3 digits, **one more than the highest existing `PAT-<digits>` code, never below `PAT-007`**; `PAT-001`–`PAT-006` are reserved for the demo patients (D-37); gaps are not filled, so a code is never reused; non-`PAT-<digits>` codes are ignored; on a unique-code conflict the save is rolled back and retried **once**, then 409. The client cannot send a code (unknown fields → 422). Reasons and rejected options from [research.md](research.md) R5–R6 (sequence or new column needs a migration; filling gaps can reuse a deleted patient's code; client-chosen codes break the demo reservation; table locks are PostgreSQL-only and heavier) (FR-020) (orchestrator)
  - Rework 2026-11-20 (triage tiles): add **D-48** after D-47, amending D-43 in part: the ten triage level color tokens (1 `#DC2626`/`#FEE2E2`, 2 `#C2410C`/`#FFEDD5`, 3 `#A16207`/`#FEF9C3`, 4 `#15803D`/`#DCFCE7`, 5 `#1D4ED8`/`#DBEAFE`) follow the D-43 rules (solid = border/icon only, soft = background, dark text, never color alone, never white text on solid); contrast text/soft 11.98–13.62:1, solid/white 4.83–6.70:1; available to US-02/US-05. D-43's status gets "Extended by D-48"; no text deleted. `docs/GLOSSARY.md` gains the rows **triage level tile** and **severity line** (`registerPatient.triageScale`). Also updated: plan.md structure, quickstart.md §3 step 2.
  - Rework 2026-11-20 (second manual check): D-48 gains a dated note that the separate Roman numeral and the severity line were removed and the label is the non-color cue (no text deleted, tokens unchanged). Also updated: quickstart.md §3 step 2 (stacked fields, one row of five label-only tiles, no severity line, manual check of arrow keys, focus ring, thicker border and a ~360px window) and the plan.md structure line for `translations.js`.
- [X] T014 [P] Edit `docs/BACKLOG.md` and `docs/PROJECT_STATUS.md`: mark US-01 done, link `specs/015-register-patient/spec.md` in the backlog's Spec column and set its Depends on to `TS-03, TS-06, TS-12, TS-13`; in PROJECT_STATUS update "Last updated", "Current step"/"Next step" (US-02 to US-05), mark the "US-01 (from TS-08)" and "TS-13 → US-01" notes as done, and add a note: **US-02** must keep `<RegisterPatientButton />` when it replaces the `PatientListPage` body and may reuse `get_session` from `app/patients.py` (FR-020) (orchestrator)
- [X] T015 Check `specs/015-register-patient/agent-log.csv`: every task has `assigned`, `started` and `done` rows from its agent; log each T011 finding with `-Action finding` on the security-reviewer's behalf (that agent has no shell). Prepare the PR record: link to `specs/015-register-patient/`, which agent did what, the T001 and T010 test counts, and the security-reviewer's findings with how each was resolved (constitution workflow step 6). Depends on T010, T011, T012, T013, T014 (orchestrator)

---

## Dependencies & Execution Order

- **Setup**: T001 before any edit.
- **Backend**: T002 → T003.
- **Frontend**: T004 → T005 and T006 (in parallel) → T007. The frontend track runs in parallel with the backend track (different files; the page only needs the contract).
- **Tests**: T008 after T003; T009 after T007 (T008 and T009 in parallel). T010 after both.
- **Review**: T011 after T010 (reviews the finished, green state).
- **Polish**: T012, T013, T014 in parallel after T010; T015 last.
- **Story dependencies**: TS-03, TS-06, TS-12, TS-13 (all merged). No other functional story's code is touched; shared files change only to register a route, mount a component, add texts and add one test-helper handler.

## Parallel Example

```text
# Round 1: T001 (qa-tester baseline)
# Round 2: backend-dev T002 → T003   ||   frontend-dev T004 → (T005 + T006) → T007
# Round 3: qa-tester T008 (after T003) + T009 (after T007) → T010
# Round 4: T011 (security-reviewer) → T012 + T013 + T014 → T015 (orchestrator)
```

## Implementation Strategy

US-01 is the whole MVP, built so each step stays green:

1. Baseline (T001).
2. Endpoint and route registration (T002–T003); texts, page, button, route and mount (T004–T007).
3. Tests for AC1–AC14 and full validation (T008–T010).
4. Security review (T011); glossary, D-47, backlog/status and PR record (T012–T015).

After T015, commit (`US-01: Register patient`), push and open the PR. CI (TS-09) runs the backend tests, frontend tests and build, and the dependency check; the PR includes the agent activity log.

## Notes

- The orchestrator assigns each task to its agent and logs `assigned` / `started` / `done` rows (see `docs/agents.md`).
- Do not add anything not listed here (Principle XII): no patient list content (US-02), no readings (US-03), no detail content (US-05), no edit/discharge, no migration, no new dependency, no new shared component.
