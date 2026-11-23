# Contract: Deterioration Prediction API (US-08)

## `GET /api/patients/{identifier}/prediction`

Read-only. Computed on each request from stored scores; writes nothing. Module `app/prediction_api.py`, registered in `app/main.py` with `app.include_router(prediction_api.router, prefix="/api")`.

**Auth**: `Authorization: Bearer <token>`, any signed-in clinician (doctor or nurse).

**Path**: `identifier` = patient code (`PAT-` + digits). Any patient status (`active` or `discharged`) gets the same answer.

### 200 OK

```json
{
  "rising": true,
  "reason": null,
  "readings": [
    { "total": 2, "recorded_at": "2026-11-23T10:00:00Z" },
    { "total": 4, "recorded_at": "2026-11-23T10:05:00Z" },
    { "total": 6, "recorded_at": "2026-11-23T10:10:00Z" }
  ],
  "latest_band": "medium"
}
```

| Field | Type | Notes |
|---|---|---|
| `rising` | boolean | true = a deterioration is predicted |
| `reason` | string or null | `null` when `rising`; else `not_enough_readings`, `missing_score` or `not_rising` (first that applies) |
| `readings` | array (0–3) | oldest first; `total` is an integer or `null` (no stored score) |
| `latest_band` | string or null | `low`, `low-medium`, `medium`, `high`, or `null` (no readings, or newest reading has no score) |

Other examples:

- No readings: `{"rising": false, "reason": "not_enough_readings", "readings": [], "latest_band": null}`
- `3, 3, 3`: `{"rising": false, "reason": "not_rising", "readings": [...3 items], "latest_band": "low-medium"}`
- Middle reading with no score: `{"rising": false, "reason": "missing_score", "readings": [{"total": 2, ...}, {"total": null, ...}, {"total": 5, ...}], "latest_band": "low-medium"}`

The response never contains `patient_id`, reading or score ids, user ids, vital-sign values or explanation entries.

### Errors

| Status | Body `detail` | When |
|---|---|---|
| 401 | existing auth message | no or invalid token |
| 404 | `"Patient not found"` | unknown code or code not in the patient code format (`find_patient`) |
| 503 | `"Service unavailable"` | database error; logged as the error type name only |

No request body, no query parameters.
