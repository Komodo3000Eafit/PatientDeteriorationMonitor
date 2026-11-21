# Data Model: Re-triage Suggestion Alerts (US-04)

No new table and **no migration** (FR-017). This story reads `reading_scores`, reads/updates
`patients`, and reads/writes `alerts` and `triage_events`, all defined by TS-03 and US-03. Column
names are the glossary's shared vocabulary (D-40).

## Tables used

### `alerts` (read + write) — the re-triage suggestion

Existing columns (TS-03 `models.py`), used as follows:

| Column | Use in this story |
|---|---|
| `id` | Alert identity; path parameter for accept/dismiss (`{alert_id}`) |
| `patient_id` | The patient the suggestion is for |
| `created_at` | Server default; read for newest-first ordering |
| `severity` | `medium` or `high`, from `BAND_SEVERITY[band]` (never `low` in this story) |
| `message` | Fixed-shape text naming the raising band, current level and suggested level, plus a machine tag recording the raising band and suggested level that the API strips before display (see "Message/reason shape") |
| `status` | `open` on creation; `acknowledged` after accept or dismiss |
| `acknowledged_by_id` | The acting doctor on accept/dismiss (else null) |
| `acknowledged_at` | Server time on accept/dismiss (else null) |

No column is added; the `CheckConstraint`s (`severity IN ('low','medium','high')`,
`status IN ('open','acknowledged')`) already allow every value this story writes.

### `triage_events` (write, only on accept) — the manual re-triage

| Column | Value on accept |
|---|---|
| `patient_id` | The patient |
| `occurred_at` | Server save time |
| `previous_level` | The patient's `triage_level` before accept |
| `new_level` | The suggested level |
| `score` | `NULL` — the manual re-triage records the clinician's decision, not a score; the triggering NEWS2 total is already visible in the suggestion's reason (matches US-01's initial event, which stores `score = NULL`) |
| `reason` | Fixed text recording the accepted suggestion and the vitals/points |
| `source` | `manual` (never `automatic`, FR-005) |
| `created_by_id` | The acting doctor |

### `reading_scores` (read only) — the stored band

Read `band` (and `total`/`entries` for the reason) of the triggering reading and of the patient's
previous reading. **Never recomputed** (FR-010). Shape in
`specs/017-vital-signs-scoring/contracts/readings-api.md`.

### `patients` (read + update)

`triage_level` read to compute the suggested level, updated only on accept. `status` gates
creation (no suggestion when `discharged`) and accept (409 when `discharged`).

## Band order and mappings (`app/retriage.py`)

```
BAND_ORDER   = {"low": 0, "low-medium": 1, "medium": 2, "high": 3}
BAND_SEVERITY = {"medium": "medium", "high": "high"}   # low / low-medium never suggest
BAND_STEP     = {"medium": 1, "high": 2}
suggested_level(current, band) = max(1, current - BAND_STEP[band])
```

A reading raises a suggestion when a **previous stored reading exists**, the new band is strictly
more urgent (`BAND_ORDER[new] > BAND_ORDER[prev]`), the new band is in `BAND_SEVERITY`, the patient
is `active`, and the suggested level is strictly more urgent than the current level (so a patient
already at Triage I is skipped).

## Message/reason shape

`message` and `reason` are fixed-shape, value-safe text (no submitted values, no internal ids).
The raising band and the suggested level are recorded in a **canonical leading tag** on `message`:

```
[retriage band=<band>;suggested=<n>] <human sentence>
```

- `<band>` is one of `medium`, `high`; `<n>` is the suggested level `1`–`5`.
- Parse it with `^\[retriage band=(?P<band>medium|high);suggested=(?P<n>[1-5])\]\s*(?P<human>.*)$`.
  `read_tag(message)` returns `(band, int(n))` on a match, else `None`.
- The `<human sentence>` is a fixed form naming the band, the current level and the suggested level
  ("Risk is high. Suggest re-triage from Triage III to Triage I."). The literal token "NEWS2" is
  deliberately kept out of this sentence so the Principle V scoring-confinement guard
  (`test_news2_confined`) stays green; the band word ("high") already conveys the risk.
- The `reason` lists the vital signs and points from the triggering reading's stored explanation
  `entries` (e.g. "Respiratory rate +3, SpO2 +3, temperature +1").
- The API's `to_response` returns only `<human sentence>` (the `[retriage …]` tag is stripped and
  never sent to the client); the backend re-parses the tag only for the no-duplicate comparison
  (R4, R5).
- The tag holds only **derived** data (the band and the computed suggested level), so it is not a
  submitted value or an internal id and does not violate FR-004/FR-011.

## State transitions

```
Reading saved (active patient)
  └─ band crosses up into medium/high, no blocking open suggestion
        └─ alerts row: status=open, severity, message(+tag), reason
Open suggestion
  ├─ doctor Accept  → patient.triage_level = suggested; triage_events(source=manual); alert.status=acknowledged
  ├─ doctor Dismiss → alert.status=acknowledged (no level change, no triage event)
  └─ a later reading crossing strictly higher → a new open suggestion (the old stays as history)
Acknowledged suggestion
  └─ Accept/Dismiss → 409 (already acknowledged); no change
```

## Write/read flows

- **Create (in `record_reading` → `evaluate_retriage`)**: read the previous reading's band; if a
  suggestion is warranted and no blocking open suggestion exists, add one `alerts` row in the
  caller's transaction. All-or-nothing with the reading and its score (AC12).
- **Read (`GET /suggestions`)**: select the patient's suggestion alerts newest first; return
  severity, the human message, reason, current level, suggested level and status; any signed-in
  clinician; 404 for an unknown/malformed code; works for discharged patients.
- **Accept (`POST .../accept`)**: doctor only; load the open alert for the patient; 404 if missing,
  409 if already acknowledged or patient discharged; in one transaction set `triage_level`, add the
  `manual` triage event, set the alert acknowledged; one commit.
- **Dismiss (`POST .../dismiss`)**: doctor only; 404 if missing, 409 if already acknowledged; set
  the alert acknowledged; one commit; no level change, no triage event.

## Invariants

- Creating a suggestion never changes `triage_level` and never writes a `source = 'automatic'`
  event (FR-005, AC2).
- At most one open suggestion per patient per urgency (FR-006, AC4).
- The suggested level is never below 1 (Triage I) and is strictly more urgent than the current
  level (AC5).
- Every suggestion carries the vitals and points that produced it (AC19).
