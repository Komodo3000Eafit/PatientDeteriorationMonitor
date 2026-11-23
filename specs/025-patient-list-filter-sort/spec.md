# Feature Specification: Patient List Filter and Sort

**Feature Branch**: `025-patient-list-filter-sort`

**Created**: 2026-11-21

**Status**: Draft

**Input**: User description: "Do US-09, use the spec folder 025. US-09 (functional, final session): \"As a nurse, I want to filter and sort the patient list by triage level, so that I find the most urgent patients faster\". Depends on US-02 (merged: the patient list page at `/patients`, `GET /api/patients`, `PatientTable`, `usePatientList`, `ScoreBadge`, the D-48 triage color tokens). Project rule (PROJECT_STATUS, from US-02/D-49): US-09 filters and sorts on top of the `GET /api/patients` answer; the default order stays the server's. Respect the constitution, docs/DECISIONS.md and docs/GLOSSARY.md. Reserve decision number D-53 for this story. Out of scope: any backend change, any new endpoint or query parameter, any migration, discharged patients, pagination, filtering or sorting by anything other than triage level and the existing columns."

## User Story *(mandatory)*

**Story ID**: US-09

**Type**: Functional (final session)

**Story**: As a nurse, I want to filter and sort the patient list by triage level, so that I find the most urgent patients faster.

**Depends on**: US-02 (patient list). Merged: the `/patients` page, the `GET /api/patients` answer, `PatientTable`, `usePatientList`, `ScoreBadge`, the D-48 triage color tokens and the glossary terms for the patient list. US-09 adds its controls on top of the list US-02 already loads; it does not depend on any other functional story (Principle III).

## Clarifications

### Session 2026-11-21

- Q: How should the nurse control the sort — clickable column headers, or a separate "sort by" dropdown with a direction toggle? → A: Clickable column headers: clicking a header sorts by that column; clicking the active header again flips the direction; an indicator and `aria-sort` mark the active column. The triage-level filter stays a separate dropdown above the table (it is not a column).
- Q: Who should see the filter and sort controls — every signed-in clinician, or nurses only? → A: Every signed-in clinician (doctor and nurse); the controls are a view convenience over data both roles already see, so US-09 adds no new role rule and tests cover both roles.
- Q: When the nurse clears the triage-level filter, should the sort stay as it is or reset to the server's default order? → A: Filter and sort are independent — clearing the filter keeps the current sort. There is no explicit "reset" control; the server's default order is simply the state before any column header is clicked.

### Acceptance Criteria

<!-- Each criterion must be testable. qa-tester writes at least one test per criterion. -->

1. **AC1 — Filter by triage level**: **Given** the patient list is showing active patients, **When** the nurse chooses one triage level (Triage I … Triage V) in the triage-level filter, **Then** the table shows only the patients at that triage level, in the current sort order, and every other patient is hidden.
2. **AC2 — Show all levels**: **Given** a triage-level filter is active, **When** the nurse clears the filter (chooses "Todos" / "All"), **Then** the table shows every active patient again, in the current sort order; "Todos" is the default when the page opens.
3. **AC3 — Sort column choice**: **Given** the patient list, **When** the nurse clicks a column header (triage level, NEWS2 score, patient code or latest reading time), **Then** the rows are re-ordered by that column without a new server request, and that header is marked as the active sort column (an indicator plus `aria-sort`).
4. **AC4 — Sort direction**: **Given** a column is already the active sort column, **When** the nurse clicks its header again, **Then** the same rows are shown in the reversed direction and the header indicator and `aria-sort` reflect the new direction; a column's first click uses its default direction (triage level most urgent first, NEWS2 score highest first, latest reading most recent first, patient code ascending).
5. **AC5 — Default order is the server's**: **Given** the page has just opened and the nurse has not clicked any column header, **When** no sort column is active (whether or not a filter is chosen), **Then** the matching rows are shown in exactly the order the server returned (US-02 "who needs attention first"), unchanged; the filter and the sort are independent, so clearing the filter never changes the current sort and choosing a sort never changes the filter.
6. **AC6 — Filter and sort combine**: **Given** a triage-level filter and a sort column are both active, **When** the list is shown, **Then** the rows are the patients at that triage level, ordered by the chosen column and direction.
7. **AC7 — Patients without readings when sorting by score or time**: **Given** patients without readings ("Sin datos"), **When** the list is sorted by NEWS2 score or by latest reading time, **Then** patients without readings are grouped together at the end whatever the direction (they are never ordered as if their score or time were zero or the newest).
8. **AC8 — Controls survive a refresh**: **Given** the 15-second automatic refresh (US-02) replaces the list, **When** a new list arrives, **Then** the chosen filter and sort are still applied to the new list and are not reset.
9. **AC9 — Filtered empty result**: **Given** a triage-level filter is active, **When** no active patient is at that level, **Then** the table shows a translated "no patients at this level" message (distinct from the US-02 "no active patients" empty state) and the filter control stays usable so the nurse can change or clear it.
10. **AC10 — Result count**: **Given** a filter is active, **When** the list is shown, **Then** the page shows how many patients match (e.g. "3 de 12 pacientes" / "3 of 12 patients") so the nurse can see the filter is narrowing the list.
11. **AC11 — Spanish by default, English switch**: **Given** the controls, **When** the language is Spanish (default) or English, **Then** every new text (filter label and options, sort labels, direction labels, result count, filtered-empty message) is shown in that language using glossary terms; the triage-level options read "Triage I" … "Triage V" (unchanged in both languages) and "Todos" / "All".
12. **AC12 — Keyboard and accessibility**: **Given** the controls, **When** the nurse uses the keyboard only, **Then** the triage-level filter dropdown and each clickable column header are reachable and operable with visible focus (the headers are buttons, activated by Enter/Space), the active sort column and direction are exposed to assistive technology via `aria-sort` on the column header, and color is never the only cue (an icon or text marks the active sort).
13. **AC13 — Existing behavior unchanged**: **Given** the list page, **When** US-09 is in place, **Then** the patient-code link, the `ScoreBadge`, the D-48 triage colors, the automatic refresh, the last-update line, the failed-refresh message, the nurse-only register button, the open-suggestions banner and the health section all behave exactly as in US-02; no backend route, query or response changes.

### Out of Scope

- Any backend change: no new endpoint, no new query parameter on `GET /api/patients`, no change to the server-side default order, no migration. Filtering and sorting are done in the browser on the list already loaded (PROJECT_STATUS, D-49).
- Filtering or sorting by anything other than triage level (filter) and the existing columns triage level, NEWS2 score, patient code and latest reading time (sort). No free-text search, no filter by name, age, sex, risk band or status.
- Multi-level filters (choosing more than one triage level at once) and multi-column sort.
- Pagination, saving the chosen filter/sort between sessions, and per-user defaults.
- Discharged patients (the list only ever contains active patients, from US-02).
- Changing `PatientTable`'s columns, `ScoreBadge`, `RiskBandBadge`, `RegisterPatientButton`, `OpenSuggestionsBanner` or the health section beyond mounting the new controls.

### Edge Cases

- **Filter set to a level with patients, then the refresh removes the last one** (e.g. discharged elsewhere): the next list shows the filtered-empty message (AC9), not stale rows.
- **Sort by latest reading time with ties** (two patients with the same `recorded_at`): the order between them is stable (keeps their relative order from the server list) so the table does not flicker between refreshes.
- **Sort by patient code**: codes are `PAT-<digits>`; ascending order is the natural order of the codes as the server already returns for ties (string order is acceptable for the academic scope; document in Assumptions).
- **All patients lack readings** and the nurse sorts by score or time: every row is in the "no readings" group, kept in the server's order among themselves.
- **Switching language** redraws the controls and the count without a new request and without changing the current filter or sort.
- **The nurse clears the filter while a refresh is in flight**: the control change applies to whatever list is currently shown and to the next list that arrives; no extra request is made.
- **A triage-level value outside 1–5** (should not happen): the filter options are the five known levels only; such a row, if it existed, would simply not match any filter option and would show only under "Todos".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let the nurse filter the patient list by exactly one triage level (Triage I … Triage V) or by "Todos" / "All" (no filter); the default on page open MUST be "Todos".
- **FR-002**: The filter MUST hide every patient not at the chosen triage level and keep the rest in the current sort order; it MUST NOT request the list again from the server.
- **FR-003**: The system MUST let the nurse sort the list by triage level, NEWS2 score, patient code or latest reading time, in ascending or descending order, computed in the browser on the loaded list, with no new server request and no change to the response. The sort control MUST be the table's own column headers: each of the four sortable headers is an activatable control (a button) that sorts by its column; the triage-level filter MUST be a separate dropdown above the table, not a column header.
- **FR-004**: Clicking a sortable column header for the first time MUST sort by its default direction (triage level most urgent first, NEWS2 score highest first, latest reading most recent first, patient code ascending); clicking the already-active header again MUST flip the direction. Exactly one column MUST be the active sort at a time, marked by an indicator and `aria-sort` on that header.
- **FR-005**: While no column header is active (the state on page open, before any header click), the table MUST show the matching rows in exactly the order received from `GET /api/patients` (US-02 order), unchanged. The filter and the sort MUST be independent: changing or clearing the filter MUST NOT change the active sort, and choosing a sort MUST NOT change the filter. US-09 MUST NOT add a separate "reset" control.
- **FR-006**: When sorting by NEWS2 score or latest reading time, patients without readings (`latest_score = null`) MUST be grouped together at the end regardless of sort direction, and MUST keep the server's relative order among themselves; sorting MUST be stable for equal keys so rows do not reorder arbitrarily between refreshes.
- **FR-007**: The chosen filter and sort MUST persist across the 15-second automatic refresh (US-02) and be re-applied to each new list; they MUST reset only when the page is left or reloaded (no persistence between sessions).
- **FR-008**: When a filter leaves no matching patient, the page MUST show a translated "no patients at this level" message, distinct from the US-02 "no active patients" empty state, while keeping the filter control usable.
- **FR-009**: The page MUST show how many patients match the active filter out of the total loaded (e.g. "3 de 12 pacientes" / "3 of 12 patients").
- **FR-010**: Every new UI text (filter label and options, sort column labels, direction labels, result count, filtered-empty message) MUST exist in Spanish (default) and English in `frontend/src/i18n/translations.js`, use glossary terms, and the triage-level options MUST reuse the existing `triageLevel.1`…`triageLevel.5` keys; the glossary MUST gain the new UI texts in the same PR.
- **FR-011**: All controls MUST be keyboard-operable with visible focus (the filter dropdown and the column-header buttons, activated by Enter/Space), MUST expose the active sort column and direction via `aria-sort` on the header, MUST use design tokens only (no raw colors) and icons only from `lucide-react` (decorative), and MUST never use color as the only cue (an icon or text marks the active sort); the raw-color and contrast guard tests MUST keep passing.
- **FR-012**: US-09 MUST NOT change any backend route, query or response, any other page's behavior, or any US-02 behavior listed in AC13; it only adds the filter/sort controls and the ordering/filtering of the already-loaded rows.
- **FR-013**: Automated tests MUST cover: filter by each level and "Todos", sort by each column header (first click = default direction, second click = reversed) with `aria-sort` on the active header, the default (server) order before any header click, filter-and-sort independence (clearing the filter keeps the sort), filter-and-sort combined, the "no readings" grouping when sorting by score/time, controls surviving a refresh, the filtered-empty message, the result count, both languages, both roles (doctor and nurse see the controls), keyboard operability of the dropdown and header buttons, and that the patient-code link and `ScoreBadge` still work.
- **FR-014**: Decision **D-57** MUST be added to `docs/DECISIONS.md`: US-09 filters and sorts in the browser on the `GET /api/patients` answer with no backend change, the default order stays the server's, the sort columns and default directions, and the "no readings" grouping rule. `docs/BACKLOG.md` and `docs/PROJECT_STATUS.md` MUST show US-09 as done when the story is finished.

### Key Entities *(include if feature involves data)*

- **Patient list entry** (existing, US-02): a patient with `identifier` (patient code), `name`, `triage_level`, `admitted_at` and `latest_score` (`recorded_at`, `total`, `band`) or `null`. US-09 reads these fields only; it adds no field and changes none.
- **Filter selection** (new, client-only): the chosen triage level (1–5) or "all"; held in page state, not persisted.
- **Sort selection** (new, client-only): the chosen column (triage level, NEWS2 score, patient code, latest reading time) and direction (ascending/descending); held in page state, not persisted.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A nurse can narrow the list to one triage level and see only those patients in 100% of the filter test cases, with the result count matching the number of rows shown.
- **SC-002**: Sorting by any of the four columns in either direction produces the correct order in 100% of the sort test cases, including ties and patients without readings.
- **SC-003**: With no filter and no sort chosen, the on-screen order equals the server's order in 100% of cases (byte-for-byte row order).
- **SC-004**: The chosen filter and sort survive a 15-second refresh in 100% of the refresh test cases (never reset by the new list).
- **SC-005**: 0 extra requests to `GET /api/patients` are caused by filtering or sorting (the request count is driven only by the US-02 refresh schedule).
- **SC-006**: All existing backend and frontend tests still pass, and every acceptance criterion has at least one automated test.

## Assumptions

- US-09 is **frontend-only**: it reorders and filters the rows that `usePatientList` already holds, so it adds no network traffic and reuses the US-02 refresh, failed-refresh, last-update and health behavior unchanged (PROJECT_STATUS note for US-09, D-49).
- The filter offers the five known triage levels plus "Todos" / "All"; it is a single choice (one level at a time), because the story asks to find "the most urgent patients" quickly, not to build arbitrary combinations.
- Sorting is done with a stable sort so equal keys keep their server order, which avoids rows jumping around on each refresh.
- When sorting by NEWS2 score or latest reading time, "Sin datos" patients are always grouped at the end (not treated as score 0 or as the oldest/newest time), matching how US-02 places them last by default.
- Patient-code sorting uses the codes' natural string order; since codes follow `PAT-<digits>` with the same width in practice, this matches numeric order closely enough for the academic scope (no zero-padding logic added).
- The controls are shown to any signed-in clinician (doctor or nurse), like the rest of the list; US-09 adds no new role rule (clarified 2026-11-21). "Nurse" in the story is the persona, not an access restriction.
- The controls live on the patient list page (US-02) and reuse its `Card`, design tokens and `lucide-react` icons; no new shared component is required outside `pages/patient-list`. The sort affordance is the table's own column headers (clarified 2026-11-21), so `PatientTable` gains clickable sort headers with an `aria-sort` indicator; it still only displays values and never computes a score, band or status (Principle V). `ScoreBadge` and `RiskBandBadge` are not modified.
- Scale is academic (tens of active patients), so in-browser filtering and sorting are instant and pagination is unnecessary.
