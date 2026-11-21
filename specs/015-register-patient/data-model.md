# Data Model: Register Patient (US-01)

No migration. Both tables exist since TS-03 (`backend/app/models.py`); this story only writes rows.

## Patient (`patients`) — one row per registration

| Field | Set by | Value at registration | Rule |
|---|---|---|---|
| `id` (patient_id) | database | identity | Never returned by the API |
| `identifier` (patient code) | system | `PAT-NNN`, next after the highest `PAT-<digits>`, minimum `PAT-007` | Unique; never `PAT-001`–`PAT-006`; never sent by the client (research R5) |
| `name` | nurse | trimmed text, 1–100 chars | Fictitious; UI says "do not use real data" |
| `age` | nurse | whole number 0–130 | Strict integer (CHECK `age BETWEEN 0 AND 130`) |
| `sex` | nurse | `female` \| `male` \| `other` | CHECK constraint |
| `triage_level` | nurse | whole number 1–5 (Triage I–V) | Copied from the triage already done by a clinician; no default |
| `admitted_at` | system | registration time `now` (UTC) | Same value as the event's `occurred_at` |
| `status` | system | `active` | So the simulator monitors it |

## TriageEvent (`triage_events`) — exactly one per registration, same transaction

| Field | Value |
|---|---|
| `patient_id` | the new patient |
| `occurred_at` | `now` (equal to `admitted_at`) |
| `previous_level` | empty (NULL) |
| `new_level` | the patient's `triage_level` |
| `score` | empty (NULL): no reading exists yet |
| `reason` | `"Initial triage at registration"` (fixed English text) |
| `source` | `initial` |
| `created_by_id` | the signed-in nurse (`users.id`) |

## User (`users`) — read only

Only `id` (for `created_by_id`) and `role` (must be `nurse`) are used.

## State

A registered patient starts `active`. This story adds no other transition (discharge is out of scope).

## Registration flow (all or nothing)

```text
validate body (422) ─ check sign-in (401) ─ check role nurse (403)
   │                       (dependencies run first, so 401/403 win over 422)
   ▼
code = next_patient_code() ─▶ add Patient + flush ─▶ add initial TriageEvent ─▶ commit
                                            │ IntegrityError (code taken)
                                            ▼
                         rollback ─▶ code = next_patient_code() ─▶ try once more
                                            │ IntegrityError again
                                            ▼
                                  rollback ─▶ 409, nothing stored
```
