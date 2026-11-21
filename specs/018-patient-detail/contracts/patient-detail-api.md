# Contract: Patient Detail API (US-05)

Two **read-only** endpoints under `/api`, added to the existing `app/patients.py` router.
`{identifier}` is the patient code (e.g. `PAT-007`). Both require authentication
(`Depends(get_current_user)`, any role) and reuse `find_patient` for code validation. Scores and
bands are never computed here; the frontend reads them from the existing readings endpoint.

Check order (both endpoints): 401 → 404 → 503 → 200. (Framework resolves the auth dependency
first, so a missing/invalid token is 401 before the code is looked at.)

---

## `GET /api/patients/{identifier}` — patient data

Returns the patient's own data plus the time of the most recent reading. **No `monitoring_status`;
no internal `id`.**

```http
GET /api/patients/PAT-007
Authorization: Bearer <access_token>
```

### 200 body (`PatientDetailResponse`)

```json
{
  "identifier": "PAT-007",
  "name": "Paciente de prueba",
  "age": 64,
  "sex": "male",
  "triage_level": 3,
  "status": "active",
  "admitted_at": "2026-11-20T14:00:00Z",
  "last_reading_at": "2026-11-20T15:05:00Z"
}
```

`last_reading_at` is `null` when the patient has no reading.

| Status | When | Body |
|---|---|---|
| 200 | Patient exists (any `status`) | `PatientDetailResponse` |
| 401 | No / invalid / expired token | `{"detail": "Not authenticated"}` + `WWW-Authenticate: Bearer` (TS-06) |
| 404 | Code not matching `^[A-Z0-9-]{1,20}$`, or no such patient | `{"detail": "Patient not found"}` |
| 503 | `DATABASE_URL` unset or a database error | `{"detail": "Service unavailable"}`; logged by error type only |

---

## `GET /api/patients/{identifier}/triage-events` — triage history

Returns the patient's triage events newest-first. **No internal `id` / `patient_id` / `created_by_id`.**

```http
GET /api/patients/PAT-007/triage-events
Authorization: Bearer <access_token>
```

### 200 body (`TriageEventListResponse`)

```json
{
  "triage_events": [
    {
      "occurred_at": "2026-11-20T15:05:00Z",
      "previous_level": 3,
      "new_level": 2,
      "score": 7,
      "reason": "NEWS2 7 (high): respiratory_rate 2, spo2 1, ...",
      "source": "manual"
    },
    {
      "occurred_at": "2026-11-20T14:00:00Z",
      "previous_level": null,
      "new_level": 3,
      "score": null,
      "reason": "Initial triage at registration",
      "source": "initial"
    }
  ]
}
```

Order: `occurred_at` desc, then `id` desc (stable newest-first). `previous_level` and `score` may
be `null`. `triage_events` is `[]` when the patient has none (a registered patient always has the
`initial` event).

| Status | When | Body |
|---|---|---|
| 200 | Patient exists (any `status`) | `TriageEventListResponse` (newest-first; `[]` when none) |
| 401 | No / invalid / expired token | `{"detail": "Not authenticated"}` + `WWW-Authenticate: Bearer` |
| 404 | Code not matching `^[A-Z0-9-]{1,20}$`, or no such patient | `{"detail": "Patient not found"}` |
| 503 | `DATABASE_URL` unset or a database error | `{"detail": "Service unavailable"}`; logged by error type only |

---

## Current reading (reused, not defined here)

The page reads the current reading, its stored score, risk band and per-parameter reason from the
existing US-03 endpoint, unchanged:

```http
GET /api/patients/PAT-007/readings?limit=1
```

Response shape: `{ "readings": [ReadingResponse] }` — see
[../../017-vital-signs-scoring/contracts/readings-api.md](../../017-vital-signs-scoring/contracts/readings-api.md).
`temperature` is a one-decimal string; `score.band` ∈ `low` / `low-medium` / `medium` / `high`.
NEWS2 is never recomputed.

## Security notes

- No submitted value is ever echoed in a 404/503 body or a log line.
- Responses omit every internal key (`id`, `patient_id`, `created_by_id`).
- Both endpoints are safe GETs; they mutate nothing.
