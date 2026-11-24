# Data Model: Alert Acknowledgement (US-07)

No new table, column or migration.

## Existing tables

| Table | Columns used | Use |
|---|---|---|
| `patients` | `id`, `identifier` | found by patient code via `find_patient`; never updated |
| `alerts` | `id`, `patient_id`, `created_at`, `status`, `acknowledged_by_id`, `acknowledged_at` | read for the shown alert; **written** by the mark only: `acknowledged_by_id`, `acknowledged_at` |
| `users` | `id`, `full_name` | outer-joined on `alerts.acknowledged_by_id` to show who saw / handled the alert |

`alerts.severity`, `alerts.message` (with its machine tag), `alerts.status` and `alerts.created_at` are never written by this story. No row is ever added.

## Alert marker states

| `status` | `acknowledged_by_id` | Derived `state` | Shown |
|---|---|---|---|
| `open` | null | `not_seen` | nurse: "Marcar como visto" button; doctor: nothing |
| `open` | nurse id | `seen` | "Visto por {full_name}, {time}" |
| `acknowledged` | doctor id | `handled` | "Atendida por {full_name}, {time}" |
| `acknowledged` | null (not produced by US-04) | `handled` | "Atendida" |

## Transitions

```text
open / not_seen --(nurse POST …/seen, US-07)--------------> open / seen      (stores nurse + time)
open / not_seen --(doctor accept or dismiss, US-04)-------> acknowledged     (stores doctor + time)
open / seen     --(doctor accept or dismiss, US-04)-------> acknowledged     (overwrites nurse with doctor + time, D-56)
open / seen     --(any nurse POST …/seen)-----------------> 409, unchanged   (first nurse wins)
acknowledged    --(any nurse POST …/seen)-----------------> 409, unchanged
```

The mark is one conditional `UPDATE … WHERE id = :id AND patient_id = :pid AND status = 'open' AND acknowledged_by_id IS NULL`; 0 rows → 409 (an alert of another patient is already 404 from the lookup).

## Shown alert (selection)

For one patient: open alerts first, then `created_at DESC`, then `id DESC`; `LIMIT 1`. So the newest open alert, or the newest alert when none is open; none → `alert: null`.

## Computed (not stored): acknowledgement state

| Field | Type | Rule |
|---|---|---|
| `alert` | object or `null` | `null` when the patient has no alert |
| `alert.id` | int | alert id (needed for the POST path; already exposed by US-04) |
| `alert.status` | `"open"` \| `"acknowledged"` | as stored |
| `alert.state` | `"not_seen"` \| `"seen"` \| `"handled"` | table above |
| `alert.by` | string or `null` | `users.full_name` of the stored person |
| `alert.at` | datetime (UTC, ISO 8601) or `null` | `alerts.acknowledged_at` |

Not included: `acknowledged_by_id` or any user id, username, `patient_id`, `severity`, `message` / machine tag.
