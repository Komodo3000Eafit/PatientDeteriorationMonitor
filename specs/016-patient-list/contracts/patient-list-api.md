# Contract: `GET /api/patients` (US-02)

List the active patients with their latest stored score, ordered so the patient who needs
attention first comes first. Clinical endpoint: `Depends(get_current_user)`; any role (doctor or
nurse). `POST /api/patients` (US-01) is unchanged and lives in another router on the same path.

Field names reuse [specs/017-vital-signs-scoring/contracts/readings-api.md](../../017-vital-signs-scoring/contracts/readings-api.md)
(`recorded_at`, `total`, `band`) and the US-01 patient fields.

## Request

```http
GET /api/patients
Authorization: Bearer <access_token>
```

No query parameters (filters and sorting are US-09).

## 200 OK

```json
{
  "patients": [
    {
      "identifier": "PAT-005",
      "name": "Paciente Demo Cinco",
      "age": 72,
      "sex": "male",
      "triage_level": 3,
      "admitted_at": "2026-11-20T14:00:00Z",
      "latest_score": { "recorded_at": "2026-11-21T09:15:00Z", "total": 7, "band": "high" }
    },
    {
      "identifier": "PAT-007",
      "name": "Paciente Ficticio Siete",
      "age": 40,
      "sex": "other",
      "triage_level": 2,
      "admitted_at": "2026-11-21T09:10:00Z",
      "latest_score": null
    }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `identifier` | string | Patient code |
| `name`, `age`, `sex`, `triage_level`, `admitted_at` | as in US-01 | |
| `latest_score` | object \| `null` | `null` = the patient has no reading |
| `latest_score.recorded_at` | string (ISO 8601, UTC) | Of the most recent reading (ties: most recently saved) |
| `latest_score.total` | integer ≥ 0 | NEWS2 score, as stored (D-50) |
| `latest_score.band` | string | `low`, `low-medium`, `medium`, `high`, as stored |

- Only `status = 'active'` patients.
- Order: patients with a score first; `total` descending; `triage_level` ascending; `identifier`
  ascending. Patients without readings last, by `triage_level` then `identifier`.
- One database query builds the whole answer.
- Never returned: `id`, `patient_id`, `vital_sign_id`, score `id`, `status`, `system`, `entries`.
- An empty list is `{"patients": []}` with 200.

## Errors (fixed messages)

| Status | When | Body |
|---|---|---|
| 401 | No / invalid / expired token, unknown user | `{"detail": "Not authenticated"}` + `WWW-Authenticate: Bearer` (TS-06) |
| 503 | `DATABASE_URL` unset, or a database error | `{"detail": "Service unavailable"}`; logged by error type only |
