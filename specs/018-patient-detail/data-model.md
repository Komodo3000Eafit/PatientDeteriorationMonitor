# Data Model: Patient Detail Page (US-05)

**No new table and no migration.** This read-only story reads existing tables (see
`specs/003-db-tables-migrations/data-model.md`): `patients`, `vital_signs`, `reading_scores`,
`triage_events`. It defines only the **response shapes** of the two new GET endpoints and reuses
the US-03 readings shape for the current reading.

## Reads

| Endpoint | Source | Query |
|---|---|---|
| `GET /api/patients/{identifier}` | `patients` + latest `vital_signs.recorded_at` | lookup patient by `identifier` (via `find_patient`); `SELECT max(recorded_at)` over the patient's `vital_signs` (or a `recorded_at DESC` limit-1) for `last_reading_at` |
| `GET /api/patients/{identifier}/triage-events` | `triage_events` | `WHERE patient_id = :id ORDER BY occurred_at DESC, id DESC` |
| current reading (frontend) | existing US-03 endpoint | `GET /api/patients/{identifier}/readings?limit=1` — unchanged |

## Response: `PatientDetailResponse` (patient endpoint)

Pydantic model in `app/patients.py`. Built while the session is open; the internal `id` is never a
field, so it cannot leak.

| Field | Type | Notes |
|---|---|---|
| `identifier` | string | the patient code, e.g. `PAT-007` |
| `name` | string | synthetic name |
| `age` | integer | 0–130 |
| `sex` | string | `female` / `male` / `other` |
| `triage_level` | integer | current level 1–5 (passed through to the UI unchanged) |
| `status` | string | `active` / `discharged` |
| `admitted_at` | string (ISO 8601, UTC) | |
| `last_reading_at` | string (ISO 8601, UTC) **or null** | most recent `vital_signs.recorded_at`; `null` when the patient has no reading |

**Never present**: internal `id`, and **no `monitoring_status`** (scope change 2026-11-20).

## Response: `TriageEventResponse` and `TriageEventListResponse` (triage-events endpoint)

`TriageEventListResponse` = `{ "triage_events": [TriageEventResponse, …] }`, newest-first; `[]`
when the patient has no events (a registered patient always has the `initial` event).

| Field | Type | Notes |
|---|---|---|
| `occurred_at` | string (ISO 8601, UTC) | when the event happened |
| `previous_level` | integer **or null** | level before; `null`/absent for the `initial` event |
| `new_level` | integer | level after, 1–5 |
| `score` | integer **or null** | NEWS2 score at the event; `null` when the event had no reading |
| `reason` | string | which vitals/rules (or "Initial triage at registration") produced it |
| `source` | string | `initial` / `automatic` / `manual` |

**Never present**: internal `id`, `patient_id`, `created_by_id`.

## Current reading shape (reused, not redefined)

The current reading, its stored score, risk band and the per-parameter reason entries come from
the US-03 `ReadingResponse` in
[specs/017-vital-signs-scoring/contracts/readings-api.md](../017-vital-signs-scoring/contracts/readings-api.md).
`temperature` stays a one-decimal **string**; `score.band` is one of `low`, `low-medium`,
`medium`, `high`. US-05 reads these; it does not change or recompute them.

## Validation rules

- `identifier` must match `^[A-Z0-9-]{1,20}$` (reused `find_patient` / `PATIENT_CODE`); otherwise
  404 before any query. Unknown but well-formed code → 404.
- Both endpoints require a valid token (`Depends(get_current_user)`); otherwise 401 (existing
  shape). No role restriction (doctor and nurse may both read).
- A database error raises 503 with the fixed message `{"detail": "Service unavailable"}`, logged
  by error type only; no submitted value is logged or echoed.

## State / lifecycle

None introduced. The page is read-only: it creates/changes no patient, reading, score or triage
event, and it never changes a triage level (Principle V).
