# Feature Specification: Patient List

**Feature Branch**: `016-patient-list`

**Created**: 2026-11-21

**Status**: Draft

**Input**: User description: "Use feature number 016 (directory 016-patient-list). Use decision number D-49 (reserved for US-02; US-03 used D-50). US-02 (functional, baseline): \"As a nurse, I want a patient list showing each patient's current triage level and latest NEWS2 score, so that I see who needs attention first\". Depends on TS-03, TS-06, TS-12, TS-13, US-01 (merged: keep the mounted <RegisterPatientButton /> line in PatientListPage.jsx) and US-03 (merged: read the stored score from reading_scores, never recompute NEWS2, D-50; use the field names in specs/017-vital-signs-scoring/contracts/readings-api.md). Respect the constitution, docs/DECISIONS.md and the US-02 notes in docs/PROJECT_STATUS.md. Decisions already taken: (1) New endpoint GET /api/patients for any signed-in clinician, doctor or nurse (401 signed out). It returns active patients only, each with patient code, name, age, sex, triage_level, admitted_at and the latest stored score (recorded_at, total, band), or null when the patient has no readings. One database query for the whole list (no request per patient); no internal ids. (2) Default order, \"who needs attention first\": highest latest NEWS2 score first, then the most urgent triage level (1 first), then patient code; patients without readings last. User-controlled sorting and filtering are out of scope (US-09). (3) The /patients page replaces the TS-13 placeholder text with the list: patient code, name, triage level (shown with the D-48 triage color tokens, like the registration tiles), latest NEWS2 score with the existing RiskBandBadge imported from pages/record-reading (do not move it), and the time of the latest reading. A patient without readings shows a new \"Sin datos\" / \"No data\" text, never the \"Desconocida\" unknown-band label. Each patient opens /patients/<code>. Keep <RegisterPatientButton /> above the list for nurses. Show an empty-state message when there are no active patients. monitoring_status is not used in this story; record that in D-49. (4) The list refreshes itself every 15 seconds while the page is open (matches the simulator's --demo mode) and shows the time of the last update; a failed refresh keeps the last list and shows a fixed, translated message. (5) Keep the existing API/version/database health section of the page unchanged (its tests belong to other stories). Out of scope: filters and user sorting (US-09), patient detail content (US-05), alerts (US-04), discharging patients, any migration."

## Clarifications

### Session 2026-11-21

- Q: How should the list show the time of each patient's latest reading, and the time of the last update? → A: Relative time with the exact clock time next to it, e.g. "hace 3 min (14:32)" / "3 min ago (14:32)", for both the latest reading and the last update; the date is added to the clock time when it is not today.
- Q: On the page, should the patient list be a table with columns, or a list of one card per patient? → A: A table with a column header row (patient code, name, triage level, NEWS2 score, latest reading), one row per patient; on narrow screens the table scrolls sideways inside its card.
- Q: In the table, what should the clinician click to open a patient's detail page: the patient code only, or anywhere on the row? → A: The patient code in each row is a link to `/patients/<code>`; the rest of the row is plain text.
- Q: When the browser tab with the patient list is in the background (hidden), should the list keep refreshing every 15 seconds? → A: No. Refreshing pauses while the tab is hidden; when it becomes visible again the list is refreshed at once and the 15-second timer restarts.
- 2026-11-21 (change request from the manual check): (1) all five columns are visible on a desktop screen (1024 px wide or more) without horizontal scrolling: only the patient list page is made wider (e.g. max-width 64rem through a class in the page's own CSS module; `styles/global.css` and other pages unchanged); horizontal scrolling stays only for narrow screens. (2) The score and the risk band are shown in **one badge** per patient: the band icon, the NEWS2 score and the band name, e.g. "19 · Alta" / "19 · High", with the accessible name "Puntaje NEWS2 19, riesgo Alta" / "NEWS2 score 19, risk High"; it is a new US-02 component that uses `utils/bandStatus.js` unchanged, so colors and icons match US-03; `RiskBandBadge` is not modified. (3) The score column header shows the scale: "Puntaje NEWS2 (0–20)" / "NEWS2 score (0–20)". (4) The last-update line shows only the exact time with seconds: "Actualizado: 16:05:12" / "Updated: 16:05:12" (the latest-reading column keeps the relative time plus clock time) (AC6, AC11, FR-007, FR-012).

## User Story *(mandatory)*

**Story ID**: US-02

**Type**: Functional (baseline)

**Story**: As a nurse, I want a patient list showing each patient's current triage level and latest NEWS2 score, so that I see who needs attention first.

**Depends on**: TS-03 (tables), TS-06 (authentication), TS-12 (UI foundation), TS-13 (client routing), US-01 (register patient: the mounted nurse-only `<RegisterPatientButton />` and the D-48 triage color tokens) and US-03 (stored scores in `reading_scores`, D-50; field names from `specs/017-vital-signs-scoring/contracts/readings-api.md`; `RiskBandBadge`). All merged.

### Acceptance Criteria

<!-- Each criterion must be testable. qa-tester writes at least one test per criterion. -->

1. **AC1 — List for any clinician**: **Given** a signed-in doctor or nurse, **When** they request the patient list, **Then** the system answers with every **active** patient (patients with `status` = `discharged` are not included), each with its patient code (`identifier`), `name`, `age`, `sex`, `triage_level`, `admitted_at` and `latest_score`; no internal id (`id`, `patient_id`, `vital_sign_id`, score id) appears in the answer.
2. **AC2 — Latest stored score**: **Given** a patient with one or more readings, **When** the list is requested, **Then** that patient's `latest_score` is the stored score (`recorded_at`, `total`, `band`) of their most recent reading by `recorded_at`, exactly as stored (never recomputed); **and given** a patient with no readings, `latest_score` is `null`.
3. **AC3 — Who needs attention first**: **Given** several active patients, **When** the list is returned, **Then** it is ordered by highest latest NEWS2 score first; ties by most urgent triage level first (Triage I before Triage V); remaining ties by patient code ascending; all patients without readings come after every patient with readings, ordered among themselves by triage level then patient code.
4. **AC4 — One query for the whole list**: **Given** any number of active patients, **When** the list is requested, **Then** the system reads the patients and their latest stored scores with a single database query, not one query per patient.
5. **AC5 — Signed out**: **Given** no or an invalid sign-in, **When** the list is requested, **Then** the answer is 401 and no patient data is returned.
6. **AC6 — List on the page**: **Given** a signed-in clinician on `/patients`, **When** the list loads, **Then** the page shows, in the order of AC3, a table with a column header row (patient code, name, triage level, NEWS2 score, latest reading) and one row per active patient with: patient code, name, triage level ("Triage I" … "Triage V" with the D-48 triage colors, as on the registration tiles), one score badge showing the band icon, the latest NEWS2 score and the risk band name (e.g. "19 · Alta"; accessible name "Puntaje NEWS2 19, riesgo Alta"), with the same colors and icons as US-03's risk band badge, under the column header "Puntaje NEWS2 (0–20)", and the time of the latest reading shown as a relative time with the exact clock time next to it (e.g. "hace 3 min (14:32)"; the date is added when it is not today); the TS-13 placeholder text is no longer shown; on a screen 1024 px wide or more all five columns are visible without horizontal scrolling.
7. **AC7 — Patient without readings**: **Given** a patient with no readings, **When** the list shows it, **Then** its score and time show "Sin datos" ("No data" in English), never the "Desconocida" / "Unknown" band label.
8. **AC8 — Open a patient**: **Given** the list, **When** the clinician activates the patient code link in a row (by click, or by Tab and Enter), **Then** the app opens `/patients/<patient code>`; the rest of the row is plain text.
9. **AC9 — Register button kept for nurses**: **Given** the list page, **When** a nurse is signed in, **Then** the existing "Registrar paciente" button is shown above the list; **When** a doctor is signed in, **Then** it is not shown (US-01 behavior unchanged).
10. **AC10 — Empty list**: **Given** no active patients, **When** the list loads, **Then** the page shows a translated empty-state message instead of the list.
11. **AC11 — Automatic refresh**: **Given** the list page is open, **When** 15 seconds pass, **Then** the list is requested again and redrawn, and the page shows the exact time of the last successful update with seconds ("Actualizado: 16:05:12" / "Updated: 16:05:12"); **When** the browser tab is hidden, **Then** refreshing pauses, and **when** it becomes visible again the list is refreshed at once and the 15-second timer restarts; **When** the clinician leaves the page, **Then** the refresh stops.
12. **AC12 — Failed refresh**: **Given** a list already shown, **When** a refresh fails (server error, timeout or network failure), **Then** the last list stays on screen with its last-update time, and a fixed, translated message says the list could not be updated (never the server's text); the next successful refresh removes the message.
13. **AC13 — First load states**: **Given** the page opens, **When** the first request is in progress, **Then** a translated loading message is shown; **When** the first request fails, **Then** a fixed, translated error message is shown and the page keeps trying on the 15-second schedule.
14. **AC14 — Health section unchanged**: **Given** the list page, **When** it loads, **Then** the existing API/version/database health section is shown and behaves exactly as before (one check per page load).
15. **AC15 — Spanish by default, English switch**: **Given** the list page, **When** the language is Spanish (default) or English, **Then** every new text (column labels, "Sin datos" / "No data", empty state, loading, errors, last-update text) is shown in that language using glossary terms, and dates/times follow the chosen language.

### Out of Scope

- Filters and user-controlled sorting (US-09).
- The content of the patient detail page (US-05); this story only links to its address.
- Alerts and re-triage suggestions (US-04).
- Using or computing `monitoring_status` (stable / warning / critical / no_data); recorded in D-49.
- Discharging patients, editing patients, entering readings from the list.
- Any database migration, and any change to how NEWS2 is computed or stored.
- Moving or changing `RiskBandBadge`, `RegisterPatientButton`, `TriageLevelBadge` or the health section.

### Edge Cases

- **Two readings with the same `recorded_at`** for one patient: the most recently saved one is the latest, so exactly one score is shown per patient.
- **A discharged patient with readings** is never listed, even if their score is the highest.
- **A patient registered moments ago** (US-01) has no readings and appears among the "Sin datos" patients at the end.
- **A refresh still in progress when the next 15 seconds pass**: a new request is not started on top of it, so answers never arrive out of order.
- **The session expires while the page is open**: the next refresh gets a 401 and the existing session-expiry handling sends the user to the login page; refreshing stops.
- **Switching language** redraws the texts and times without a new request and without losing the shown list.
- **A band value the page does not know** (should not happen): the score badge shows the existing unknown-band fallback label ("Desconocida" / "Unknown") with the score; this is different from "no readings", which always shows "Sin datos".
- **Existing tests that recognise the patient list page by the TS-13 placeholder text** (from TS-13 and US-01) must recognise it by the patient list card heading instead; only those page-identification lines change.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST offer `GET /api/patients` for any signed-in user (doctor or nurse); without a valid sign-in it MUST answer 401 (existing TS-06 behavior).
- **FR-002**: The answer MUST contain only active patients, each with `identifier` (patient code), `name`, `age`, `sex`, `triage_level`, `admitted_at` and `latest_score`, where `latest_score` is either `null` or an object with `recorded_at`, `total` and `band` using the field names and formats of `specs/017-vital-signs-scoring/contracts/readings-api.md`. No internal id MAY be returned.
- **FR-003**: `latest_score` MUST be read from the stored score of the patient's most recent reading (D-50); NEWS2 MUST NOT be recomputed and no code outside the scoring module MAY interpret NEWS2 thresholds (Principle V).
- **FR-004**: The system MUST return the list in the order of AC3, computed on the server.
- **FR-005**: The system MUST read the whole list with a single database query, whatever the number of patients.
- **FR-006**: Errors MUST use fixed, safe messages (401 as in TS-06; 503 "Service unavailable" when the database is unavailable), never internal details.
- **FR-007**: The `/patients` page MUST replace the placeholder text with the list described in AC6, in the order received, as a table with translated column headers (patient code, name, triage level, NEWS2 score with its scale "(0–20)", latest reading) and one row per patient, using the shared Card and the D-48 triage color tokens for the triage level. The score cell MUST be one score badge (a new US-02 component in `pages/patient-list`) with the band icon, the score and the band name ("19 · Alta" / "19 · High"), the accessible name "Puntaje NEWS2 {score}, riesgo {band}" / "NEWS2 score {score}, risk {band}", and the colors, icons and labels from `utils/bandStatus.js` used unchanged (soft background, solid border, dark text, tokens only); `RiskBandBadge` (US-03) MUST NOT be modified. Only the patient list page MUST be wider (a class in its own CSS module, e.g. max-width 64rem) so that on screens 1024 px wide or more all five columns are visible without horizontal scrolling; `styles/global.css` and other pages MUST NOT change; on narrower screens the table MUST scroll sideways inside its card rather than overflow the page.
- **FR-008**: A patient with `latest_score = null` MUST show "Sin datos" / "No data" for its score and time.
- **FR-009**: In each row, the patient code MUST be a real link to `/patients/<patient code>` (keyboard-usable, can be opened in a new tab); the row itself MUST NOT be made clickable.
- **FR-010**: The page MUST keep the mounted `<RegisterPatientButton />` above the list (nurse-only, unchanged) and the existing health section unchanged.
- **FR-011**: The page MUST show a translated loading message on first load, an empty-state message when the list is empty, and a fixed translated error message when the first load fails.
- **FR-012**: While the page is open, the list MUST be requested again every 15 seconds, never starting a new request while one is in progress, and the page MUST show the time of the last successful update; refreshing MUST pause while the browser tab is hidden and, when the tab becomes visible again, the list MUST be refreshed at once and the 15-second timer restarted; the refresh MUST stop when the page is left.
- **FR-013**: A failed refresh MUST keep the last list and its last-update time and show a fixed, translated "could not update" message, removed after the next success; a 401 MUST use the existing session-expiry handling.
- **FR-014**: Every new UI text MUST exist in Spanish (default) and English in the translations file, use glossary terms, and dates/times MUST be formatted for the chosen language; the glossary MUST gain the new UI texts in the same PR.
- **FR-015**: All styling MUST use design tokens only (no raw colors), icons only from `lucide-react` and decorative; the raw-color and contrast guard tests MUST keep passing.
- **FR-016**: Automated tests MUST cover the endpoint (fields, active only, latest score, null score, ordering with ties and no-reading patients, single query, 401, 503) and the page (entries and order, "Sin datos", link, nurse button kept, empty state, loading, first-load error, 15-second refresh, failed refresh, stop on leave, both languages, health section still shown).
- **FR-017**: Decision **D-49** MUST be added to `docs/DECISIONS.md`: the list contract and order, server-side ordering in one query, the 15-second refresh, and that `monitoring_status` is not used in US-02 (the PROJECT_STATUS note saying US-02 maps bands to `monitoring_status` is superseded by D-49). `docs/BACKLOG.md` and `docs/PROJECT_STATUS.md` MUST show US-02 as done when the story is finished.

### Key Entities *(include if feature involves data)*

- **Patient** (existing): code, name, age, sex, current triage level, `admitted_at`, `status` (only `active` ones are listed).
- **Reading** (existing, US-03): one set of vital signs with `recorded_at`; only the most recent one per patient is used.
- **Stored score** (existing `reading_scores`, US-03): `total` (NEWS2 score) and `band` (risk band) of one reading; read, never recomputed.
- **Patient list entry** (new response item): a patient plus its `latest_score` (`recorded_at`, `total`, `band`) or `null`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A clinician sees the patient with the highest NEWS2 score at the top of the list in 100% of the ordering test cases (including ties and patients without readings).
- **SC-002**: The list stays current: a new reading appears on an open list within 15 seconds (one refresh), without reloading the page.
- **SC-003**: The number of database queries to build the list is 1, whether there are 0, 1 or 50 active patients.
- **SC-004**: 0 discharged patients and 0 internal ids appear in the list in the test cases; 100% of signed-out requests get 401.
- **SC-005**: 100% of patients without readings show "Sin datos" / "No data" and 0 show the unknown-band label.
- **SC-006**: A failed refresh never empties a list already on screen (100% of failure test cases keep the last list).
- **SC-007**: All existing backend and frontend tests still pass, and every acceptance criterion has at least one automated test.

## Assumptions

- `GET /api/patients` answers `{"patients": [ … ]}` (an object with a list, like the readings history answer), so the shape can grow later without breaking clients.
- "Most recent reading" means the latest `recorded_at`; equal times are broken by the most recently saved reading.
- Patients without readings are ordered among themselves by triage level, then patient code (the same tie-breakers as AC3).
- Times are shown in the browser's local time as a relative time plus the exact clock time ("hace 3 min (14:32)" / "3 min. ago (14:32)", as `Intl` writes it, 24-hour clock in every language), formatted for the chosen language (confirmed in Clarifications); the relative part is recomputed whenever the list is redrawn (at least every 15 seconds). The last-update time is the time the last successful answer arrived, shown as the exact local clock time with seconds, 24-hour ("Actualizado: 16:05:12"), without a relative part (change request 2026-11-21).
- The refresh timer counts from the end of the previous request; it runs only while the page is open and the tab is visible (confirmed in Clarifications).
- The triage level on the list uses the D-48 tokens (`--color-triage-N-soft` background, `--color-triage-N` border, dark text with the label "Triage I" … "Triage V"); `TriageLevelBadge` stays unchanged.
- The patient-list placeholder translation key may be removed or left unused; the tests from TS-13 and US-01 that identify the page by that text change only those lines (Principle III allows no other change to US-01 code; the `<RegisterPatientButton />` line stays).
- Scale is academic: tens of active patients; no pagination.
