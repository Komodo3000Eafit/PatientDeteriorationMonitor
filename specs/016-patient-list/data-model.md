# Data Model: Patient List (US-02)

No migration and no write: this story only reads existing tables.

## Read from

| Table (story) | Fields used | Rule |
|---|---|---|
| `patients` (TS-03) | `id` (join only), `identifier`, `name`, `age`, `sex`, `triage_level`, `admitted_at`, `status` | Only `status = 'active'` |
| `vital_signs` (TS-03/US-03) | `id`, `patient_id`, `recorded_at` | Latest per patient: max `recorded_at`, ties by max `id` |
| `reading_scores` (US-03, D-50) | `vital_sign_id`, `total`, `band` | Read as stored; never recomputed |

## Patient list entry (response item)

| Field | Type | Source |
|---|---|---|
| `identifier` | string (patient code) | `patients.identifier` |
| `name` | string | `patients.name` |
| `age` | integer | `patients.age` |
| `sex` | `female` \| `male` \| `other` | `patients.sex` |
| `triage_level` | integer 1–5 | `patients.triage_level` |
| `admitted_at` | ISO 8601 string | `patients.admitted_at` |
| `latest_score` | object or `null` | `null` when the patient has no reading |
| `latest_score.recorded_at` | ISO 8601 string | `vital_signs.recorded_at` of the latest reading |
| `latest_score.total` | integer ≥ 0 (NEWS2 score) | `reading_scores.total` |
| `latest_score.band` | `low` \| `low-medium` \| `medium` \| `high` (risk band) | `reading_scores.band` |

Never returned: `id`, `patient_id`, `vital_sign_id`, score `id`, `status`, `system`, `entries`.

## Order (AC3, computed in the same query)

1. Patients with a latest score before patients without one.
2. `latest_score.total` descending.
3. `triage_level` ascending (1 = Triage I first).
4. `identifier` ascending.

## Page state (frontend, `usePatientList`)

| State | Meaning | Shown |
|---|---|---|
| `loading` | first request in flight, no list yet | loading text |
| `error` | first request failed, no list yet | first-load error text (retries every 15 s) |
| `ok` + `patients = []` | answer with no active patients | empty-state text + last update |
| `ok` + `patients = [...]` | list shown | table + last update |
| `ok` + `refreshFailed` | a later refresh failed | last list + last update + refresh-error alert |

Transitions: any successful answer → `ok` (clears `refreshFailed`); a failed answer with a list →
`refreshFailed = true`; a failed answer without a list → `error`; 401 → session-expiry handling
(redirect to `/login`, page unmounts, timer cleared).
