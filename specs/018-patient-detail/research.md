# Research: Patient Detail Page (US-05)

All Technical Context items are known (same stack as US-01/US-03). The decisions below resolve the
few design choices this read-only story needs. No NEEDS CLARIFICATION remains.

## R1 — Two endpoints vs one combined endpoint

**Decision**: Two separate read-only GET endpoints: `GET /api/patients/{identifier}` (patient
data) and `GET /api/patients/{identifier}/triage-events` (triage history).

**Rationale**: Locked in the 2026-11-20 clarification session. Two single-purpose endpoints mirror
the existing `/patients/{identifier}/readings` resource pattern, keep each response small, and let
the frontend load and test each block independently.

**Alternatives considered**: One combined `GET /api/patients/{identifier}` returning data + history
(couples two resources, larger payload, harder to test each block). Rejected.

## R2 — Where the handlers and `find_patient` live

**Decision**: Add both GET handlers and their response models to the existing `app/patients.py`
router (the module that already owns `/api/patients` and `POST /api/patients`). Share the existing
`find_patient(session, identifier)` helper so both the readings router and the patients router
validate the code and raise 404 identically.

Options for sharing `find_patient` (today a module-level function in `app/readings_api.py`):

- **(a) Move `find_patient` and the `PATIENT_CODE` regex into `app/patients.py`** and have
  `app/readings_api.py` import them from there. `patients.py` is the lower-level module (it is
  imported by `readings_api.py`, not the other way around), so this creates no import cycle.
- (b) Import `find_patient` from `app.readings_api` into `app.patients`. Rejected: `readings_api`
  already imports `get_session` from `patients`, so this would create a circular import.
- (c) Duplicate the lookup in `patients.py`. Rejected: two copies of the code-format rule (DRY /
  Principle XII).

**Decision**: option (a). Move `find_patient` + `PATIENT_CODE` to `app/patients.py`; update the one
import in `app/readings_api.py`. This is an additive refactor of a shared helper, not a change to
US-02/US-04 behavior.

**Rationale**: Keeps patient reads with the patient resource, reuses one code-validation path, and
respects the existing import direction (`readings_api` → `patients`). Principle III: adding
handlers to the router US-01 already owns, plus relocating a shared helper, is foundation reuse,
not modifying another functional story's feature code.

## R3 — Risk-band presentation on the page

**Decision**: Reuse the existing `RiskBandBadge` component (US-03, `pages/record-reading/`) via the
existing `ReadingResult` component. Do **not** use `StatusBadge`.

**Rationale**: `ReadingResult` already renders the current reading's score, the band (through
`RiskBandBadge`, which is band-tinted, not the monitoring-status `StatusBadge`) and the reason
table in ES/EN. Reusing it is the simplest clear option (Principle XII) and satisfies the spec's
"translated text or a neutral badge, not `StatusBadge`" (FR-011) with zero new presentation code.
`RiskBandBadge` maps `low`/`low-medium`/`medium`/`high` to band colors via
`frontend/src/utils/bandStatus.js`; US-05 adds nothing there.

**Alternatives considered**: a new plain-text band label (more code, loses the existing color cue);
a new neutral badge component (needless duplication). Rejected.

## R4 — How the page loads the three blocks

**Decision**: On mount (after the `isPatientCode` guard), the page issues three independent `apiGet`
calls through the shared client:

1. `GET /api/patients/{identifier}` → patient data + `last_reading_at`.
2. `GET /api/patients/{identifier}/readings?limit=1` → `{ readings: [reading] }`; the current
   reading is `readings[0]` (or none).
3. `GET /api/patients/{identifier}/triage-events` → `{ triage_events: [...] }`.

Each block renders from its own response. A 404 on call 1 shows the "patient not found" state. A
503/network/timeout on any call shows the "could not load" state with a retry. A 401 on a
stored-token request triggers the existing `onUnauthorized` session-expiry redirect (client.js).

**Rationale**: Reuses the US-03 readings contract unchanged (never recompute NEWS2) and keeps each
endpoint self-contained (clarified 2026-11-20: patient endpoint returns the last-reading time
independently). Three small GETs are acceptable for an academic page load within the 10 s timeout.

**Alternatives considered**: a single combined call (R1, rejected); deriving the current reading
from the patient endpoint (duplicates the reading shape, R1). Rejected.

## R5 — Response field names and `monitoring_status`

**Decision**: The patient endpoint returns exactly `identifier`, `name`, `age`, `sex`,
`triage_level`, `status`, `admitted_at`, `last_reading_at` (the latter `null` when no reading).
**No `monitoring_status` field.** The triage-events endpoint returns `{ "triage_events": [ {
occurred_at, previous_level, new_level, score, reason, source } ] }`. No internal `id` or
`patient_id` in either. `previous_level` and `score` are nullable (the initial event has no
previous level and may have no score).

**Rationale**: FR-001/FR-002 and the 2026-11-20 scope change: US-05 shows the stored risk band, not
a computed monitoring-status traffic light. Field names reuse the data-model column names so the
frontend maps them directly.

## R6 — Ordering of triage events

**Decision**: `ORDER BY occurred_at DESC, id DESC` (newest-first; `id DESC` breaks ties so events
saved in the same instant keep a stable, latest-first order), mirroring the readings query
(`recorded_at DESC, id DESC`).

**Rationale**: AC3/AC9 require newest-first; the tie-breaker makes the order deterministic for
tests even though an academic patient rarely has same-instant events.

## R7 — Test strategy

**Decision**: Backend — `backend/tests/test_patient_detail.py` using the same in-memory SQLite +
`StaticPool` + `dependency_overrides` pattern as `test_readings_api.py` (override `get_session` and
`get_current_user`; seed patients, a reading with its stored score, and triage events). Frontend —
`PatientDetailPage.test.jsx` using `renderApp` + `stubBackend` with the new optional `patient` and
`triageEvents` handlers plus the existing `readings` handler.

**Rationale**: Matches the merged conventions exactly; no new test infrastructure (Principle XII).

**`fakeBackend` change**: add optional `patient` and `triageEvents` handlers to `stubBackend`,
routed by the exact path `/api/patients/<code>` and the regex `/api/patients/<code>/triage-events`;
when not provided those paths keep answering 404 as today. Additive, like the US-03 `readings`
handler.

## R8 — No migration, no new table, no new dependency

**Decision**: Confirmed read-only. The `patients`, `vital_signs`, `reading_scores` and
`triage_events` tables already hold every field read. No Alembic revision, no schema change, no
`requirements.txt` / `package.json` change.

**Rationale**: Principle IX/XII — the simplest path for a read-only view.
