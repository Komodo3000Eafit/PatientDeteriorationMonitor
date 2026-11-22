# Quickstart: Re-triage Suggestion Alerts (US-04)

How to validate the story end to end. Details live in [spec.md](spec.md),
[data-model.md](data-model.md) and the contracts
([retriage-api.md](contracts/retriage-api.md), [ui.md](contracts/ui.md)). No migration is run
(FR-017).

## Prerequisites

- Backend deps installed (`pip install -r backend/requirements.txt`), frontend deps installed
  (`npm ci` in `frontend/`).
- A database (Neon `DATABASE_URL`, or SQLite for tests) already at migration `0002_reading_scores`
  (US-03). No new migration for this story.
- Demo users (`python -m app.seed_demo_users`) and demo patients (`python -m app.demo_patients`).

## Automated tests (the primary gate)

Run from the repo root.

```bash
# Backend
cd backend && python -m pytest

# Frontend
cd frontend && npm test && npm run build && npm audit --audit-level=high
```

Expected: all pass, including the new `test_retriage.py` and `test_retriage_api.py`, the edits to
`test_readings.py`/`test_simulator.py`, and the new `RetriageSuggestion.test.jsx`; the existing
raw-color and contrast guards stay green (no new tokens). Record the before/after test counts in
the first task.

## Backend behaviour checks (what the tests assert)

1. **Crossing raises a suggestion (AC1)**: save two readings for an active Triage III patient, the
   first scoring `low`/`low-medium`, the second scoring `medium`; exactly one open `alerts` row
   exists with `severity = medium`, `suggested_level = 2`, and a reason naming the vitals/points.
2. **No automatic level change (AC2)**: after the crossing, the patient's `triage_level` is still
   3 and no `triage_events` row with `source = 'automatic'` exists.
3. **No crossing, no suggestion (AC3)**: a second reading at the same or a less urgent band creates
   no new suggestion; the first reading of a patient never creates one.
4. **Mappings and clamp (AC5)**: a `high` crossing for a Triage III patient suggests level 1
   (3 − 2); for a Triage II patient it also clamps at 1; a patient already at Triage I gets none.
5. **No duplicate (AC4)**: with an open `medium` suggestion, a later `medium` reading adds nothing;
   a later `high` reading adds a second open suggestion.
6. **Accept (AC6)**: as a doctor, `POST .../accept` sets `triage_level` to the suggested level,
   writes one `source = 'manual'` triage event, acknowledges the alert; all-or-nothing on a forced
   failure.
7. **Dismiss (AC7)**: as a doctor, `POST .../dismiss` acknowledges the alert; no level change, no
   triage event.
8. **Authorization (AC9)**: read works for doctor and nurse and is 401 signed out; accept/dismiss
   are 403 for a nurse, 401 signed out.
9. **Edge statuses (AC10, AC11)**: accept/dismiss on an acknowledged alert → 409; on an unknown
   alert → 404; a discharged patient → no new suggestion, accept → 409, read still works.

Manual spot check (optional, against a running backend):

```bash
TOKEN=...  # from POST /api/auth/login as the demo doctor
curl -s -H "Authorization: Bearer $TOKEN" \
  https://<host>/api/patients/PAT-001/suggestions
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  https://<host>/api/patients/PAT-001/suggestions/<id>/accept
```

## Frontend behaviour checks (what the tests assert)

1. **Doctor, open suggestion (AC14, AC16)**: the Card shows the band badge, current + suggested
   triage badges, severity and reason, with Accept and Dismiss buttons; Accept shows the new level
   and `retriage.accepted`; Dismiss shows `retriage.dismissed`; buttons disable while in progress.
2. **Nurse, open suggestion (AC14)**: the same Card is shown read-only, with no action buttons.
3. **No open suggestion (AC15)**: the component shows `retriage.none` and no buttons.
4. **Failed action (AC17)**: a 409/500/network error keeps the suggestion shown and shows
   `retriage.actionError`; the buttons become usable again.
5. **Languages (AC18)**: every label, severity, band, triage level, button and message renders in
   Spanish by default and in English after the switch, using glossary terms; switching language
   does not clear what is shown.

## Done

- `pytest`, `npm test`, `npm run build`, `npm audit --audit-level=high` all pass.
- `docs/DECISIONS.md` has D-51; `docs/GLOSSARY.md` has the new terms; `docs/BACKLOG.md` and
  `docs/PROJECT_STATUS.md` show US-04 as done.
