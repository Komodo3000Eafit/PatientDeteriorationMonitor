# Contract: Readings API (US-03)

`POST` and `GET /api/patients/{identifier}/readings`. `{identifier}` is the **patient code**
(`PAT-001`). Clinical endpoints: `Depends(get_current_user)`; POST also requires `role = nurse`.

**Field names in this file are shared with US-02, US-04 and US-05; they are the contract.**

## Reading object (`ReadingResponse`)

Used by POST (the body) and GET (each item of `readings`).

```json
{
  "recorded_at": "2026-11-20T15:04:05.123456Z",
  "respiratory_rate": 22,
  "spo2": 95,
  "on_oxygen": false,
  "systolic_bp": 118,
  "heart_rate": 96,
  "consciousness": "A",
  "temperature": "38.4",
  "score": {
    "system": "NEWS2",
    "total": 5,
    "band": "medium",
    "entries": [
      { "parameter": "respiratory_rate", "value": 22,    "points": 2, "low": 21,    "high": 24,    "category": [] },
      { "parameter": "spo2",             "value": 95,    "points": 1, "low": 94,    "high": 95,    "category": [] },
      { "parameter": "on_oxygen",        "value": false, "points": 0, "low": null,  "high": null,  "category": [false] },
      { "parameter": "systolic_bp",      "value": 118,   "points": 0, "low": 111,   "high": 219,   "category": [] },
      { "parameter": "heart_rate",       "value": 96,    "points": 1, "low": 91,    "high": 110,   "category": [] },
      { "parameter": "consciousness",    "value": "A",   "points": 0, "low": null,  "high": null,  "category": ["A"] },
      { "parameter": "temperature",      "value": "38.4","points": 1, "low": "38.1","high": "39.0","category": [] }
    ]
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `recorded_at` | string (ISO 8601, UTC) | Set by the server when saved |
| `respiratory_rate`, `spo2`, `systolic_bp`, `heart_rate` | integer | |
| `on_oxygen` | boolean | |
| `consciousness` | string | `A`, `C`, `V`, `P` or `U` |
| `temperature` | **string**, one decimal | e.g. `"37.0"`; strings avoid float rounding |
| `score.system` | string | `NEWS2` |
| `score.total` | integer ≥ 0 | The NEWS2 score |
| `score.band` | string | `low`, `low-medium`, `medium`, `high` (the risk band) |
| `score.entries` | array of 7 | In this parameter order; keys as in [data-model.md](../data-model.md) |

Never returned: `id`, `patient_id`, `vital_sign_id`, the score `id`, the patient code (it is in
the address).

## `POST /api/patients/{identifier}/readings` — enter a reading (nurses)

```http
POST /api/patients/PAT-001/readings
Authorization: Bearer <access_token>
Content-Type: application/json

{ "respiratory_rate": 22, "spo2": 95, "on_oxygen": false, "systolic_bp": 118,
  "heart_rate": 96, "consciousness": "A", "temperature": 38.4 }
```

| Field | Type | Rule (from `ACCEPTED_LIMITS`, single source) |
|---|---|---|
| `respiratory_rate` | integer | 0–80; strict (no `"18"`, `18.0`, `true`) |
| `spo2` | integer | 0–100 |
| `on_oxygen` | boolean | `true` / `false` only |
| `systolic_bp` | integer | 0–300 |
| `heart_rate` | integer | 0–300 |
| `consciousness` | string | `A`, `C`, `V`, `P`, `U` |
| `temperature` | number | 25.0–45.0, at most one decimal (`37` → stored `37.0`) |
| *(any other field)* | — | Not allowed → 422 `unknown` (includes `recorded_at`, `score`, `identifier`) |

Check order: 401 → 403 → 404 → 409 → 422 → 201. A body that is not a JSON object is a 422
from the framework (existing handler). Nothing is stored on any error.

| Status | When | Body |
|---|---|---|
| 201 | Saved and scored | One reading object |
| 401 | No / invalid / expired token | `{"detail": "Not authenticated"}` + `WWW-Authenticate: Bearer` (TS-06) |
| 403 | Signed in, role ≠ `nurse` | `{"detail": "Only nurses can record vital signs"}` |
| 404 | Code not matching `^[A-Z0-9-]{1,20}$`, or no such patient | `{"detail": "Patient not found"}` |
| 409 | Patient `status = discharged` | `{"detail": "Patient is discharged"}` |
| 422 | Vital-sign problems | `{"detail": [{"type": "<reason>", "loc": ["body", "<parameter or cleaned unknown key>"], "msg": "Invalid value"}, …]}` — `<reason>` ∈ `missing`, `unknown`, `wrong_type`, `out_of_range`, `too_many_decimals`, `not_allowed`; no `input`, no values |
| 503 | `DATABASE_URL` unset or a database error | `{"detail": "Service unavailable"}`; logged by error type only |

## `GET /api/patients/{identifier}/readings?limit=50` — reading history (signed-in users)

| Query | Rule |
|---|---|
| `limit` | Optional integer 1–200, default 50; otherwise 422 (existing handler, no `input`) |

| Status | When | Body |
|---|---|---|
| 200 | Patient exists (any `status`) | `{"readings": [reading, …]}` newest first (`recorded_at` desc, then later saved first); `[]` when none |
| 401 | Not signed in | as above |
| 404 | Unknown code or bad format | `{"detail": "Patient not found"}` |
| 422 | `limit` invalid | existing handler shape |
| 503 | Database unavailable | `{"detail": "Service unavailable"}` |

Scores are read from storage, never recomputed.
