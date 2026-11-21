# Contract: Re-triage Suggestion API (US-04)

Three routes under `/api` (D-44), in a new router `app/retriage_api.py`. `{identifier}` is the
**patient code** (`PAT-001`); `{alert_id}` is the integer `alerts.id`. All routes:
`Depends(get_current_user)`; accept and dismiss additionally require `role = doctor`. Scores and
bands are read from storage, never recomputed (FR-010). Error messages are fixed and never echo a
submitted value or an internal id (FR-011).

## Suggestion object (`SuggestionResponse`)

Each item of the read response, and the body returned by accept/dismiss.

```json
{
  "id": 42,
  "severity": "high",
  "message": "Risk is high. Suggest re-triage from Triage III to Triage I.",
  "reason": "respiratory_rate +3, spo2 +3, temperature +1",
  "current_level": 3,
  "suggested_level": 1,
  "status": "open",
  "created_at": "2026-11-21T15:04:05.123456Z"
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | integer | `alerts.id`; used in the accept/dismiss address |
| `severity` | string | `medium` or `high` (alert severity, mapped from the raising band) |
| `message` | string | Fixed-shape human text, returned already stripped of the internal `[retriage band=…;suggested=…]` tag (see data-model.md §"Message/reason shape"); the tag is never sent to the client |
| `reason` | string | Vital signs and points that produced the score (from the stored entries) |
| `current_level` | integer 1–5 | The patient's triage level when the suggestion is shown |
| `suggested_level` | integer 1–5 | The more urgent level suggested (always < `current_level` at creation) |
| `status` | string | `open` or `acknowledged` |
| `created_at` | string (ISO 8601, UTC) | When the suggestion was raised |

Never returned: `patient_id`, `acknowledged_by_id`, the raising-band machine tag, any internal id
other than `id`.

## `GET /api/patients/{identifier}/suggestions` — list suggestions (any signed-in clinician)

| Status | When | Body |
|---|---|---|
| 200 | Patient exists (any `status`) | `{"suggestions": [SuggestionResponse, …]}` newest first (`created_at` desc, then `id` desc); `[]` when none |
| 401 | No / invalid / expired token | `{"detail": "Not authenticated"}` + `WWW-Authenticate: Bearer` |
| 404 | Code not matching `^[A-Z0-9-]{1,20}$`, or no such patient | `{"detail": "Patient not found"}` |
| 503 | `DATABASE_URL` unset or a database error | `{"detail": "Service unavailable"}`; logged by error type only |

## `POST /api/patients/{identifier}/suggestions/{alert_id}/accept` — accept (doctors)

Sets the patient's `triage_level` to `suggested_level`, writes one `triage_event`
(`source = 'manual'`, `previous_level` = the level before, `new_level` = `suggested_level`,
`created_by_id` = the doctor, `occurred_at` = server time, `reason` = the accepted suggestion), and
sets the alert `acknowledged`. All in one transaction.

Check order: 401 → 403 → 404 → 409 → 200. Nothing is stored on any error.

| Status | When | Body |
|---|---|---|
| 200 | Accepted | The updated `SuggestionResponse` (`status` = `acknowledged`, `current_level` = the new level) |
| 401 | Not signed in | `{"detail": "Not authenticated"}` + `WWW-Authenticate: Bearer` |
| 403 | Signed in, role ≠ `doctor` | `{"detail": "Only doctors can change the triage level"}` |
| 404 | Unknown/malformed patient code, or no such open-or-acknowledged alert for this patient | `{"detail": "Suggestion not found"}` |
| 409 | Alert already `acknowledged`, or patient `status = discharged` | `{"detail": "Suggestion already handled"}` / `{"detail": "Patient is discharged"}` |
| 503 | Database unavailable | `{"detail": "Service unavailable"}` |

## `POST /api/patients/{identifier}/suggestions/{alert_id}/dismiss` — dismiss (doctors)

Sets the alert `acknowledged` (`acknowledged_by_id`, `acknowledged_at`). No level change, no
triage event.

Check order: 401 → 403 → 404 → 409 → 200. Nothing is stored on any error.

| Status | When | Body |
|---|---|---|
| 200 | Dismissed | The updated `SuggestionResponse` (`status` = `acknowledged`, `current_level` unchanged) |
| 401 | Not signed in | as above |
| 403 | Signed in, role ≠ `doctor` | `{"detail": "Only doctors can change the triage level"}` |
| 404 | Unknown/malformed code, or no such alert for this patient | `{"detail": "Suggestion not found"}` |
| 409 | Alert already `acknowledged` | `{"detail": "Suggestion already handled"}` |
| 503 | Database unavailable | `{"detail": "Service unavailable"}` |

## Creation (not an endpoint)

A suggestion is created inside `record_reading` (US-03) through `evaluate_retriage`, not by any
request in this contract. Rules:

- Only when a **previous** stored reading exists and the new stored band is strictly more urgent
  (`low < low-medium < medium < high`) **and** the new band is `medium` or `high`.
- Only when the patient is `active` and the suggested level (`current − step`, clamped at 1) is
  strictly more urgent than the current level.
- `medium` → severity `medium`, −1 level; `high` → severity `high`, −2 levels.
- Not when a blocking open suggestion already exists (a new one is created only if the new band is
  strictly more urgent than the open alert's recorded raising band).
- Never changes `triage_level`, never writes a `source = 'automatic'` event.
