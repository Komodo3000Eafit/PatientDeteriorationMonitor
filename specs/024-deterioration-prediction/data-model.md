# Data Model: Deterioration Prediction (US-08)

No new table, column or migration. Everything is read-only.

## Read (existing tables)

| Table | Columns used | Use |
|---|---|---|
| `patients` | `id`, `identifier` | found by patient code via `find_patient`; never updated |
| `vital_signs` | `id`, `patient_id`, `recorded_at` | ordering: `recorded_at DESC, id DESC`, `LIMIT 3` |
| `reading_scores` | `vital_sign_id`, `total`, `band` | the stored score of each reading (US-03); outer-joined, so a reading with no score gives `total = null`, `band = null` |

## Computed (not stored): deterioration prediction

| Field | Type | Rule |
|---|---|---|
| `rising` | bool | true only when there are 3 readings, all with a score, and `t1 < t2 < t3` (oldest to newest) |
| `reason` | `null` \| `"not_enough_readings"` \| `"missing_score"` \| `"not_rising"` | `null` when `rising`; otherwise the first that applies, in this order |
| `readings` | list of 0–3 `{total: int \| null, recorded_at: datetime}` | the readings used, **oldest first** |
| `latest_band` | `"low"` \| `"low-medium"` \| `"medium"` \| `"high"` \| `null` | band of the newest reading; `null` when there are no readings or it has no score |

Not included: patient id, reading ids, score ids, user ids, vital-sign values, explanation entries.

## Rule (pure function, `app/prediction.py`)

```text
is_rising(totals) = len(totals) == 3 and totals[0] < totals[1] < totals[2]

predict(totals) ->
  len(totals) < 3          -> (False, "not_enough_readings")
  any total is None        -> (False, "missing_score")
  is_rising(totals)        -> (True,  None)
  otherwise                -> (False, "not_rising")
```

The band and the patient status are not inputs (Clarifications 2026-11-23).

## State transitions

None. The prediction has no lifecycle; it is recomputed on every request.
