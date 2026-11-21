# Feature Specification: Save and Score Vital-Sign Readings

**Feature Branch**: `017-vital-signs-scoring`

**Created**: 2026-11-20

**Status**: Draft

**Input**: User description: "US-03 Save and score vital-sign readings. Use feature directory 017-vital-signs-scoring (016 is reserved for US-02). Next free decision number: D-50. Source: docs/BACKLOG.md row US-03: \"As a nurse, I want each vital-signs reading to be saved and scored with the reason for each point, so that I understand the patient's risk\". Depends on TS-07 (scoring module), TS-08 (simulator, record_reading), TS-06 (auth), TS-12 (UI), TS-13 (routing); US-01 is merged (nurses-only pattern, /api/patients). Goal: every vital-signs reading, from the simulator or entered by a nurse, is stored together with its NEWS2 result (system, total, risk band and the points per parameter with the reason), so later stories (US-02 list, US-04 alerts, US-05 detail) read a stored score instead of recomputing it. Scope: storage of one score per reading with 7 per-parameter entries as codes and numbers (frontend translates), saved in the same transaction; record_reading is the only place that creates readings and is extended to score and store; forward-only migration with a backfill of existing readings, new table added to reset_demo_patients; POST /api/patients/{patient code}/readings (nurses only, 401/403/404, 422 from InvalidVitalSigns.problems without echoed values) and GET /api/patients/{patient code}/readings (any signed-in clinician, newest first, sensible limit); page /patients/:identifier/readings/new (nurses only, 7 fields, shows the stored result) and a nurse-only \"Registrar signos vitales\" button on the patient detail placeholder. Out of scope: US-02, US-04, US-05 content, editing or deleting readings, other scoring systems; the frontend never computes NEWS2. Open points for clarify: discharged patients, doctors entering readings, GET limit and order, recorded_at set by the server. Acceptance: backend and frontend tests listed; npm test, npm run build, npm audit --audit-level=high and pytest pass."

## User Story *(mandatory)*

**Story ID**: US-03

**Type**: Functional (baseline)

**Story**: As a nurse, I want each vital-signs reading to be saved and scored with the reason for each point, so that I understand the patient's risk.

**Depends on**: TS-03 (tables and migrations), TS-06 (authentication), TS-07 (scoring module), TS-08 (simulator and `record_reading`), TS-12 (UI foundation), TS-13 (client routing). All merged. US-01 is merged and is only reused as a pattern (nurses-only check, patient code in the address), not modified, except that its 403 helper may be reused without changing its behavior.

### Acceptance Criteria

<!-- Each criterion must be testable. qa-tester writes at least one test per criterion. -->

1. **AC1 — Every reading is saved with its score**: **Given** a valid reading for a patient, **When** it is saved by any caller (the simulator, the new entry operation or any other code), **Then** exactly one stored score exists for that reading with the scoring system name (`NEWS2`), the NEWS2 score, the risk band and seven explanation entries, one per parameter in the standard parameter order, each holding the parameter code, the value, the points and the range that gave the points (inclusive low and high bound, either of which may be open) or, for on-oxygen and consciousness, the matched category values.
2. **AC2 — Stored score equals the scoring module**: **Given** any valid reading, **When** it is saved, **Then** its stored NEWS2 score, risk band and every entry are identical to what the current scoring system returns for the same values (the scoring module is the only place that knows NEWS2 rules).
3. **AC3 — All or nothing**: **Given** a reading, **When** the reading or its score cannot be saved (invalid values, a database error, or a failure while scoring), **Then** neither is stored: no reading without a score and no score without a reading.
4. **AC4 — Simulator readings are scored unchanged**: **Given** the existing simulator, **When** it runs a round, **Then** every reading it saves has a stored score, and the simulator's own code and output are unchanged.
5. **AC5 — Existing readings are scored once (backfill)**: **Given** a database with readings saved before this story, **When** the database is upgraded, **Then** every existing reading gets exactly one stored score computed by the current scoring system, readings created afterwards are scored on save, and after the upgrade no reading is without a score. The upgrade is forward-only, like the existing migration.
6. **AC6 — Demo reset still works**: **Given** the demo patients with readings and stored scores, **When** the demo patients are reset, **Then** their stored scores are deleted together with their readings, and the reset succeeds.
7. **AC7 — Nurse enters a reading**: **Given** a signed-in nurse and an existing, active patient, **When** they send a valid reading for that patient code, **Then** the system answers "created" (201) with the reading (`recorded_at` and the seven values) and its stored score (system, NEWS2 score, risk band and the seven explanation entries); `recorded_at` is the time the server saved it; no internal ids are returned.
8. **AC8 — Who may enter a reading**: **Given** a reading entry request, **When** it is sent signed out (no or invalid token), **Then** the answer is 401; **When** it is sent by a signed-in doctor, **Then** the answer is 403; in both cases nothing is stored.
9. **AC9 — Unknown or discharged patient**: **Given** a signed-in nurse, **When** they send a reading for a patient code that does not exist (or is not in the patient code format), **Then** the answer is 404 with a fixed message; **When** the patient's `status` is `discharged`, **Then** the answer is 409 with a fixed message; in both cases nothing is stored.
10. **AC10 — Input validation without echoing values**: **Given** a reading with a missing parameter, a value of the wrong type, a value outside the accepted limits, a temperature with more than one decimal, a consciousness code other than A, C, V, P or U, or an unknown extra field, **When** it is sent, **Then** the answer is 422 listing each problem as the parameter (or the unknown field name, cleaned and shortened) and the reason code, it never repeats a submitted value, and nothing is stored.
11. **AC11 — Reading history**: **Given** any signed-in clinician (doctor or nurse), **When** they ask for the readings of an existing patient code, **Then** they get that patient's readings newest first, each with its stored score and entries, at most 50 by default and at most the requested number when a limit from 1 to 200 is given; signed out the answer is 401, an unknown patient code gives 404, and a limit outside 1–200 gives 422.
12. **AC12 — Entry page for nurses**: **Given** a signed-in nurse, **When** they open `/patients/<patient code>/readings/new`, **Then** they see a form inside a Card, titled with the patient code, with seven fields: respiratory rate, SpO2, on oxygen (yes / no), systolic blood pressure, heart rate, consciousness (ACVPU, the five codes with their meaning), and temperature (one decimal); nothing is pre-selected for on oxygen and consciousness, all seven fields are required, and there is no field for the time.
13. **AC13 — Form checks before sending**: **Given** the entry form, **When** the nurse submits it with a field empty, a number that is not a whole number (temperature: more than one decimal) or a value outside the accepted limits, **Then** the form shows a message next to each invalid field, does not send the request, and keeps what was typed.
14. **AC14 — Result with the reason for each point**: **Given** a valid form, **When** the nurse submits it and the system answers "created", **Then** the page shows the stored result: the NEWS2 score, the risk band, and for each of the seven parameters its name, the value, the points and the reason (the range or category that gave the points, for example "21–24", "≤ 8", "≥ 25" or "C, V, P, U"); everything shown comes from the answer, the frontend never calculates points, the score or the band; the page offers to enter another reading and a link back to the patient detail page.
15. **AC15 — Failed save keeps the form**: **Given** a submitted form, **When** the system answers with a validation error, not found, conflict (discharged patient), a server error or no answer (network failure or timeout), **Then** the page stays on the form, keeps what was typed, shows a fixed, translated error message (never the raw server text), and the submit button is usable again; while a save is in progress the submit button is disabled so the reading cannot be sent twice.
16. **AC16 — Page protected and role-aware**: **Given** `/patients/<patient code>/readings/new`, **When** a signed-out visitor opens it, **Then** they are redirected to the login page (existing protected-route behavior); **When** a signed-in doctor opens it, **Then** they see a translated message that only nurses can record vital signs and a link back to the patient detail page, and no form.
17. **AC17 — Address ranking**: **Given** the app routes, **When** `/patients/<valid patient code>/readings/new` is opened, **Then** the entry page is shown, not the patient detail page or the not-found page; **When** the patient code in that address is not in the patient code format, **Then** the not-found page is shown.
18. **AC18 — "Registrar signos vitales" button for nurses only**: **Given** the patient detail page, **When** a nurse is signed in, **Then** a "Registrar signos vitales" ("Record vital signs") button with an icon is shown and opens `/patients/<patient code>/readings/new`; **When** a doctor is signed in, **Then** the button is not shown.
19. **AC19 — Spanish by default, English switch**: **Given** the entry page, the result and the button, **When** the language is Spanish (default) or English, **Then** every label, option, parameter name, risk band, reason, button and message is shown in that language using glossary terms, and switching language does not clear what was typed or the result shown.

### Out of Scope

- The content of the patient list (US-02), alerts and re-triage suggestions (US-04) and the patient detail content (US-05). This story only adds a mounted nurse-only button to the patient detail placeholder.
- Editing or deleting readings, or entering a reading with a past time.
- Any scoring system other than NEWS2, and NEWS2 SpO2 Scale 2.
- Calculating NEWS2, points or the risk band in the frontend; it only displays what the backend stored.
- Changing the triage level or creating triage events or alerts from a score (US-04).
- Charts, export or deterioration prediction (US-06, US-10, US-08).

### Edge Cases

- **Boundary values** (for example respiratory rate 20 and 21, temperature 38.0 and 38.1, systolic 219 and 220): stored entries match the scoring module exactly, including which range was matched.
- **Open-ended ranges** (for example respiratory rate ≤ 8 or heart rate ≥ 131): the entry has no low or no high bound, and the page shows "≤ 8" or "≥ 131".
- **Temperature sent as a whole number** (`37`): accepted and stored as `37.0`; `37.25` is rejected with 422 (`too_many_decimals`).
- **On oxygen sent as `"yes"`, `1` or `"true"`**: rejected with 422 (`wrong_type`); only a true/false value is accepted.
- **Numbers sent as text** (`"18"`) or with decimals where a whole number is expected (`18.5`): rejected with 422, values not echoed.
- **A client-sent `recorded_at`, patient code or score in the body**: rejected with 422 as an unknown field; the time and the score always come from the server.
- **Patient code in lower case or with other characters**: not in the patient code format, so 404 from the API and the not-found page in the app.
- **Patient discharged between opening the form and saving**: the save gets 409 and the nurse sees a translated "this patient is discharged" message; nothing is stored.
- **A patient with no readings**: the history answers an empty list, not an error.
- **Two readings saved in the same second for one patient**: both are kept; the history orders them newest first, with a stable tie-break (the later saved first).
- **Backfill on an empty database**: the upgrade succeeds and scores nothing.
- **An existing reading that no longer passes validation during the backfill** (not expected: all readings were saved through the validating `record_reading`): the upgrade stops with a clear error naming no values, and nothing is half-upgraded.
- **Session expires while the form is open**: the save gets a 401 and the existing session-expiry handling sends the nurse to the login page.
- **A doctor types the entry address directly**: no form is shown (AC16), and the server still refuses with 403 if a request is sent another way.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every reading MUST have exactly one stored score, saved in the same transaction as the reading. The stored score MUST hold the scoring system name, the NEWS2 score, the risk band, and seven explanation entries in parameter order, each with the parameter code, the value, the points, and the matched range (low and high bound, each possibly open) or the matched category values. Entries MUST hold codes and numbers only, never sentences.
- **FR-002**: `record_reading` MUST remain the only place that creates readings. It MUST validate the values, score them with the scoring system chosen by the scoring module (no NEWS2 rules outside the scoring module), and add both the reading and its stored score without committing (the caller commits or rolls back, as today). Its callers, including the simulator, MUST NOT need changes.
- **FR-003**: A forward-only database migration MUST add the storage for scores and, in the same upgrade, score every existing reading once with the current scoring system, so that after the upgrade every reading has exactly one stored score. Each reading MUST NOT be able to have more than one stored score.
- **FR-004**: The demo reset MUST delete the demo patients' stored scores before their readings (foreign keys are restrictive), and MUST keep working.
- **FR-005**: The system MUST offer a reading entry operation (`POST /api/patients/{patient code}/readings`) that saves one reading for the patient through `record_reading` and answers 201 with the reading (`recorded_at` and the seven values) and its stored score (system, NEWS2 score, risk band, entries). Internal ids (`patient_id`, reading id, score id) MUST NOT be returned.
- **FR-006**: The entry operation MUST require a signed-in user (401 otherwise) whose role is `nurse` (403 for any other role, with a fixed message that only nurses can record vital signs).
- **FR-007**: The entry operation MUST answer 404 with a fixed message for an unknown patient code or a code not in the patient code format, and 409 with a fixed message when the patient's `status` is `discharged`.
- **FR-008**: The entry operation MUST validate the body with the existing accepted limits and mapping validation of the scoring module (single source of the limits). Every validation problem MUST be answered with 422 listing parameter (or cleaned unknown field name) and reason code, never a submitted value, and nothing MUST be stored. Fields other than the seven parameters MUST be rejected.
- **FR-009**: `recorded_at` MUST be set by the server at save time; it MUST NOT be accepted from the client.
- **FR-010**: The system MUST offer a reading history operation (`GET /api/patients/{patient code}/readings`) for any signed-in user (401 otherwise) that answers the patient's readings newest first (ties: later saved first), each with its stored score and entries, limited to 50 by default or to an optional `limit` from 1 to 200 (422 outside that range, without echoing it); 404 for an unknown patient code. It MUST read stored scores and MUST NOT recompute them.
- **FR-011**: Error answers (401, 403, 404, 409, 422, and 503 when the database is unavailable, as in the existing endpoints) MUST use fixed, safe messages that reveal no internal details (no stack traces, database errors or submitted values).
- **FR-012**: The app MUST provide a protected page at `/patients/:identifier/readings/new`, inside the existing protected route group, that ranks above `/patients/:identifier` and the not-found page; a patient code not in the patient code format MUST show the not-found page.
- **FR-013**: For a signed-in nurse, the page MUST show a form inside the shared Card with the seven parameters: respiratory rate (breaths/min), SpO2 (%), on oxygen (yes / no, native radio inputs, nothing pre-selected), systolic blood pressure (mmHg), heart rate (beats/min), consciousness (the ACVPU codes A, C, V, P, U each with its meaning, nothing pre-selected), and temperature (°C, one decimal). All fields are required. The form MUST NOT ask for the time.
- **FR-014**: The form MUST check before sending that every field is filled, that whole-number fields hold whole numbers and temperature has at most one decimal, and that values are within the accepted limits (the same limits as the backend); it MUST show a message next to each invalid field and MUST NOT send an invalid form. The backend stays the authority.
- **FR-015**: The submit action MUST use the shared Button and be disabled while a save is in progress. On 201 the page MUST show the stored result from the answer: the NEWS2 score, the risk band, and a row per parameter with its translated name, value, points and translated reason (range "low–high", "≤ high", "≥ low", or the category values; on oxygen and consciousness show their translated values). It MUST offer to enter another reading (clearing the form) and a link back to the patient detail page. The frontend MUST NOT compute points, the NEWS2 score or the risk band.
- **FR-016**: On 404, 409, 422, 5xx or a network/timeout failure, the form MUST stay filled in and show a fixed, translated error message; on 401 the existing session-expiry handling applies.
- **FR-017**: For a signed-in doctor, the entry page MUST show a translated "only nurses can record vital signs" message with a link back to the patient detail page, and no form.
- **FR-018**: The patient detail page MUST show a "Registrar signos vitales" / "Record vital signs" button (shared Button, with an icon from the project's icon library, D-46) that opens `/patients/<patient code>/readings/new`, only when the signed-in user's role is `nurse`. It MUST be a small component mounted with one line on the page, so US-05 only has to keep that line.
- **FR-019**: Every UI text in this story MUST be in Spanish by default and English with the language switch, come from the translations file and use glossary terms. The glossary MUST gain the new terms in the same PR (at least: the stored score, the entry page, the "Registrar signos vitales" button, the seven parameter labels, the ACVPU labels, the risk band labels and the reason display).
- **FR-020**: All styling MUST use existing design tokens only (no raw colors outside `tokens.css`); color MUST NOT be the only cue for the risk band (its text label is always shown); existing raw-color and contrast guard tests MUST keep passing.
- **FR-021**: Automated tests MUST cover: storage and all-or-nothing; `record_reading` scoring, including the simulator path; the backfill; each API status (201, 401, 403, 404, 409, 422 without echoed values) and the history (order, default and given limit, empty list); the per-parameter entries at boundaries and open ends; and the page (nurse form, doctor message, client checks, result view in both languages, failed save, button visibility, route ranking). All existing tests MUST pass, and `pytest`, `npm test`, `npm run build` and `npm audit --audit-level=high` MUST pass.
- **FR-022**: The decision to store the score with each reading at save time (and read it instead of recomputing it), with entries as codes and numbers translated by the frontend, MUST be recorded as D-50 in `docs/DECISIONS.md`; `docs/BACKLOG.md` and `docs/PROJECT_STATUS.md` MUST show US-03 as done when the story is finished.

### Key Entities *(include if feature involves data)*

- **Reading** (existing `vital_signs` table, unchanged): one set of the seven parameters for one patient, with `recorded_at` set by the server.
- **Stored score** (new): the result of scoring one reading, exactly one per reading: scoring system name, NEWS2 score, risk band, and the seven explanation entries. Saved together with its reading; never edited.
- **Explanation entry** (part of the stored score; existing concept `ParameterScore`): for one parameter, its code, value, points and the matched range (low/high, possibly open) or category values. This is "the reason for each point".
- **Patient** (existing, unchanged): addressed by its patient code; only `active` patients accept new entered readings.
- **User** (existing): only the `nurse` role may enter readings; any signed-in user may read the history.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After the upgrade and after any simulator run, 100% of readings have exactly one stored score; 0 readings exist without one.
- **SC-002**: For 100% of the test readings, including every range boundary and open end, the stored score and entries equal the scoring module's result.
- **SC-003**: A nurse can enter a reading and see its NEWS2 score, risk band and the reason for every point in under 1 minute, without leaving the page.
- **SC-004**: 100% of entry attempts by doctors or signed-out callers are refused (403 / 401) and store nothing; 100% of entries for unknown or discharged patients are refused (404 / 409) and store nothing.
- **SC-005**: 100% of invalid inputs in the test cases are refused with 422 and 0 error answers contain a submitted value.
- **SC-006**: 100% of the texts on the entry page, the result and the button appear in Spanish by default and in English after switching; 0 raw colors are added (guard test passes).
- **SC-007**: All existing backend and frontend tests still pass, and every acceptance criterion has at least one automated test.

## Assumptions

- **Discharged patients** (open point): entering a reading for a `discharged` patient is refused with 409, since a discharged patient is no longer monitored and the simulator already skips them. The history still answers for discharged patients. To be confirmed in `/speckit-clarify`.
- **Who enters readings** (open point): only nurses may enter readings, as in the backlog story and US-01; doctors may read the history. To be confirmed in `/speckit-clarify`.
- **History limit and order** (open point): newest first, default 50, optional `limit` 1–200; this is enough for the later detail page, chart and deterioration prediction without paging. To be confirmed in `/speckit-clarify`.
- **`recorded_at`** (open point): always the server's save time, as today (database default); entering a past time is out of scope. To be confirmed in `/speckit-clarify`.
- The stored score keeps the scoring system name so that a future scoring system can be stored next to NEWS2 results without changing the shape; only NEWS2 is produced now.
- The backfill uses the scoring module at upgrade time. It is acceptable for the academic scope because existing readings are few and synthetic; the upgrade is forward-only, like `0001_initial_schema`.
- The frontend client checks repeat the accepted limits for a better form experience only; validation and scoring stay in the backend.
- The existing frontend API client, its 401 session-expiry handling and the signed-in user's role from `GET /api/me` are reused, as in US-01.
- Adding the nurse-only button to `PatientDetailPage` (a TS-13 placeholder) counts as mounting a component, which the constitution (Principle III) allows; US-05 keeps the mounted line when it replaces the page body.
- No real patient data is used; all readings are synthetic (constitution Principle VI).
