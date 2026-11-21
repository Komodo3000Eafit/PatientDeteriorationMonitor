# Research: Save and Score Vital-Sign Readings (US-03)

All Technical Context items were known from the repo and the user's input; no NEEDS
CLARIFICATION remained. Each entry: Decision, Rationale, Alternatives considered.

## R1. Storage shape: one `reading_scores` row per reading, entries in a JSON column

- **Decision**: New table `reading_scores` with `id`, `vital_sign_id` (unique, FK →
  `vital_signs.id`, `ON DELETE RESTRICT`), `system` (`String(20)`), `total` (`SmallInteger`,
  check `>= 0`), `band` (`String(20)`, check in the four `RISK_BANDS`), `entries` (SQLAlchemy
  `JSON`: list of 7 objects `parameter`, `value`, `points`, `low`, `high`, `category`). Decimals
  (temperature value and bounds) are stored as strings with one decimal (`"37.8"`); every other
  value keeps its JSON type. Model `ReadingScore` in `app/models.py`, with the same naming
  convention as the other tables.
- **Rationale**: The 7 entries are always read together with their score and never queried
  alone, so one JSON column is the simplest shape that keeps "the reason for each point"
  (Principle XII). `JSON` works on PostgreSQL (stored as `json`) and SQLite (tests). The unique FK
  makes "exactly one score per reading" a database rule. Strings for decimals avoid float
  rounding (`36.1` → `36.099999…`) and match how Pydantic v2 serializes `Decimal`.
- **Alternatives**: one row per entry in a `reading_score_entries` table (7× rows, a join on
  every read, no benefit for the scope); columns on `vital_signs` (mixes measured data with a
  derived result and ties the reading table to one scoring system); `JSONB` (PostgreSQL-only type,
  breaks the SQLite tests; no query needs it); recomputing on every read (the spec forbids it:
  later stories read a stored score, and a stored score keeps what was shown at the time).

## R2. `record_reading` scores and stores in the same flush

- **Decision**: `record_reading(session, patient_id, vitals)` keeps its signature and return value
  (the `VitalSign` row). New order: `result = get_scoring_system().score(vitals)` (this also
  validates, so `InvalidVitalSigns` is raised before anything is added) → add `VitalSign` → flush
  (to get its id) → add `ReadingScore(vital_sign_id=row.id, **score_values(result))` → flush. It
  still never commits. A small pure helper `score_values(result) -> dict` in `app/readings.py`
  turns a `ScoreResult` into the column values (system, total, band, entries); the migration
  backfill uses the same helper (R3). No ORM relationship is added: the API reads readings and
  scores with one explicit join (R7).
- **Rationale**: Scoring before adding means invalid values or a scoring error leave the session
  untouched (AC3); one flush sequence inside the caller's transaction means the caller's commit or
  rollback covers both rows (all or nothing). The simulator calls `record_reading` and commits per
  round, so it is unchanged (AC4, FR-002). `get_scoring_system()` is the single selection point
  (D-36), so no NEWS2 rule leaves `app/scoring`.
- **Alternatives**: a database trigger (NEWS2 rules in SQL, breaks Principle V); scoring in the
  API handler (the simulator would store readings without a score); a separate service layer
  (Principle XII).

## R3. Migration `0002_reading_scores`: create, backfill; downgrade drops the table

- **Decision**: One hand-written revision `0002_reading_scores` (down_revision
  `0001_initial_schema`) that creates `reading_scores` and then backfills it: reads
  `vital_signs` in batches of 500 ordered by `id` through lightweight `sa.table()` definitions
  (not the ORM models), builds `VitalSigns` from each row, scores it with
  `get_scoring_system()`, and bulk-inserts the rows from `score_values()`. `downgrade()` drops
  the `reading_scores` table: scores are derived from readings, so nothing is lost that upgrading
  again (create + backfill) does not rebuild. If any reading fails validation, `InvalidVitalSigns` (message: parameters and reasons only, no
  values) propagates; `env.py` runs the whole upgrade in one transaction, and PostgreSQL DDL is
  transactional, so the table creation is rolled back too and nothing changes.
- **Rationale**: Doing the backfill in the same revision guarantees "no reading without a score"
  right after `alembic upgrade head` (AC5). Batches keep memory flat even if the demo database grew
  large. `sa.table()` keeps the migration independent of later model changes; reusing
  `score_values()` keeps one serialization.
- **Alternatives**: a separate backfill command run by hand (can be forgotten, leaves readings
  without a score); a data migration in SQL (would duplicate NEWS2 rules); a downgrade that
  refuses (`NotImplementedError`): rejected because the table holds only derived data, and
  refusing would break the existing offline downgrade test from head to base.
- **Check**: `0001_initial_schema` has a real `downgrade()` used by `test_migrations.py`
  (offline downgrade SQL `head:base`). That test stays **unchanged**: it still finds `DROP TABLE`
  for the five TS-03 tables, and `0002`'s downgrade adds `DROP TABLE reading_scores;` before them.
  `test_single_head` expects `0002_reading_scores`.
- **Deploy order**: on the US-03 deploy the migration (with the backfill) runs before the new code
  is live. A reading saved by the old `record_reading` in that window would have no score, so the
  simulator must not run while the deploy is in progress (quickstart §2, D-50).

## R4. Testing the migration and the backfill

- **Decision**: (a) Offline: the existing `--sql` tests keep working; the upgrade SQL now also
  creates `reading_scores` (update the expected table set and FK count to 6). The backfill is
  skipped in offline mode (`context.is_offline_mode()`): it needs data, and offline SQL is only
  used for review. (b) Online backfill tests on SQLite: create only the five TS-03 tables on an
  in-memory engine, insert synthetic readings with plain SQL, then run the revision's
  `upgrade()` through `MigrationContext.configure(connection)` + `Operations.context(ctx)` (loaded
  with `ScriptDirectory.get_revision("0002_reading_scores").module`). Check one score per reading,
  equal to `get_scoring_system().score(...)`; empty table succeeds; a reading with an invalid
  value (for example `temperature = 46.0`, which the column allows but the accepted limits do not)
  makes `upgrade()` raise `InvalidVitalSigns` and, inside a rolled-back
  transaction, leaves no `reading_scores` rows. The batch size is a module constant so a test can
  run with batches of 2 over 5 readings.
- **Rationale**: Exercises the real migration code with no network and no real database
  (conftest isolation), using Alembic's public API.
- **Alternatives**: testing against Neon (forbidden in tests); testing only the helper (misses
  the batching and the failure path).

## R5. API module: new `app/readings_api.py`, not an edit of `app/patients.py`

- **Decision**: A new router module `backend/app/readings_api.py` with `POST` and `GET
  /patients/{identifier}/readings`, included in `main.py` with prefix `/api` (one line, route
  registration). It imports `get_session` from `app.patients` unchanged; it defines its own
  `require_nurse_recorder` dependency with the fixed message `"Only nurses can record vital
  signs"` (US-01's `require_nurse` says "register patients", which would be the wrong message).
- **Rationale**: `app/patients.py` belongs to US-01 (a functional story); Principle III forbids
  changing another functional story's code except to register a route or mount a component.
  Importing an existing dependency is reuse, not modification (US-01 plan "Notes for later
  stories" already offers `get_session`). A separate file also keeps US-02's future edits to the
  patient list endpoint conflict-free.
- **Alternatives**: extending `patients.py` (Principle III violation, merge conflicts with US-02);
  moving `get_session` to a shared module (touches US-01 code for no gain now).

## R6. Request validation, error order and 422 shape

- **Decision**:
  - The POST body is received as a plain JSON object (`body: dict[str, Any] = Body(...)`); a body
    that is not an object gets FastAPI's 422 through the existing TS-06 handler (no values).
  - Order: 401 (sign-in) → 403 (role) → 404 (code not matching `^[A-Z0-9-]{1,20}$` — no query —
    or no patient with that code) → 409 (patient `discharged`) → 422 (vital signs) → 201.
  - Vital signs are validated with `vital_signs_from_mapping(body)` (accepted limits, unknown
    keys); `InvalidVitalSigns.problems` is answered as
    `{"detail": [{"type": <reason>, "loc": ["body", <parameter or cleaned key>], "msg": "Invalid value"}]}`,
    the same shape as the existing 422 handler, so a client reads every 422 the same way.
  - `limit` on GET is `Query(50, ge=1, le=200)` with `strict` int parsing by FastAPI; outside the
    range FastAPI raises `RequestValidationError` → existing handler, no `input` echoed.
  - Database errors: `SQLAlchemyError` → rollback, log the error type only, 503 `"Service
    unavailable"` (same as US-01).
- **Rationale**: Reuses the single source of limits (FR-008) and the project's 422 shape; checking
  the patient before the body means a nurse with a wrong address learns that first, and it
  avoids validating data for a patient that cannot take it. The unknown-key cleaning in
  `vital_signs_from_mapping` (printable only, 40 chars) already guarantees no value is echoed.
- **Alternatives**: a Pydantic model with `extra="forbid"` (duplicates the limits outside
  `ACCEPTED_LIMITS`, two sources of truth); validating the body before the patient lookup (also
  valid; rejected for the reason above).

## R7. Response shape and serialization (shared with US-02, US-04, US-05)

- **Decision**: One `ReadingResponse` used by both POST (201, one object) and GET (200,
  `{"readings": [...]}`): `recorded_at`, the seven parameters, and `score` = `{system, total, band,
  entries}`. Temperature (reading value, entry value and bounds) is a **string with one decimal**
  (`"37.8"`), as stored; all other numbers are JSON numbers; `on_oxygen` is a boolean;
  `consciousness` a one-letter string. No internal ids. GET loads readings with their score in one
  query (`select(VitalSign, ReadingScore).join(...)`), ordered by `recorded_at DESC, id DESC`.
- **Rationale**: One shape for both endpoints; strings for decimals avoid rounding and are what
  Pydantic v2 produces for `Decimal` anyway. Wrapping the list in an object leaves room without a
  breaking change. `id DESC` is the stable tie-break for two readings saved in the same instant.
- **Alternatives**: temperature as a JSON number (float rounding risk in the stored entries and
  two representations); a bare JSON array (harder to extend).

## R8. Frontend: page, button, 422 mapping and result view

- **Decision**:
  - New folder `frontend/src/pages/record-reading/`: `RecordReadingPage.jsx` (+ `.module.css`,
    test), `RecordReadingButton.jsx` (+ `.module.css`, test), `ReadingResult.jsx` (the stored
    result view, + test) and `formatReason.js` (+ test: turns an entry's `low`/`high`/`category`
    into "21–24", "≤ 8", "≥ 25", or a list of translated category values; never computes points).
  - Route `/patients/:identifier/readings/new` inside the `<RequireAuth>` group in `App.jsx`
    (route registration). `react-router` ranks it above `/patients/:identifier` by segment count
    (D-45); the page itself shows `NotFoundPage` when `isPatientCode(identifier)` is false.
  - `RecordReadingButton` (nurse only, `Activity` icon from `lucide-react`, D-46) is mounted with
    one line on `PatientDetailPage` (mount a component).
  - Form fields are text inputs with `inputMode="numeric"` (integers) and `inputMode="decimal"`
    (temperature); on oxygen and consciousness are native radio groups, nothing pre-selected.
    Client checks: filled, chosen, integers `^\d+$`, temperature `^\d+([.,]\d)?$` (a comma is
    accepted as the decimal separator and sent as a dot). **No range checks** (clarified).
  - 422 handling needs the problem list: `ApiError` in `api/client.js` gains an optional `detail`
    property, filled only for a 422 from the parsed JSON body (when parsing fails it stays
    `null`); the error message is unchanged and never includes the body. The page maps each
    `detail[i].loc[1]` that is one of the seven parameter codes to a fixed per-field message
    (`missing` → "required", anything else → "value not accepted"); any other entry shows one
    general message. No submitted value or server text is shown.
  - The risk band is shown as a translated text label (no new color tokens): the spec only needs
    the label, and band colors would be a new visual language that US-04 should decide.
- **Rationale**: Mirrors US-01's page/button pattern and file layout, reuses Button, Card,
  `OctagonXIcon`, tokens and `useLanguage`. The `ApiError.detail` change is additive and
  backward compatible (TS-06 code; existing callers ignore it), the smallest way to give the form
  the field names.
- **Alternatives**: a raw `fetch` in the page (duplicates timeout, token and 401 handling);
  colored band badges (new tokens and contrast work outside the spec); reusing `StatusBadge`
  (it shows monitoring status, a different concept, GLOSSARY §3 vs §1).

## R9. Tests (baseline counts recorded in the first task)

- **Backend** (`pytest`, SQLite in-memory, synthetic users and patients):
  `test_readings.py` (extended: score stored with the reading, equals the scoring module, all or
  nothing on invalid values and on a forced flush error, the "only `record_reading` creates
  `VitalSign`/`ReadingScore`" source scan extended to `ReadingScore`); `test_simulator.py`
  (one round → every reading has a score); `test_reading_scores_migration.py` (R4);
  `test_migrations.py` (head is `0002_reading_scores`, 6 tables and FKs in the upgrade SQL; the
  offline downgrade test unchanged, plus `DROP TABLE reading_scores` checked in a new test); `test_demo_patients.py` (reset deletes
  scores before readings); `test_readings_api.py` (201 body and stored rows, 401, 403, 404
  unknown and bad format, 409 discharged, 422 for each reason without echoed values and unknown
  field, GET order, default 50, `limit` 1/200 and 0/201 → 422, empty list, discharged history,
  boundaries and open ends in entries, 503).
- **Frontend** (Vitest + RTL, `renderApp`, `stubBackend`): `RecordReadingPage.test.jsx` (nurse
  form, doctor message, client checks incl. comma decimal and no range check, 422 field mapping
  and general message, 404/409/5xx/network messages, double submit, result view ES and EN,
  language switch keeps typed values and result), `RecordReadingButton.test.jsx`,
  `ReadingResult.test.jsx`, `formatReason.test.js`, `client.test.js` (422 `detail`),
  `App.routes.test.jsx` (route ranking and not-found for a bad code). `stubBackend` gains an
  optional `readings` handler for `/api/patients/<code>/readings`.
- **Rationale**: one test per acceptance criterion at least (SC-007); same tools as US-01.
