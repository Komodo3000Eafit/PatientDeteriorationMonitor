# Feature Specification: Alert Acknowledgement

**Feature Branch**: `023-alert-acknowledgement`

**Created**: 2026-11-23

**Status**: Draft

**Input**: User description: "Create US-07. Spec must be #23 (feature directory 023-alert-acknowledgement; pass -Number 23). US-07 (functional, team session): As a nurse, I want to mark an alert as acknowledged, so that the team knows it has been handled. Depends on US-04 (alerts table rows = re-triage suggestions); also TS-03, TS-06 (auth), TS-12 (UI), TS-13 (routing), US-05 (patient detail page). Chosen meaning (option B, "seen" marker): a nurse marks the patient's open re-triage suggestion as seen; this stores the nurse's user id and time in the existing alerts.acknowledged_by_id and alerts.acknowledged_at columns and leaves alerts.status = 'open', so the doctor still accepts or dismisses it with US-04 (US-04 only checks status, never acknowledged_by_id). When a doctor later accepts or dismisses, US-04 overwrites those columns with the doctor's id and time; that is expected and must be recorded in the decision. No migration, no new table, no new alert rows, no change to the triage level, no triage event (D-41). Backend: new module app/alert_ack_api.py registered with one include_router line in main.py, under /api: (1) POST /api/patients/{identifier}/alerts/{alert_id}/seen, nurses only (reuse require_nurse from app/patients.py), check order 401 -> 403 -> 404 (find_patient; alert not found or not this patient's) -> 409 (alert already acknowledged, or already marked seen; first nurse wins) -> 200; (2) GET /api/patients/{identifier}/alerts/acknowledgement, any signed-in clinician, returns for the patient's newest alert (open or acknowledged) its alert id, status, and either the seen-by or handled-by person's full_name and time, or nothing when no one has seen it; no internal user ids, no username, no machine tag. 503 "Service unavailable" logged by error type only. Do not change US-04 code (retriage.py, retriage_api.py, RetriageSuggestion.jsx, OpenSuggestionsBanner.jsx) or US-03/US-08 code (Principle III). Frontend: a new component AlertAcknowledgement.jsx (+ CSS Module) in pages/patient-detail/, mounted with one line on PatientDetailPage right below the re-triage section (keep RecordReadingButton, RetriageSuggestion and DeteriorationPrediction); states: no alert -> render nothing; open and not seen -> nurses see a "Marcar como visto" button, doctors see nothing extra; open and seen -> everyone sees "Visto por <full_name>, <local time>"; acknowledged -> everyone sees "Atendida por <full_name>, <local time>"; after a successful click the line updates without a page reload; 409 shows a fixed "already handled" message and reloads the state; nothing before the first successful answer, nothing on 404/401, a fixed error line on 5xx/network/timeout; add an optional handler to frontend/src/testing/fakeBackend.js (404 by default). Tokens only, CSS Modules, reuse Card/Button, color never the only signal, any new icon from lucide-react, Spanish by default with an English switch, glossary terms. Decision number: D-56 (D-53 is claimed by open branches 022 and 026, D-54 is kept for that renumbering, D-55 is US-08)."

## Clarifications

### Session 2026-11-23 (plan input)

- Q: Which 403 message does a non-nurse get? → A: A local nurse check in the new module with its own message "Only nurses can mark alerts as seen"; `patients.py` (and its `require_nurse`) is unchanged.
- Q: Which alert does the component show when a patient has several? → A: The patient's newest **open** alert; when none is open, the newest alert (acknowledged).
- Q: May a doctor mark an alert as seen? → A: No, a doctor gets 403 (doctors handle suggestions with US-04 accept/dismiss).
- Q: Is it acceptable that a doctor's accept/dismiss replaces the nurse's seen marker? → A: Yes; accepted and recorded in D-56.

## User Story *(mandatory)*

**Story ID**: US-07

**Type**: Functional (team session)

**Story**: As a nurse, I want to mark an alert as acknowledged, so that the team knows it has been handled.

**Chosen meaning (option B, "seen" marker)**: in this app every alert row is a re-triage suggestion (US-04), and only a doctor may accept or dismiss it (D-51). So the nurse's action is a **"seen" marker**: the nurse marks the patient's open re-triage suggestion as **seen**, which records *who* saw it and *when*, while the alert stays `open` for the doctor. Once the doctor accepts or dismisses it (US-04), the alert is **acknowledged** ("Atendida") and the page shows who handled it.

**Depends on**: US-04 (re-triage suggestion alerts: the `alerts` rows), merged. Also TS-03 (data model: `alerts.acknowledged_by_id`, `alerts.acknowledged_at`), TS-06 (authentication), TS-12 (UI foundation), TS-13 (client routing) and US-05 (patient detail page), all merged. It does **not** depend on US-06, US-08, US-09 or US-10, and no other team-session story depends on it (constitution Principle III, D-26).

### Acceptance Criteria

<!-- Each criterion must be testable. qa-tester writes at least one test per criterion. -->

1. **AC1 — A nurse marks an open suggestion as seen**: **Given** a patient with an open re-triage suggestion that no one has marked as seen, **When** a signed-in nurse marks it as seen, **Then** the answer is 200, the alert stores that nurse as the person who saw it and the current time, and the alert's status stays `open`.
2. **AC2 — Seen does not handle the suggestion**: **Given** an open suggestion marked as seen by a nurse, **When** a doctor views the re-triage suggestion section, **Then** the suggestion is still listed as open and the doctor can still accept or dismiss it exactly as before (US-04 behaviour unchanged).
3. **AC3 — The doctor's action replaces the seen marker**: **Given** an open suggestion marked as seen by a nurse, **When** a doctor accepts or dismisses it, **Then** the alert becomes `acknowledged` and the stored person and time become the doctor's and the time of that action; the nurse's seen marker is no longer stored (expected, recorded in D-56).
4. **AC4 — Only nurses may mark as seen**: **Given** a request to mark an alert as seen, **When** it is sent signed out, **Then** the answer is 401; **When** it is sent by a signed-in doctor, **Then** the answer is 403 with the fixed message "Only nurses can mark alerts as seen" and nothing is stored.
5. **AC5 — Unknown patient or alert**: **Given** a nurse's request to mark an alert as seen, **When** the patient code is unknown or not in the patient code format, **Then** the answer is 404 with the existing fixed patient message; **When** the alert does not exist or belongs to another patient, **Then** the answer is 404 with a fixed "alert not found" message; nothing is stored.
6. **AC6 — First nurse wins**: **Given** an alert that is already marked as seen, or already acknowledged by a doctor, **When** a nurse marks it as seen, **Then** the answer is 409 with a fixed "already handled" message and the stored person and time do not change.
7. **AC7 — Check order**: **Given** a request that fails more than one check, **When** it is answered, **Then** the checks run in the order 401 → 403 → 404 → 409 → 200 (for example a doctor asking for an unknown patient gets 403, not 404).
8. **AC8 — Nothing else changes**: **Given** an alert is marked as seen, **When** the change is stored, **Then** the patient's triage level is unchanged, no triage event is created, no alert row is added and no other column of the alert changes (severity, message, status, creation time).
9. **AC9 — Reading the acknowledgement state**: **Given** a patient, **When** any signed-in clinician (doctor or nurse) asks for the acknowledgement state, **Then** the answer describes the patient's **shown alert** (the newest open alert, or the newest alert when none is open): its alert id, its status and, when someone has seen or handled it, that person's full name and the time; when no one has seen it, the person and time are empty; when the patient has no alert, the answer says there is no alert. Signed out gets 401; an unknown patient code gets 404 with the existing fixed message.
10. **AC10 — Safe answers**: **Given** any answer of these two operations, **When** it is returned, **Then** it never contains internal user ids, usernames, the patient's internal id or the alert's machine tag; when the database is unavailable the answer is 503 "Service unavailable" and the problem is logged by error type only, with no stack trace or database details in the answer.
11. **AC11 — Patient detail page: no alert, or open and not seen**: **Given** a signed-in clinician on a patient's detail page, **When** the patient has no alert, **Then** the acknowledgement component shows nothing; **When** the shown alert is open and not seen, **Then** a nurse sees a "Marcar como visto" ("Mark as seen") button and a doctor sees nothing extra.
12. **AC12 — Patient detail page: seen and acknowledged**: **Given** the patient detail page, **When** the shown alert is open and seen, **Then** every clinician sees "Visto por <full name>, <local time>" ("Seen by …"); **When** the shown alert is acknowledged (no open alert left), **Then** every clinician sees "Atendida por <full name>, <local time>" ("Handled by …"); each line has an icon and text, so color is never the only cue.
13. **AC13 — After the nurse clicks**: **Given** a nurse sees the "Marcar como visto" button, **When** the click succeeds, **Then** the button is replaced by the "Visto por <own full name>, <local time>" line without a page reload; **When** the answer is 409, **Then** a fixed translated "already handled" message is shown and the state is loaded again; while the request runs the button cannot be clicked twice.
14. **AC14 — Loading and failure**: **Given** the acknowledgement component, **When** the state has not loaded yet, **Then** nothing is shown (no cached clinical data before the first successful answer); **When** loading fails with 404, **Then** nothing is shown (the page shows its own not-found card); on 401 the existing session-expiry handling applies; **When** loading or marking fails with 5xx, network failure or timeout, **Then** a fixed translated error line is shown (never raw server text) and the rest of the page, including the record-reading button, the re-triage suggestion section and the deterioration prediction, keeps working.
15. **AC15 — Spanish by default, English switch**: **Given** the acknowledgement component, **When** the language is Spanish (default) or English, **Then** the button, the seen and handled lines and the messages are in that language from the translations file using glossary terms, the time is shown in the clinician's local time, and switching language does not clear what is shown.
16. **AC16 — Styling and tokens**: **Given** the acknowledgement component, **When** it is shown, **Then** it uses CSS Modules and design tokens only (no raw colors outside `tokens.css`), reuses Card and Button, any new icon comes from `lucide-react` (D-46), and the existing raw-color and contrast guard tests keep passing.

### Out of Scope

- Any database migration, new table, new column or new alert row; the existing `acknowledged_by_id` and `acknowledged_at` columns are reused.
- Accepting or dismissing suggestions (US-04, doctors only), changing the triage level or creating a triage event (D-41).
- Keeping a history of who saw an alert: only the first nurse is stored, and the doctor's action replaces it (AC3).
- Undoing a seen marker, or a nurse marking an alert as acknowledged (`status = 'acknowledged'`).
- Marking older open suggestions of the same patient from the component: only the shown alert (newest open) is shown and marked on the detail page.
- Showing the seen marker on the patient list page, in the open-suggestions banner, or in notifications outside the app.
- Any change to US-04 code (`retriage.py`, `retriage_api.py`, `RetriageSuggestion.jsx`, `OpenSuggestionsBanner.jsx`), US-03 code (`readings.py`, `readings_api.py`) or US-08 code (`prediction.py`, `prediction_api.py`, `DeteriorationPrediction.jsx`) (Principle III).
- Live refresh when another clinician marks or handles the alert on another screen; the state loads when the detail page is shown and after the nurse's own click.

### Edge Cases

- **Patient with no alert**: the read answer says there is no alert; the component shows nothing.
- **All alerts acknowledged**: the shown alert is the newest one; the read shows "Atendida por <doctor>, <time>"; a nurse sees no button; marking it as seen gives 409.
- **Newest alert acknowledged but an older one still open**: the older open alert is shown (open alerts come first), so the nurse can still mark it.
- **Two nurses click at nearly the same time**: only the first is stored; the second gets 409, sees the fixed "already handled" message and the reloaded state shows the first nurse (AC6). The check and the write happen together so the second request cannot overwrite the first.
- **Doctor handles the alert while the nurse's page is open**: the nurse's click gets 409, the fixed message is shown and the reloaded state shows "Atendida por <doctor>".
- **More than one open suggestion** (US-04 may raise a second, more urgent one): the component shows only the newest open alert (newest creation time, then highest alert id); older open suggestions are still listed and handled in the US-04 section.
- **A newer suggestion is raised after a nurse marked the older one**: the newest open alert is now unseen, so the button is shown again for it.
- **A newer open suggestion raised during the mark**: if US-04 raises a newer open suggestion between the save and the re-read, the POST answer shows that newer alert (not seen yet); the stored marker on the alert the nurse clicked is still correct.
- **An acknowledged alert with no stored person** (not produced by US-04, which always stores the doctor): shown as "Atendida" without a name or time; never an error.
- **Discharged patient**: reading the state and marking as seen work the same as for an active patient; marking as seen changes nothing clinical.
- **An acknowledged alert from before this story** (handled by a doctor in US-04): it is shown as "Atendida por <doctor>"; no data change is needed.
- **The stored person no longer exists or has no full name**: not possible (`users.full_name` is required and users are never deleted); no special handling.
- **Session expires while the page is open**: the next request gets 401 and the existing session-expiry handling sends the clinician to the login page.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST offer an operation to mark one alert of one patient as **seen**, identified by the patient code and the alert id, allowed only for signed-in **nurses** (401 signed out; 403 with the fixed message "Only nurses can mark alerts as seen" for any other role, including doctors). The nurse check MUST be local to the new module; `patients.py` MUST NOT change (Clarifications 2026-11-23).
- **FR-002**: Marking as seen MUST store the nurse's user and the current time in the alert's existing "acknowledged by" and "acknowledged at" fields and MUST leave the alert's status `open`. It MUST NOT change any other alert field, MUST NOT change the triage level, MUST NOT create a triage event and MUST NOT create any row (D-41).
- **FR-003**: The mark-as-seen checks MUST run in the order 401 → 403 → 404 → 409 → 200: 404 for an unknown patient code or one not in the patient code format (existing patient lookup and message), and 404 with a fixed "alert not found" message for an alert that does not exist or belongs to another patient; 409 with a fixed "already handled" message when the alert is already `acknowledged` or already has a stored person (first nurse wins). On any error nothing is stored.
- **FR-004**: Two mark-as-seen requests for the same alert MUST NOT both succeed: the "not yet seen" check and the write MUST be done as one step, so the second request gets 409.
- **FR-005**: The system MUST offer a read-only operation that returns the acknowledgement state of the patient's **shown alert**: the newest **open** alert, or, when none is open, the newest alert (newest creation time, then highest alert id; Clarifications 2026-11-23), for any signed-in clinician (401 otherwise, 404 for an unknown patient code). The answer MUST contain the alert id, its status (`open` or `acknowledged`), and, when a person is stored, that person's full name and the time; it MUST say "seen" when the status is `open` with a stored person and "handled" when the status is `acknowledged`. When no one is stored, the person and time MUST be empty. When the patient has no alert, the answer MUST say so (never an error). This operation MUST NOT write anything.
- **FR-006**: No answer of either operation may contain internal user ids, usernames, the patient's internal id or the alert message's machine tag. A database failure MUST give 503 "Service unavailable" with the problem logged by error type only.
- **FR-007**: When a doctor accepts or dismisses a suggestion (US-04), US-04 overwrites the stored person and time with the doctor's; this MUST stay as it is (no US-04 change) and MUST be described in decision D-56. US-04 decides "open" only from the alert status, so a seen marker never hides or blocks a suggestion.
- **FR-008**: The backend operations MUST live in one new module, added to the app under `/api` with a single registration line. US-03, US-04 and US-08 code MUST NOT change (constitution Principle III). This story MUST NOT add a database migration.
- **FR-009**: The app MUST provide an acknowledgement component in its own file (with its own CSS Module) in the patient detail folder, mounted on the patient detail page with one line right below the re-triage suggestion section; the record-reading button, the re-triage suggestion section and the deterioration prediction MUST stay unchanged.
- **FR-010**: The component MUST show: nothing when the patient has no alert; for an open, unseen alert, a "Marcar como visto" button for nurses and nothing extra for doctors; for an open, seen alert, "Visto por <full name>, <local time>" for everyone; for an acknowledged alert, "Atendida por <full name>, <local time>" for everyone. Each line MUST have an icon and text (color is never the only cue).
- **FR-011**: After a successful click the component MUST show the seen line without a page reload; while the request runs the button MUST be disabled; on 409 it MUST show a fixed translated "already handled" message and load the state again.
- **FR-012**: Before the first successful answer the component MUST show nothing (no cached clinical data). On 404 it MUST show nothing; on 401 the existing session-expiry handling applies; on 5xx, network failure or timeout (loading or marking) it MUST show a fixed translated error line (never raw server text) without breaking the rest of the page.
- **FR-013**: The test fake backend MUST get an optional handler for the acknowledgement state that answers 404 by default, so existing patient detail tests keep passing without changes.
- **FR-014**: Every UI text MUST be Spanish by default and English with the language switch, from the translations file, using glossary terms: "acknowledged" ("Atendida"; never "attended" for alerts) and the new term **"seen"** ("Visto"; button "Marcar como visto"). Times MUST be shown in the clinician's local time. The new term and the updated "acknowledged" entry MUST be added to `docs/GLOSSARY.md` in the same PR (D-40).
- **FR-015**: Styling MUST use CSS Modules and design tokens only (no raw colors outside `tokens.css`, no new token unless needed and contrast-checked), reuse Card and Button, use only `lucide-react` icons (D-46), and keep the raw-color and contrast guard tests passing.
- **FR-016**: Automated tests MUST cover: mark as seen (200 stores the nurse and time and keeps status `open`; 401; 403 for a doctor; 404 for unknown patient, unknown alert and another patient's alert; 409 when already seen and when acknowledged; check order; nothing else changes: triage level, triage events, row count, other alert fields); that after a seen marker the US-04 suggestion is still open and a doctor's accept or dismiss replaces the person and time; the read (no alert, open unseen, open seen, acknowledged, newest open alert chosen before a newer acknowledged one, newest alert when none is open, 401, 404, 503, no internal ids or usernames or machine tag); and the component (nothing while loading, nothing on 404, no alert, nurse button, doctor sees no button, seen line, handled line, successful click updates without reload, 409 message and reload, error line, both languages). All existing tests MUST pass, and `pytest`, `npm test`, `npm run build` and `npm audit --audit-level=high` MUST pass.
- **FR-017**: The decision to implement US-07 as a nurse "seen" marker stored in the existing acknowledgement fields (status stays `open`, no migration, first nurse wins, the doctor's US-04 action overwrites the marker) MUST be recorded as **D-56** in `docs/DECISIONS.md`; `docs/BACKLOG.md` and `docs/PROJECT_STATUS.md` MUST show US-07 as done when the story is finished.

### Key Entities *(include if feature involves data)*

- **Alert (re-triage suggestion)**: the existing `alerts` row (US-04). This story writes only its "acknowledged by" person and "acknowledged at" time, and only while it is `open` and no one is stored. Status `open` + stored person = **seen** by a nurse; status `acknowledged` + stored person = **handled** by a doctor.
- **User (read-only here)**: the clinician stored on the alert; only the full name is shown.
- **Patient (read-only here)**: found by patient code; its triage level and status are never changed by this story.
- **Acknowledgement state (computed, not stored)**: the answer for one patient: whether there is an alert, its id and status, and the seen-by or handled-by full name and time (empty when no one has seen it).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A nurse can mark a patient's open re-triage suggestion as seen with one click on the detail page, and the seen line appears within 2 seconds without reloading the page.
- **SC-002**: Every clinician opening a patient's detail page sees, without any extra action, whether the shown alert was seen or handled, by whom and when.
- **SC-003**: In 100% of seen markings the triage level, triage events, alert status and number of alerts are unchanged, and the doctor can still accept or dismiss the suggestion.
- **SC-004**: When two nurses mark the same alert, exactly one marker is stored in 100% of cases.
- **SC-005**: 100% of error answers carry a fixed, safe message with no internal id, username or stack trace, and the full backend and frontend suites (including the raw-color and contrast guards) pass in CI.

## Assumptions

- **Option B is the chosen meaning** (given in the input): a nurse cannot acknowledge a re-triage suggestion because only a doctor accepts or dismisses it (D-51); the nurse's "acknowledge" is the "seen" marker. This keeps the story without a migration (constitution Principle XII).
- The existing `require_nurse` is not reused because its 403 message ("Only nurses can register patients") does not fit; a local nurse check with "Only nurses can mark alerts as seen" is used instead (Clarifications 2026-11-23).
- Losing the nurse's seen marker when the doctor handles the alert is acceptable: once handled, the team needs to know who handled it, not who saw it first.
- "Shown alert" means the newest open alert, else the newest alert (newest creation time, then highest alert id); older open suggestions stay visible and actionable in the US-04 section.
- The state is loaded when the patient detail page is shown and after the nurse's own click; there is no live refresh.
- The existing patient lookup, auth dependency, "Service unavailable" 503 pattern, Card and Button components and the warning/info tokens are reused as they are; no new token is expected.
