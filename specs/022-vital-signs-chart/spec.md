# Feature Specification: Vital Signs Chart

**Feature Branch**: `022-vital-signs-chart`

**Created**: 2026-11-22

**Status**: Draft

**Input**: User description: "Use feature number 022 (directory 022-vital-signs-chart). Use decision number D-53. US-06 (team-session functional story): \"As a doctor, I want a chart of a patient's vital signs history, so that I can see how they evolve\". Depends on US-03 (readings history GET /api/patients/{code}/readings, contract in specs/017-vital-signs-scoring/contracts/readings-api.md) and US-05 (patient detail page), both merged. Respect the constitution v1.3.0, docs/DECISIONS.md and the glossary. Decisions already taken: (1) No new backend endpoint: the chart reads the existing readings history (default 50 readings, newest first; the chart shows them oldest to newest). (2) A new chart component mounted with one line on the patient detail page (do not change the rest of US-05's page), visible to any signed-in clinician (doctor or nurse), read-only. (3) One line at a time with a parameter selector: NEWS2 score (default), respiratory rate, SpO2, systolic blood pressure, heart rate and temperature; on oxygen and consciousness are not charted. Axis labels with units, texts in Spanish by default and English, glossary terms. (4) Chart library: chart.js with react-chartjs-2, pinned to exact versions (no caret, like D-46), recorded in D-53 with license (MIT), bundle impact and npm audit --audit-level=high clean. Colors read from the design tokens at runtime (no raw colors; noRawColors test must pass). (5) Accessibility: the chart has an accessible name and a text alternative (a visually hidden table or summary of the plotted values); color is never the only cue. (6) The chart refreshes every 15 seconds while the page is visible and pauses while the tab is hidden, like the patient list (US-02). (7) No NEWS2 thresholds or risk zones drawn on the chart (Principle V: no NEWS2 rules outside the scoring module). A patient without readings shows a \"no readings yet\" message. Out of scope: export (US-10), prediction (US-08), new endpoints, editing readings."

## Clarifications

### Session 2026-11-22

- Q: Along the time axis, should the readings be spaced by how much time passed between them, or evenly, one step per reading? → A: Evenly: one step per reading, each step labeled with its reading time ("HH:MM:SS", plus the date when it changes; corrected by the user: demo readings are 15 seconds apart, so "HH:MM" would repeat); no date-adapter package, so only the two agreed dependencies are added.
- Q: The chart updates every 15 seconds but the US-05 "current reading" block loads only once; is it acceptable for the chart to be newer, as long as it says when it last updated? → A: Yes. The chart refreshes itself every 15 seconds (paused while the tab is hidden, like the patient list) and shows "En vivo · Actualizado: HH:MM:SS" / "Live · Updated: HH:MM:SS" under it, so it is clear the chart can be newer than the US-05 blocks above, which stay unchanged.

## User Story *(mandatory)*

**Story ID**: US-06

**Type**: Functional (team session)

**Story**: As a doctor, I want a chart of a patient's vital signs history, so that I can see how they evolve.

**Depends on**: US-03 (readings history `GET /api/patients/{code}/readings`, contract `specs/017-vital-signs-scoring/contracts/readings-api.md`) and US-05 (patient detail page), both merged into `main`. Builds on TS-06 (sign-in), TS-12 (UI foundation and tokens), TS-13 (routing) and TS-14 (icons). Allowed by constitution v1.3.0 Principle III (D-52): US-03 and US-05 code is imported or mounted, never modified.

### Acceptance Criteria

<!-- Each criterion must be testable. qa-tester writes at least one test per criterion. -->

1. **AC1 — Chart on the patient detail page**: **Given** a signed-in doctor or nurse on `/patients/<code>` for an existing patient, **When** the page has loaded, **Then** a "vital signs history" chart section is shown, added to the page by mounting one component; the rest of the patient detail page looks and behaves exactly as before.
2. **AC2 — Data from the existing history**: **Given** the chart section, **When** it loads, **Then** it requests the patient's readings from the existing readings history (`GET /api/patients/{code}/readings`, default limit of 50, newest first) and draws them from **oldest (left) to newest (right)**; no new backend endpoint exists for the chart.
3. **AC3 — NEWS2 score by default**: **Given** the chart has loaded, **When** no parameter has been chosen yet, **Then** it shows one line of the stored NEWS2 score of each reading (`score.total`, as stored, never recomputed), with the y-axis labeled "Puntaje NEWS2" ("NEWS2 score" in English) and the x-axis labeled with the reading time.
4. **AC4 — Parameter selector**: **Given** the chart, **When** the clinician picks one of: NEWS2 score, respiratory rate, SpO2, systolic blood pressure, heart rate or temperature, **Then** the chart shows only that parameter as one line, with its y-axis label and unit (e.g. "Frecuencia respiratoria (resp/min)", "Temperatura (°C)"); supplemental oxygen and consciousness are not offered.
5. **AC5 — Accessible chart**: **Given** the chart, **When** it is read with a screen reader or without seeing colors, **Then** it has an accessible name naming the patient code and the chosen parameter, and a text alternative listing every plotted value with its reading time (e.g. a visually hidden table) that always matches the line on screen; the line also has visible point markers, so color is never the only cue.
6. **AC6 — No risk rules on the chart**: **Given** any chosen parameter, **When** the chart is drawn, **Then** it shows no NEWS2 thresholds, risk bands, zones or reference lines, and no value is colored by risk; it only plots stored values (Principle V).
7. **AC7 — No readings yet**: **Given** a patient with no readings, **When** the chart section loads, **Then** it shows a translated "no readings yet" message instead of an empty chart, and no selector.
8. **AC8 — Automatic refresh**: **Given** the patient detail page is open and its tab is visible, **When** 15 seconds pass after the previous request finished, **Then** the readings are requested again and the chart (and its text alternative) is redrawn with the chosen parameter kept, and the line under the chart shows "En vivo · Actualizado: HH:MM:SS" ("Live · Updated: HH:MM:SS") with the time of the last successful update; **When** the tab is hidden, **Then** refreshing pauses, and **when** it becomes visible again the readings are requested at once and the 15-second timer restarts; **When** the clinician leaves the page, **Then** refreshing stops; two requests never overlap.
9. **AC9 — Loading and errors**: **Given** the chart section, **When** the first request is in progress, **Then** a translated loading message is shown; **When** the first request fails (server error, timeout, network), **Then** a fixed, translated error message is shown and the section keeps retrying on the 15-second schedule; **When** a later refresh fails, **Then** the last chart stays on screen with a fixed, translated "could not update" message, removed after the next success; **When** the session has expired (401), **Then** the existing session-expiry handling applies.
10. **AC10 — Spanish by default, English switch**: **Given** the chart section, **When** the language is Spanish (default) or English, **Then** the title, selector, axis labels, units, messages and time labels are shown in that language using glossary terms, decimals follow the language (comma in Spanish, dot in English), and switching language redraws the chart without a new request and keeps the chosen parameter.
11. **AC11 — Design tokens only**: **Given** the chart, **When** it is drawn, **Then** its line, point, grid and text colors are read from the existing design tokens at run time; no raw color is added to the source, and the raw-color and contrast guard tests keep passing.
12. **AC12 — Chart library recorded**: **Given** the finished story, **When** the dependencies are checked, **Then** exactly two runtime dependencies are added, `chart.js` and `react-chartjs-2`, each pinned to an exact version (no caret), with license MIT, and `npm audit --audit-level=high` passes; decision **D-53** records them with their versions, license, bundle impact and the reasons.

### Out of Scope

- Exporting readings (US-10) and deterioration prediction (US-08).
- Any new or changed backend endpoint, and any database change.
- Editing, deleting or entering readings from the chart.
- Charting supplemental oxygen or consciousness, or several parameters at once.
- Drawing NEWS2 thresholds, risk bands or reference ranges, or coloring values by risk.
- Zoom, pan, choosing a date range or a different number of readings.
- Changing the rest of the patient detail page (US-05), `ReadingResult`, `RecordReadingButton`, `RetriageSuggestion` or the readings API (US-03).

### Edge Cases

- **Exactly one reading**: the chart shows a single point (with its marker and value in the text alternative), not an empty chart.
- **More than 50 readings**: only the 50 most recent are shown (the API default); the section says how many readings are shown, e.g. "Últimas 50 lecturas".
- **Equal reading times**: readings keep the API order (newest first by `recorded_at`, then most recently saved), reversed for drawing, so no point is lost.
- **Temperature arrives as a one-decimal string** (US-03 contract): it is converted to a number for drawing and shown with one decimal in the language's format in axis ticks, tooltip and text alternative.
- **A patient whose code is invalid or not found**: the existing US-05 not-found behavior applies; the chart section is not shown and makes no request.
- **Switching parameter during a refresh**: the new parameter is drawn from the data already loaded; the refresh result keeps the chosen parameter.
- **Narrow screens (~360 px)**: the chart fits the card width and stays readable; it never makes the page scroll sideways.
- **Tokens cannot be read** (e.g. in tests without CSS): the chart still renders with the library's neutral defaults and no raw color is written in our source.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The patient detail page MUST show a vital signs chart section added by mounting **one** new component; no other part of the US-05 page MAY change.
- **FR-002**: The chart MUST read data only from the existing readings history `GET /api/patients/{code}/readings` with its default limit (50), using the US-03 contract field names; no new backend endpoint MAY be added.
- **FR-003**: Readings MUST be drawn from oldest (left) to newest (right); the NEWS2 values MUST be the stored `score.total`, never recomputed.
- **FR-004**: The chart MUST show one parameter at a time, chosen with a labeled selector offering exactly: NEWS2 score (default), respiratory rate, SpO2, systolic blood pressure, heart rate and temperature; supplemental oxygen and consciousness MUST NOT be offered.
- **FR-005**: The y-axis MUST be labeled with the parameter name and unit, and the x-axis with the reading time; readings MUST be spaced evenly (one step per reading, not proportional to elapsed time), each step labeled with its local 24-hour time with seconds ("HH:MM:SS", plus the date when it changes), using the existing translated parameter labels (`parameter.*`) and glossary terms.
- **FR-006**: The chart MUST have an accessible name (patient code and parameter) and a text alternative listing every plotted value with its reading time, kept in sync with the line; the line MUST have visible point markers so color is never the only cue.
- **FR-007**: The chart MUST NOT draw NEWS2 thresholds, risk bands, zones or reference lines, nor color values by risk; no NEWS2 rule MAY appear outside the scoring module (Principle V).
- **FR-008**: A patient with no readings MUST show a translated "no readings yet" message and no chart or selector.
- **FR-009**: While the page is open and the tab visible, the readings MUST be requested again 15 seconds after the previous request finishes; refreshing MUST pause while the tab is hidden, request at once when it becomes visible again, stop when the page is left, and never overlap; the chosen parameter MUST be kept across refreshes. Under the chart a line MUST show "En vivo · Actualizado: HH:MM:SS" / "Live · Updated: HH:MM:SS" (local 24-hour time of the last successful update), making clear the chart can be newer than the US-05 blocks above, which MUST stay unchanged.
- **FR-010**: The section MUST show a translated loading message on first load, a fixed translated error message when the first load fails (retrying every 15 s), and keep the last chart with a fixed translated "could not update" message when a later refresh fails; a 401 MUST use the existing session-expiry handling; server text MUST never be shown.
- **FR-011**: Every new UI text MUST exist in Spanish (default) and English in the translations file and use glossary terms; numbers MUST use the language's decimal format and times the 24-hour clock; switching language MUST redraw without a new request.
- **FR-012**: Chart colors MUST be read from the existing design tokens at run time; no raw color MAY be added anywhere in `src/`; the raw-color and contrast guard tests MUST keep passing.
- **FR-013**: The frontend MUST add exactly two runtime dependencies, `chart.js` and `react-chartjs-2`, pinned to exact versions with license MIT; `npm audit --audit-level=high` MUST pass; no other dependency MAY change.
- **FR-014**: Decision **D-53** MUST be added to `docs/DECISIONS.md` (library choice, exact versions, license, bundle impact, tokens read at run time, no risk zones, reasons and rejected options); the glossary MUST gain the new UI texts; `docs/BACKLOG.md` and `docs/PROJECT_STATUS.md` MUST show US-06 as done when the story is finished.
- **FR-015**: Automated tests MUST cover: the mount on the detail page, data order (oldest → newest), default NEWS2 line from stored totals, each selector option and its axis label, the text alternative matching the data, no risk annotations, no-readings message, loading, first-load error, failed refresh, 15-second refresh with visibility pause and stop on leave, both languages and decimal format, and that the rest of the detail page is unchanged.

### Key Entities *(include if feature involves data)*

- **Reading** (existing, US-03): `recorded_at` and the seven vital signs; the chart uses `respiratory_rate`, `spo2`, `systolic_bp`, `heart_rate`, `temperature` (one-decimal string) and the stored `score.total`.
- **Chart parameter** (new, UI only): one of NEWS2 score, respiratory rate, SpO2, systolic blood pressure, heart rate, temperature; each with its translated label and unit.
- **Chart point** (new, UI only): one reading's time and the chosen parameter's value.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A clinician sees how the chosen vital sign evolved over the last (up to) 50 readings in one view, and switches between the 6 parameters with one action each.
- **SC-002**: A new reading appears on an open patient detail chart within 15 seconds, without reloading the page.
- **SC-003**: 100% of plotted values also appear in the text alternative with their reading time, in the test cases.
- **SC-004**: 0 NEWS2 thresholds, risk zones or risk colors appear on the chart for any parameter.
- **SC-005**: 0 raw colors are added to the source; exactly 2 new runtime dependencies, both pinned and MIT; the dependency audit reports 0 high or critical findings.
- **SC-006**: The rest of the patient detail page is unchanged: every existing US-05 test still passes.
- **SC-007**: All existing backend and frontend tests still pass, and every acceptance criterion has at least one automated test.

## Assumptions

- The parameter selector is a native labeled `<select>` (keyboard and screen-reader friendly by default); the default is the NEWS2 score.
- The chart section sits below the existing current-reading and triage-history blocks of the patient detail page, inside the page's loaded state only (not on the not-found or load-error states); the exact mount point is chosen in the plan, touching only the mount line.
- The x-axis spaces readings evenly, one step per reading (confirmed in Clarifications), labeled with 24-hour local clock times with seconds (`HH:MM:SS`, with the date when it changes, because demo readings are 15 seconds apart); gaps in time are therefore not shown as distances, but every time is visible on the axis, the tooltip and the text alternative, which shows the full local date and time.
- The y-axis range is chosen automatically by the library from the plotted values; no NEWS2-specific scale (e.g. 0–20) is set in code, so Principle V is respected.
- The refresh logic follows the same rules as US-02's patient list (chained 15 s timer, visibility pause); US-06 may import a merged helper unchanged or write its own small hook, but MUST NOT modify US-02 code (D-52).
- Line and point colors use existing tokens (e.g. the primary and text tokens); no new token is needed. If the plan finds one is needed, it is added to `tokens.css` under D-43 rules and recorded in D-53.
- The chart library uses a static import; bundle impact measured and recorded in D-53.
- Scale is academic: at most 50 points per chart; no performance work beyond the library defaults.
