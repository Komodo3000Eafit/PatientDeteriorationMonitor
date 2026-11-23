# Contract: Readings export API (US-10)

`GET /api/patients/{identifier}/readings/export`: every stored reading of one patient, with its
stored score, **oldest first**. `{identifier}` is the patient code (`PAT-001`). This is a read-only
JSON endpoint used by the browser to build the CSV; it does not return CSV text.

Module: `backend/app/readings_export_api.py` (new, owned by US-10), registered in `app/main.py`
with `app.include_router(readings_export_api.router, prefix="/api")`. It imports `find_patient`,
`get_session` (`app/patients.py`) and `to_response`, `ReadingResponse` (`app/readings_api.py`)
without changing them. **The file must not contain the word "news2" in any case**
(`test_news2_confined`).

## Request

```http
GET /api/patients/PAT-001/readings/export
Authorization: Bearer <access_token>
```

No query parameters and no body. Any signed-in user (doctor or nurse), and a patient with any
`status`.

## Responses

| Status | When | Body |
|---|---|---|
| 200 | Patient exists | `{"readings": [reading, …]}`, **every** reading, `recorded_at` ascending then `vital_signs.id` ascending; `[]` when none |
| 401 | No / invalid / expired token | `{"detail": "Not authenticated"}` + `WWW-Authenticate: Bearer` (TS-06) |
| 404 | Code not matching `^[A-Z0-9-]{1,20}$` (no query) or no such patient | `{"detail": "Patient not found"}` |
| 503 | `DATABASE_URL` unset or a database error | `{"detail": "Service unavailable"}`; logged by error type only |

Check order: 401 → 404 → 200/503.

`reading` is exactly the reading object of
[readings-api.md](../../017-vital-signs-scoring/contracts/readings-api.md) (`recorded_at`, the
seven vital signs, `temperature` as a one-decimal string, and `score` with `system`, `total`,
`band` and `entries`). It never includes `id`, `patient_id`, `vital_sign_id`, the score `id` or the
patient code. Scores are read from `reading_scores`, never recomputed. There is no limit or
pagination (research R6).

```json
{
  "readings": [
    {
      "recorded_at": "2026-11-22T08:00:00Z",
      "respiratory_rate": 18, "spo2": 97, "on_oxygen": false, "systolic_bp": 120,
      "heart_rate": 80, "consciousness": "A", "temperature": "37.0",
      "score": { "system": "…", "total": 0, "band": "low", "entries": [ … ] }
    },
    {
      "recorded_at": "2026-11-22T08:05:00Z",
      "respiratory_rate": 22, "spo2": 95, "on_oxygen": false, "systolic_bp": 118,
      "heart_rate": 96, "consciousness": "A", "temperature": "38.4",
      "score": { "system": "…", "total": 5, "band": "medium", "entries": [ … ] }
    }
  ]
}
```

## Unchanged

`GET /api/patients/{identifier}/readings` (newest first, `limit` 1–200) and `POST` are not
modified. The two paths don't conflict: `/readings` and `/readings/export` are distinct routes, and
`export` can never be a reading id because no reading-by-id route exists.
