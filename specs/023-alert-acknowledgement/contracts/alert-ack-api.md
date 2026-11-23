# Contract: Alert Acknowledgement API (US-07)

Module `app/alert_ack_api.py`, registered in `app/main.py` with `app.include_router(alert_ack_api.router, prefix="/api")`. Path `identifier` = patient code (`PAT-` + digits). Any patient status (`active` or `discharged`) behaves the same.

## Response body (both routes)

```json
{
  "alert": {
    "id": 42,
    "status": "open",
    "state": "seen",
    "by": "Laura Gómez",
    "at": "2026-11-23T10:12:00Z"
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `alert` | object or null | the **shown alert**: newest open alert, else newest alert; `null` when the patient has no alert |
| `alert.id` | integer | alert id |
| `alert.status` | string | `open` or `acknowledged` |
| `alert.state` | string | `not_seen` (open, no person), `seen` (open, person stored), `handled` (acknowledged) |
| `alert.by` | string or null | full name of the person who saw (nurse) or handled (doctor) it |
| `alert.at` | datetime or null | when it was seen or handled |

Other examples: no alert `{"alert": null}`; open, not seen `{"alert": {"id": 42, "status": "open", "state": "not_seen", "by": null, "at": null}}`; handled `{"alert": {"id": 42, "status": "acknowledged", "state": "handled", "by": "Dr. Andrés Ruiz", "at": "…"}}`.

The response never contains `acknowledged_by_id` or any user id, username, `patient_id`, `severity` or `message` (so never the machine tag).

## `GET /api/patients/{identifier}/alerts/acknowledgement`

Read-only, writes nothing. **Auth**: any signed-in clinician (doctor or nurse).

| Status | Body `detail` | When |
|---|---|---|
| 200 | body above | patient found (with or without alerts) |
| 401 | existing auth message | no or invalid token |
| 404 | `"Patient not found"` | unknown code or code not in the patient code format (`find_patient`) |
| 503 | `"Service unavailable"` | database error; logged as the error type name only |

## `POST /api/patients/{identifier}/alerts/{alert_id}/seen`

Marks the alert as seen by the signed-in nurse: sets `acknowledged_by_id` and `acknowledged_at`, keeps `status = 'open'`. No request body. Answers 200 with the body above for the shown alert after the change (normally this alert, `state: "seen"`).

**Auth**: nurses only, via a local dependency in `alert_ack_api.py` (not `patients.require_nurse`).

Checks, in this order:

| Status | Body `detail` | When |
|---|---|---|
| 401 | existing auth message | no or invalid token |
| 403 | `"Only nurses can mark alerts as seen"` | signed in, role is not `nurse` (doctors included) |
| 404 | `"Patient not found"` | unknown or malformed patient code (`find_patient`) |
| 404 | `"Alert not found"` | no alert with this id, or it belongs to another patient |
| 409 | `"Alert already handled"` | alert is `acknowledged`, or already has a stored person (first nurse wins); decided by one conditional `UPDATE` scoped by alert id **and** `patient_id` |
| 200 | body above | marker stored |
| 503 | `"Service unavailable"` | database error; rolled back, logged as the error type name only |

On every non-200 answer nothing is stored. The triage level, triage events, the alert's `status`, `severity`, `message` and `created_at`, and the number of alert rows never change.

## Interaction with US-04 (unchanged code)

- `GET …/suggestions` and `GET /api/suggestions` still list a seen alert as open.
- `POST …/suggestions/{id}/accept` and `…/dismiss` still work on a seen alert; they set `status = 'acknowledged'` and overwrite `acknowledged_by_id` / `acknowledged_at` with the doctor and the time of the action (accepted, D-56).
