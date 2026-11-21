# Research: Register Patient (US-01)

No `NEEDS CLARIFICATION` items remained after `/speckit-clarify` (session 2026-11-20). Each entry
below records a design choice the plan needed, in the format Decision / Rationale / Alternatives.

## R1. Where the endpoint lives

- **Decision**: a new module `backend/app/patients.py` with its own `APIRouter`, mounted in
  `main.py` with `app.include_router(patients.router, prefix="/api")` next to the auth router and
  before the static-serving block, so `POST /api/patients` keeps priority over the SPA fallback (D-44).
- **Rationale**: one file owned by US-01; US-02 and US-05 add their own `GET` routes later without
  editing this one's logic (Principle III). Same pattern as `auth.router`.
- **Alternatives**: put the route in `main.py` (mixes app wiring with clinical logic); a
  service/repository layer (over-engineering for one endpoint, Principle XII).

## R2. Database session for the request

- **Decision**: a small dependency `get_session()` in `patients.py` that raises the existing 503
  ("Service unavailable") when `DATABASE_URL` is not set, otherwise yields `Session(get_engine())`
  and closes it. Tests override it with an in-memory SQLite session (`StaticPool`), the same
  technique `test_readings.py` and `test_demo_patients.py` use.
- **Rationale**: no shared session dependency exists yet (auth uses its own lazy `DbUserLookup`);
  a 5-line dependency is the simplest testable option, and the autouse `isolate_database` fixture
  already guarantees no test reaches a real database.
- **Alternatives**: reuse `DbUserLookup`'s session (wrong responsibility); a global session
  helper in `db.py` (touches a TS file for one caller; can be extracted later if US-02/US-05 need it).

## R3. Request validation that never echoes values

- **Decision**: a Pydantic model `PatientCreate` with `model_config = ConfigDict(extra="forbid")`:
  - `name`: `str`, whitespace stripped, `min_length=1`, `max_length=100`;
  - `age`: `int` with `strict=True`, `ge=0`, `le=130` (so `"40"`, `40.5` and `true` are rejected);
  - `sex`: `Literal["female", "male", "other"]`;
  - `triage_level`: `int` with `strict=True`, `ge=1`, `le=5`.
  The app's existing `RequestValidationError` handler (TS-06) already returns only `type`, `loc`
  and `msg`, never `input` or `ctx`, so no submitted value is echoed.
- **Rationale**: the clarified rule (unknown fields → 422) is `extra="forbid"`; strict ints match
  the edge cases in the spec; reusing the existing handler keeps one 422 shape for the whole API.
- **Alternatives**: hand-written checks (more code, same result); lax ints (would accept `"40"`).
- **Check during implementation**: confirm Pydantic's `msg` for `literal_error` and `extra_forbidden`
  contains no submitted value (it lists the allowed values / a fixed text); a test asserts that a
  distinctive submitted value never appears in the 422 body.

## R4. Role check order (401 → 403 → 422)

- **Decision**: a dependency `require_nurse(user = Depends(get_current_user))` that raises
  `HTTPException(403, "Only nurses can register patients")` for any role other than `nurse`.
- **Rationale**: FastAPI resolves dependencies before it raises body validation errors, so a
  signed-out caller gets 401 and a doctor gets 403 even with an invalid body; nothing is stored in
  either case. Fixed message, no role or user data in it.
- **Alternatives**: check the role inside the handler (would let a doctor learn about field errors
  first; order less clear).

## R5. Generating the patient code

- **Decision**: `next_patient_code(session)` reads all `identifier` values that start with `PAT-`,
  keeps those whose suffix is all digits, takes the highest number, and returns
  `f"PAT-{max(highest + 1, 7):03d}"`. Non-`PAT-<digits>` codes are ignored; gaps are not filled
  (clarified); past 999 the number simply grows (`PAT-1000`, within `String(20)`).
- **Rationale**: parsing in Python works the same on PostgreSQL and SQLite (tests) and is trivially
  fast at the project's scale (tens of patients). The `:03d` padding plus `max(..., 7)` guarantees
  `PAT-001` to `PAT-006` are never produced.
- **Alternatives**: a PostgreSQL sequence or a new column (needs a migration, out of scope);
  SQL regex/`CAST` (dialect-specific, SQLite tests would differ); filling gaps (rejected in clarify).

## R6. One retry on a code conflict, all or nothing

- **Decision**: `register_patient(session, data, user_id)` sets one timestamp `now =
  datetime.now(timezone.utc)`, adds the `Patient` (`admitted_at=now`, `status="active"`), flushes,
  adds the initial `TriageEvent` (`occurred_at=now`, `source="initial"`, `previous_level=None`,
  `score=None`, `created_by_id=user_id`, `reason="Initial triage at registration"`) and commits
  once. On `IntegrityError` it rolls back, computes the code again and tries exactly once more; a
  second `IntegrityError` rolls back and raises 409 ("Could not assign a patient code; try again").
  Other database errors roll back and give the existing 503, logged by error type only (like `db.py`).
- **Rationale**: a single commit makes the patient and its event atomic (AC4); the unique
  constraint on `patients.identifier` is the real guard against two nurses racing (AC3), so no lock
  is needed. Validation already excludes the check-constraint failures, so an `IntegrityError` here
  means a code conflict in practice.
- **Alternatives**: `SELECT … FOR UPDATE` / table lock (heavier, PostgreSQL-only); unlimited retries
  (the spec fixes one).
- **Test technique**: monkeypatch `next_patient_code` to return an existing code first (then a
  free one, or the existing one twice) to prove the retry and the 409 without real concurrency.

## R7. Response shape

- **Decision**: 201 with `identifier`, `name`, `age`, `sex`, `triage_level`, `status`,
  `admitted_at` (ISO 8601). No `id` (internal `patient_id`), no `Location` header.
- **Rationale**: glossary names unchanged; the frontend needs only `identifier` to navigate (AC9).

## R8. Frontend page and the nurse-only button

- **Decision**:
  - `frontend/src/pages/register-patient/RegisterPatientPage.jsx` (+ `.module.css`, `.test.jsx`):
    reads `useAuth().user.role`; a doctor (any non-nurse) sees the "nurses only" message and the
    back link; a nurse sees the form inside `Card`. Fields: name (text, `maxLength` 100, hint linked
    by `aria-describedby`), age (`type="number"`, `min` 0, `max` 130, `step` 1), sex and triage level
    as **radio groups** (`fieldset`/`legend`) with nothing checked; each triage option shows
    `TriageLevelBadge`. `noValidate` on the form; the page's own check shows translated messages per
    field. Submit uses `Button type="submit"`, disabled while saving. It calls the existing
    `apiPost('/api/patients', body)` and on success `navigate('/patients/' + identifier)`.
  - `frontend/src/pages/register-patient/RegisterPatientButton.jsx`: returns `null` unless the
    signed-in role is `nurse`; otherwise a `Link`-driven button (`Button` via `useNavigate`) with the
    `lucide-react` `UserPlus` icon (decorative). Mounted in `PatientListPage.jsx` with one import
    and one element (Principle III "mount a component").
  - `App.jsx`: `<Route path="/patients/new" element={<RegisterPatientPage />} />` inside the
    `<RequireAuth>` group; `react-router` ranks the static segment above `/patients/:identifier`
    (D-45), a test proves it.
- **Rationale**: radio groups show all five levels with their badge at once and make "nothing
  selected" natural (clarified: no pre-selection). Keeping both files in the page folder means US-02
  only has to keep one element when it replaces the list body. `ApiError` carries only the status,
  so the page maps 409 / 422 / 403 / other / network to fixed translated messages and never shows
  server text; a 401 is already handled by the client's session-expiry path.
- **Alternatives**: `<select>` for the triage level (cannot show the badge inside options);
  a new `registerPatient()` in `api/client.js` (touches a shared TS file for a one-line wrapper);
  hiding the route itself from doctors (the guard is role-agnostic by design; a message is clearer).

## R9. Tests

- **Backend** `backend/tests/test_patients.py`: `TestClient` with `get_session` overridden by an
  in-memory SQLite session and `get_current_user` overridden by a synthetic nurse or doctor `User`
  saved in that database (so `created_by_id` has a real foreign key). Covers AC1–AC6.
- **Frontend**: `RegisterPatientPage.test.jsx` and `RegisterPatientButton.test.jsx` with
  `renderApp` (MemoryRouter) and the fake backend; `stubBackend` gains one optional `patients`
  handler for `/api/patients`. Covers AC7–AC14. Existing raw-color and contrast guard tests must
  stay green (FR-018).
