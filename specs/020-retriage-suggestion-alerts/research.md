# Research: Re-triage Suggestion Alerts (US-04)

All Technical Context items are known (existing stack, no new dependency). The decisions below
resolve the design choices the spec and clarify session left to the plan. No `NEEDS CLARIFICATION`
remains.

## R1 — Where the suggestion is evaluated

- **Decision**: Add a helper `evaluate_retriage(session, patient, score)` in `app/retriage.py`
  and call it once from `record_reading` (US-03's single reading-creation point), right after the
  `ReadingScore` row is added, within the same (uncommitted) transaction the caller controls.
- **Rationale**: `record_reading` is already the one place every reading passes through (D-37,
  D-50), from both the simulator and the nurse entry endpoint. Evaluating there means neither
  caller changes its own code, and the suggestion is written in the same transaction as the
  reading and its score, so AC12 (all-or-nothing) holds. The helper reads the previous reading's
  stored band from `reading_scores`, so it never recomputes NEWS2 (FR-010).
- **Alternatives rejected**: evaluating inside the API endpoint only (would miss simulator
  readings, breaking AC4-style coverage); a database trigger (SQLite tests and Neon diverge,
  Principle XII); a separate background job (adds a process, D-37 cost rule).

## R2 — Band order and the crossing test

- **Decision**: Define `BAND_ORDER = {"low": 0, "low-medium": 1, "medium": 2, "high": 3}` in
  `app/retriage.py`. A crossing exists when `BAND_ORDER[new] > BAND_ORDER[previous]`. A suggestion
  is raised only when a crossing exists **and** `new in ("medium", "high")`.
- **Rationale**: The four values are the `RISK_BANDS` of US-03; the integer order makes "strictly
  more urgent" a single comparison and makes the no-duplicate comparison (R5) trivial. Keeping the
  order in this module, not in `app/scoring`, respects "scoring rules stay in `app/scoring`" while
  this module only consumes the stored band string.
- **Alternatives rejected**: importing an order from `app/scoring` (US-03 stored the band as a
  plain string; no ordering is exported, and adding one couples this story to the scorer);
  comparing NEWS2 totals (forbidden — that is recomputing/ interpreting the score outside the
  scoring module).

## R3 — band → severity and band → step mappings (clarified)

- **Decision**: In `app/retriage.py`:
  `BAND_SEVERITY = {"medium": "medium", "high": "high"}` and
  `BAND_STEP = {"medium": 1, "high": 2}`. `low` and `low-medium` are absent, so they never raise a
  suggestion. Suggested level = `max(1, current_level - BAND_STEP[band])`.
- **Rationale**: Matches the 2026-11-21 clarify session exactly. One dict per mapping, read
  directly by the tests (FR-002, FR-003). The `max(1, …)` clamps at Triage I (level 1); a patient
  already at level 1 yields a suggested level equal to the current level, which the "more urgent
  only" guard treats as "no suggestion" (AC5).
- **Alternatives rejected**: `low-medium` → severity `low`, +1 level (earlier spec default,
  overruled by the clarify session); `high` jumping straight to Triage I (clarify chose −2 with a
  clamp).

## R4 — Reusing `alerts` with no migration; storing the raising band

- **Decision**: Use the existing `alerts` columns. `severity` holds the mapped severity; `message`
  holds a fixed-shape human line naming the raising band, the current level and the suggested
  level; `status`/`acknowledged_by_id`/`acknowledged_at` track open→acknowledged. The **raising
  band** is written into the message/reason text in a stable, parseable form (e.g. a leading
  machine tag like `band=high;` prefix the API strips before display, or a fixed segment the
  backend re-parses) and read back for R5. The reason (vital signs and points) is built from the
  stored explanation `entries` of the triggering reading.
- **Rationale**: FR-017 forbids a migration; the `alerts` table has no column for a suggested
  level or a raising band, so both live in the existing `message`/`reason` `Text`. With only two
  suggesting bands, a short machine-readable tag in the stored text is enough to recover the band
  for the no-duplicate comparison without a schema change (clarify session answer).
- **Alternatives rejected**: a new `alerts` column (needs a migration); a new table (migration,
  heavier); inferring the band from `severity` alone (the clarify session asked for the band to be
  recorded in the alert text, and this keeps the raising band explicit and survives a future third
  suggesting band).

## R5 — No-duplicate-open-suggestion rule

- **Decision**: Before creating a suggestion, query for an existing **open** suggestion alert for
  the patient. If one exists, read its recorded raising band (R4); create a new suggestion only
  when `BAND_ORDER[new] > BAND_ORDER[open_band]` (i.e. `medium` open → only a `high` reading adds
  a new one). Otherwise create nothing. Accepting or dismissing the open alert clears the "open"
  state so a later crossing can suggest again.
- **Rationale**: Implements FR-006/AC4 with one indexed-free query on `alerts` (small per-patient
  set) and the band comparison from R2. At most one open suggestion per urgency.
- **Alternatives rejected**: a partial unique index (SQLite/Neon divergence, migration);
  replacing the old open alert on a more urgent crossing (the spec keeps both as history — the old
  one stays open until acted on, and a strictly-more-urgent new one is added).

## R6 — Authorization: read vs act

- **Decision**: `GET /api/patients/{code}/suggestions` uses `Depends(get_current_user)` (any
  signed-in clinician). `POST .../accept` and `.../dismiss` use a `require_doctor` dependency
  (modeled on US-03's `require_nurse_recorder`) that returns 403 for a non-doctor.
- **Rationale**: Clarify session: accepting changes the triage level (a doctor's decision);
  reading is open to any clinician, matching US-03's read rule (FR-007, FR-008, FR-009, AC9).
- **Alternatives rejected**: any clinician may accept (overruled by the clarify session);
  doctor-only read (too strict; nurses need to see the suggestion).

## R7 — Discharged patients and status/ordering

- **Decision**: `evaluate_retriage` creates no suggestion when `patient.status == "discharged"`.
  The accept endpoint returns 409 for a discharged patient; the read endpoint and dismiss still
  work for discharged patients (their history stays readable). The read returns suggestion alerts
  newest first (`created_at` desc, then `id` desc as a stable tie-break), matching US-03's ordering
  pattern.
- **Rationale**: AC11; mirrors US-03's discharged handling (409 on write, read stays open) and its
  newest-first ordering with a stable tie-break.

## R8 — Transaction and error handling

- **Decision**: Follow `readings_api.py`'s pattern: wrap database work in `try/except
  SQLAlchemyError`, `session.rollback()` and raise `HTTPException(503, "Service unavailable")`,
  logging only the exception type. Accept performs its three writes then one `commit`; any failure
  rolls back all three (AC12). The patient-code format is checked with the shared `PATIENT_CODE`
  regex before any query (404 on mismatch); the alert id is a path integer (a non-integer is a
  framework 404/422, no echoed value).
- **Rationale**: Consistent with US-01/US-03 endpoints; fixed, value-free messages (FR-011, AC13);
  one commit per request keeps the all-or-nothing guarantee.
- **Alternatives rejected**: per-write commits (would leave partial state on a mid-accept failure).

## Summary of choices

| Topic | Choice |
|---|---|
| Evaluation point | `evaluate_retriage` called once by `record_reading` |
| Band order | `low < low-medium < medium < high`; suggest only on crossing into `medium`/`high` |
| Severity | `medium`→`medium`, `high`→`high` |
| Step | `medium`→−1, `high`→−2, clamped at level 1 |
| Storage | existing `alerts`/`triage_events`, raising band in the message text, **no migration** |
| No-duplicate | new open suggestion only if strictly more urgent than the open alert's band |
| Read auth | any signed-in clinician |
| Accept/Dismiss auth | doctor only (403 otherwise) |
| Level change | only on a doctor's accept → one `manual` triage event; never `automatic` |
