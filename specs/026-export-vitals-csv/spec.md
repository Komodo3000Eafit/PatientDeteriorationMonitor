# Feature Specification: Export Vital Signs to CSV

**Feature Branch**: `026-export-vitals-csv`

**Created**: 2026-11-22

**Status**: Draft

**Input**: User description: "US-10 — As a doctor, I want to export a patient's vital signs to CSV, so that I can share or analyze them. Depends on US-03 (merged). Vertical baseline functional story. Add a way, from the patient detail page (US-05, /patients/:identifier), to export that patient's vital-signs readings to a CSV file the browser downloads; the mechanism (CSV built in the frontend from GET /api/patients/{identifier}/readings, or a new backend CSV endpoint) is a plan decision. The CSV contains the stored values and the stored NEWS2 score/band per reading (never recomputed): reading timestamp, the seven vital signs, NEWS2 total and risk band, with a header row; temperature is the stored one-decimal value. Authenticated users only. A patient with no readings exports a header-only CSV without crashing. The filename identifies the patient and is safe. Independence: only mount the export control on the patient detail page. Reuse Button (TS-12) and a decorative lucide Download icon (TS-14); tokens only; all UI text via i18n (Spanish default + English). Security: nothing sensitive logged, CSV-injection guard (= + - @), synthetic data. No NEWS2 recomputation; no new dependency unless justified."

## User Story *(mandatory)*

**Story ID**: US-10

**Type**: Functional (team-session)

**Story**: As a doctor, I want to export a patient's vital signs to CSV, so that I can share or analyze them.

**Depends on**: US-03 (stored readings and scores, readings contract), merged. It also reuses the merged foundation: TS-06 (authentication), TS-12 (UI foundation, `Button`), TS-13 (client routing, `<RequireAuth>`), TS-14 (icon library), and mounts its control on the merged US-05 patient detail page. It depends on no other team-session story (US-06 to US-09).

## Clarifications

### Session 2026-11-22

- Q: Who should be allowed to export a patient's CSV: any signed-in clinician (doctor or nurse), or doctors only? → A: Any signed-in clinician (doctor or nurse); signed-out users cannot. No role check is added.
- Q: In which order should the rows appear in the CSV: newest reading first, or oldest first (in time order)? → A: Oldest first, in time order (`recorded_at` ascending; readings with the same time keep the order they were saved).
- Q: How should the reading time appear in the CSV: the stored UTC time in ISO 8601, or the user's local time? → A: The stored UTC time in ISO 8601, exactly as the readings contract returns it (no conversion).

### Acceptance Criteria

<!-- Each criterion must be testable. qa-tester writes at least one test per criterion. -->

1. **AC1 — Doctor exports the readings with their stored score and band**: **Given** a signed-in clinician on the patient detail page of a patient that has one or more readings, **When** they activate the "export CSV" control, **Then** the browser downloads one CSV file that has a header row followed by exactly one data row per stored reading of that patient (all of them, oldest first in time order), and each row holds the reading time, the seven vital signs as stored, and the **stored** NEWS2 total and risk band of that reading, never recomputed.

2. **AC2 — Fixed columns and value format**: **Given** an exported CSV, **When** it is read, **Then** the header row is exactly `recorded_at,respiratory_rate,spo2,on_oxygen,systolic_bp,heart_rate,consciousness,temperature,news2_total,risk_band`, in that order; `recorded_at` is the stored time in ISO 8601 UTC, exactly as the readings contract returns it (e.g. `2026-11-20T15:04:05.123456Z`), never converted to local time; `on_oxygen` is `true` or `false`; `consciousness` is the ACVPU code (`A`, `C`, `V`, `P`, `U`); `temperature` is the stored one-decimal value (e.g. `37.0`, never `37`); `risk_band` is the stored band code (`low`, `low-medium`, `medium`, `high`); the file is UTF-8, comma-separated, one line per record, and a field is quoted only when it contains a comma, a double quote or a line break (inner quotes doubled).

3. **AC3 — Filename identifies the patient and is safe**: **Given** an export for a patient, **When** the file is downloaded, **Then** its name is `<patient code>-vital-signs-<YYYY-MM-DD>.csv` (e.g. `PAT-001-vital-signs-2026-11-22.csv`, the date being the export date); the patient code is used only when it matches the patient-code format (upper-case letters, digits and `-`, 1 to 20 characters), so no other patient field and no path, quote or control character can reach the filename.

4. **AC4 — Patient with no readings exports a header-only file**: **Given** a signed-in clinician on the detail page of a patient with no readings (e.g. just registered), **When** they activate the export control, **Then** the control is shown and works, the downloaded CSV contains only the header row, the page does not crash, and no row or value is fabricated.

5. **AC5 — Signed-out users cannot reach the export**: **Given** a signed-out visitor, **When** they open the patient detail page, **Then** they are redirected to the login page and the export control is never rendered; **and** any server read the export uses answers 401 without a valid token and returns no reading data.

6. **AC6 — CSV injection is neutralized**: **Given** a value to be written to the CSV that starts with `=`, `+`, `-`, `@`, a tab or a carriage return, **When** the CSV is generated, **Then** that field is written with a leading single quote (`'`) so that a spreadsheet treats it as text and never as a formula; values that do not start with one of those characters are written unchanged. This guard is applied to every field, even though the stored readings are typed values.

7. **AC7 — Export failures are handled without a broken file**: **Given** the export is in progress, **When** the patient does not exist (404), the service is unavailable (503), the network fails or times out, **Then** no file is downloaded, a fixed translated "could not export" message is shown (never raw server text), and the page stays usable; on a 401 the existing session-expiry handling sends the user to the login page. While an export is running the control cannot be activated again.

8. **AC8 — Spanish by default, English switch**: **Given** the export control and its messages, **When** the language is Spanish (default) or English, **Then** the control label, its busy state and the error message appear in that language from the translations file using glossary terms. The CSV header row and values are the same in both languages (fixed, machine-readable column names).

9. **AC9 — Shared UI, tokens and guards**: **Given** the export control, **When** it renders, **Then** it uses the shared `Button` (TS-12) with a decorative `Download` icon from `lucide-react` (`aria-hidden`, `focusable="false"`, em-sized, `currentColor`); any styling uses design tokens only; the existing raw-color and contrast guard tests keep passing.

10. **AC10 — Independence**: **Given** the codebase after this story, **When** the diff is reviewed, **Then** the only change to another functional story's code is one line that mounts the export control on `PatientDetailPage` (US-05) plus its import; no US-02, US-03, US-04 or US-05 logic, endpoint, component or test is changed, and NEWS2 is not computed anywhere in this story.

### Out of Scope

- Exporting more than one patient at once, or the patient list (US-02).
- Choosing a date range, columns, delimiter or file format (Excel, PDF, JSON); the export is always all readings, fixed columns, CSV.
- Exporting the per-parameter score explanation (`entries`), the triage history, alerts or patient demographics (name, age, sex). The patient is identified only by the code in the filename.
- Translated column headers or locale-specific number formats inside the file.
- Restricting the export to one role; any signed-in clinician who can open the detail page may export.
- Recomputing NEWS2, adding a migration or changing the readings contract.
- Charts or any analysis inside the app (US-06, US-08).

### Edge Cases

- **No readings**: header-only CSV (AC4); no empty-row, no "no data" text inside the file.
- **Many readings** (the simulator saves one every 5 minutes): every stored reading is exported, not only the most recent page shown elsewhere in the app.
- **Discharged patient**: the export still works and contains the stored readings (read-only).
- **Badly-formatted code in the address**: the detail page already shows the not-found page, so no export control and no request.
- **Well-formed code with no such patient**: the export answers "could not export" (AC7); no file.
- **Session expires before export**: 401 handling sends the user to the login page; no file.
- **Double click on the control**: only one export runs; the control shows a busy state until it ends.
- **Language switched while on the page**: the control label changes; the file content is unchanged.
- **Value starting with `-`, `=`, `+`, `@`, tab or CR**: prefixed with `'` (AC6). With current validation no stored value starts with these characters (no negative numbers; `low-medium` starts with `l`), so the guard is tested with crafted input.
- **Temperature with a trailing zero** (`37.0`): kept as `37.0`, never `37`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The patient detail page MUST show an "export CSV" control for a valid patient code, mounted with one line (plus import) in `PatientDetailPage`; the control is a new component owned by this story.
- **FR-002**: Activating the control MUST make the browser download one CSV file with all the stored readings of that patient, oldest first in time order: `recorded_at` ascending, and readings with the same time in the order they were saved (the exact reverse of the readings contract's newest-first order) (clarified 2026-11-22).
- **FR-003**: The CSV MUST have the header row and columns of AC2, one data row per reading, with the values exactly as stored and returned by the readings contract (`specs/017-vital-signs-scoring/contracts/readings-api.md`): `recorded_at`, the seven vital signs, `score.total` as `news2_total` and `score.band` as `risk_band`. NEWS2 MUST NOT be recomputed.
- **FR-004**: Temperature MUST be written from the stored one-decimal string, unchanged.
- **FR-005**: The CSV MUST follow AC2's format (UTF-8, comma separator, header row, quoting only when needed with doubled inner quotes).
- **FR-006**: Every field MUST pass the CSV-injection guard of AC6 before being written.
- **FR-007**: The filename MUST follow AC3; when the code does not match the patient-code format the export MUST NOT run (the detail page shows not-found in that case anyway).
- **FR-008**: A patient with no readings MUST produce a header-only CSV (AC4).
- **FR-009**: The export MUST be available only to authenticated users: the control lives inside the existing `<RequireAuth>` route, and every server read it uses MUST require a valid token (`Depends(get_current_user)`, 401 otherwise) and validate the patient code (404 with a fixed message for an unknown or badly-formatted code). Any signed-in clinician (doctor or nurse) may export; no role check and no 403 case are added (clarified 2026-11-22).
- **FR-010**: Errors MUST follow AC7: no file, fixed translated message, no raw server text, existing 401 handling, control disabled while running.
- **FR-011**: Nothing sensitive MUST be logged: no reading values, patient fields or tokens in browser or server logs; server errors are logged by error type only.
- **FR-012**: The control MUST reuse the shared `Button` and a decorative `lucide-react` `Download` icon, use design tokens only, and keep the raw-color and contrast guard tests passing (AC9).
- **FR-013**: All UI texts (label, busy state, error message) MUST come from the translations file in Spanish (default) and English and use glossary terms; any new UI term MUST be added to `docs/GLOSSARY.md` in the same pull request.
- **FR-014**: The story MUST NOT add a dependency unless the plan justifies it (Principle XII), MUST NOT add a migration, and MUST NOT change the readings contract or other functional stories' code beyond FR-001's mount (AC10).
- **FR-015**: Automated tests MUST cover the CSV generation (header, column order, value format including temperature and booleans, oldest-first order including readings with the same time, stored score/band, header-only for no readings, quoting, injection guard for each trigger character, filename and its sanitization) and the frontend control (renders on the detail page, triggers the download, busy state, error message, both languages, absent when signed out). If the plan adds a server endpoint, it MUST also be tested for 200, 401, 404 and 503.
- **FR-016**: When the story is finished, `docs/BACKLOG.md` and `docs/PROJECT_STATUS.md` MUST show US-10 as done, and the chosen export mechanism MUST be recorded in `docs/DECISIONS.md`.

### Key Entities *(include if feature involves data)*

- **Reading** (existing `vital_signs` + `reading_scores`, unchanged): source of every CSV row: time, seven vital signs, stored NEWS2 total and risk band.
- **Patient** (existing, unchanged): only its patient code is used, in the filename.
- **CSV export** (not stored): a file built on request, a header row plus one row per reading, downloaded by the browser.
- **User** (existing): the signed-in clinician who exports.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in doctor can download a patient's CSV from the detail page with one action, in under 5 seconds for a patient with a day of readings (about 300).
- **SC-002**: 100% of the rows in an exported file match the stored readings one to one (same count, same values, same stored NEWS2 total and band); 0 scores are recomputed.
- **SC-003**: The exported file opens in a common spreadsheet program with the 10 columns in the right order and no value interpreted as a formula.
- **SC-004**: 100% of exports for a patient with no readings produce a header-only file, with 0 crashes.
- **SC-005**: 100% of signed-out attempts are refused (redirect to login, or 401 from the server); 0 reading values are returned to them.
- **SC-006**: 100% of the control's texts appear in Spanish by default and in English after switching; 0 raw colors added (guard test passes).
- **SC-007**: All existing backend and frontend tests still pass, and every acceptance criterion has at least one automated test.

## Assumptions

- "All readings" means the patient's complete stored history. The existing readings listing returns at most 200 readings per request, which is about 16 hours of simulator readings; the plan must choose a mechanism that still exports every reading (e.g. several requests, or a server export), without changing the readings contract.
- Column names are fixed English keys taken from the readings contract (plus `news2_total` and `risk_band`), the same in both UI languages, so the file is easy to analyze with tools. The file holds codes (`A`, `low-medium`, `true`) rather than translated labels.
- Rows are oldest first (time order), because the file is meant for sharing and analysis; the app screens keep showing readings newest first (clarified 2026-11-22).
- Times are written as the stored ISO 8601 UTC value, unconverted, so the file is unambiguous for anyone it is shared with (clarified 2026-11-22).
- The export date in the filename is the user's local date.
- The CSV-injection guard uses the common approach of prefixing a single quote. Stored readings are typed and validated, so the guard is a defense in depth that must still be tested.
- Any signed-in clinician (doctor or nurse) may export, matching the read access of the detail page and the readings listing; the story names the doctor as the main user (clarified 2026-11-22).
- The export control sits next to the existing record-reading control at the top of the detail page; its exact placement is a plan/UI detail.
- No new dependency is expected: CSV for these typed values can be written with the language's standard tools.
