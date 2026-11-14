# Feature Specification: Clinical Scoring Module

**Feature Branch**: `007-clinical-scoring-module`

**Created**: 2026-11-13

**Status**: Draft

**Input**: User description: "TS-07 — Clinical scoring module (technical story, depends on TS-01). As a clinician, I want each set of vital signs scored with a standard early-warning score that explains every point, so that I can trust and challenge the patient's risk level. Acceptance criteria: A replaceable scoring interface in the backend: given one set of vital signs (respiratory rate, SpO2, on supplemental oxygen, systolic BP, heart rate, consciousness ACVPU, temperature — the TS-03 fields), it returns the total score, a risk band, and for each parameter the value, the points and the rule that gave them. No code outside the module may depend on NEWS2 rules (constitution V, D-08), so the Colombian scheme can replace it later. NEWS2 is the implementation, SpO2 Scale 1 only (Scale 2 for hypercapnic patients needs a per-patient flag that doesn't exist yet — out of scope, noted for later): Respiratory rate: ≤8 → 3; 9–11 → 1; 12–20 → 0; 21–24 → 2; ≥25 → 3. SpO2: ≤91 → 3; 92–93 → 2; 94–95 → 1; ≥96 → 0. Supplemental oxygen: yes → 2; no (air) → 0. Systolic BP: ≤90 → 3; 91–100 → 2; 101–110 → 1; 111–219 → 0; ≥220 → 3. Heart rate: ≤40 → 3; 41–50 → 1; 51–90 → 0; 91–110 → 1; 111–130 → 2; ≥131 → 3. Consciousness: A → 0; C, V, P or U → 3. Temperature (°C): ≤35.0 → 3; 35.1–36.0 → 1; 36.1–38.0 → 0; 38.1–39.0 → 1; ≥39.1 → 2. Risk band: total 0–4 → low; any single parameter scoring 3 (with total ≤4) → low-medium; 5–6 → medium; ≥7 → high. (Verify these against the official RCP NEWS2 chart in research.) Reasons are returned as structured data (parameter, value, points, range), not as sentences, so the UI can show them in Spanish or English later. Invalid input (missing parameter, impossible value such as SpO2 > 100, unknown consciousness code) is rejected with a clear error, never scored. Automated tests cover every range boundary of every parameter (both sides of each threshold), each risk band including the 'single 3' rule, a few full worked examples, and invalid input. No database, network or API needed. backend/README.md explains the interface and how a different scoring system would be plugged in. Out of scope: storing scores or calling the module from an endpoint (US-03), escalating triage levels and creating alerts (US-04), mapping the risk band to triage levels or alert severity (US-04), any UI, SpO2 Scale 2. Keep it as simple as possible (D-23): pure Python, no new dependencies."

## Clarifications

### Session 2026-11-13

- The three spec decisions are accepted as written: the accepted value ranges, strict input types, and the band identifiers `low`, `low-medium`, `medium`, `high` (user, 2026-11-13).
- Q: How does the API story (US-03) validate input with the same limits? → A: The module exports the accepted value ranges as public, generic data (per parameter: lower and upper limit, or allowed values) that US-03 reuses; the numbers are defined once, in the module (FR-011).

## User Story *(mandatory)*

**Story ID**: TS-07

**Type**: Technical

**Story**: As a clinician, I want each set of vital signs scored with a standard early-warning score that explains every point, so that I can trust and challenge the patient's risk level.

**Depends on**: TS-01

### Acceptance Criteria

1. **AC1**: **Given** one complete, valid set of the seven vital signs (respiratory rate, SpO2, on supplemental oxygen, systolic blood pressure, heart rate, consciousness ACVPU, temperature), **When** the backend scores it, **Then** the result contains the total score, the risk band, the name of the scoring system used, and exactly one explanation entry per parameter with the parameter, the value received, the points given and the range that gave them; **and** the total equals the sum of the seven points.
2. **AC2**: **Given** the NEWS2 implementation, **When** each parameter is scored on both sides of every threshold in the table below (FR-003), **Then** it gets exactly the listed points (for example respiratory rate 8 → 3 and 9 → 1; 11 → 1 and 12 → 0; 20 → 0 and 21 → 2; 24 → 2 and 25 → 3; temperature 35.0 → 3 and 35.1 → 1).
3. **AC3**: **Given** a scored set, **When** the risk band is assigned, **Then** total 0–4 with no parameter at 3 → `low`; total 0–4 with at least one parameter at 3 → `low-medium`; total 5–6 → `medium`; total 7 or more → `high` (regardless of any single 3).
4. **AC4**: **Given** a set with a missing parameter, an extra unknown parameter, a value of the wrong type, an impossible value (e.g. SpO2 above 100, a negative heart rate, a temperature outside the plausible range) or an unknown consciousness code, **When** the backend is asked to score it, **Then** it is rejected with a clear error naming each offending parameter, and no score or partial result is returned.
5. **AC5**: **Given** the code base, **When** it is searched outside the scoring module (and its tests), **Then** no NEWS2 thresholds, points or band rules appear there; other code uses only the generic scoring interface, so a different scoring system (e.g. the Colombian triage regulation) can replace NEWS2 by adding a new implementation and changing one selection point.
6. **AC6**: **Given** a fresh clone with no database and no network, **When** a developer runs `python -m pytest` in `backend/`, **Then** tests for every threshold boundary of every parameter, every risk band including the "single 3" rule, at least three full worked examples and every kind of invalid input pass, and all existing tests keep passing.
7. **AC7**: **Given** a teammate reading `backend/README.md`, **When** they need to score vital signs or add another scoring system, **Then** the README explains the input, the result (total, band, explanation entries), the possible errors, and the steps to plug in a different scoring system.

### Out of Scope

- Storing scores or calling the module from an endpoint (US-03).
- Escalating triage levels and creating alerts (US-04).
- Mapping the risk band to triage levels or alert severity (US-04).
- Any user interface or translated text; explanations are data only.
- NEWS2 SpO2 Scale 2 for hypercapnic respiratory failure (needs a per-patient flag that does not exist yet; noted for a later story).
- The NEWS2 "new confusion" nuance and the clinical response/monitoring-frequency recommendations that go with each band (US-04 decides what the app does with a band).
- Deterioration prediction or trends across several readings (US-08 and later).
- The Colombian triage scheme itself (only the ability to plug it in).

### Edge Cases

- All seven parameters normal (total 0): band `low`, every explanation entry shows 0 points.
- Total 4 made only of 1- and 2-point parameters → `low`; total 3 made of a single 3 (e.g. consciousness V) → `low-medium`.
- A single 3 plus enough other points to reach 5 or 7 → `medium` or `high`, never `low-medium`.
- Maximum possible score (every parameter at its highest points: 3+3+2+3+3+3+3 = 20, temperature ≤35.0 scoring 3) → `high`.
- Temperature exactly on a boundary (35.0, 35.1, 36.0, 36.1, 38.0, 38.1, 39.0, 39.1) scores by the table; temperatures with more than one decimal are rejected (they cannot be stored by TS-03 and would fall between NEWS2 ranges).
- Integer parameters given with a fractional part (e.g. heart rate 90.5) are rejected, not rounded.
- On supplemental oxygen given as anything other than yes/no (true/false), e.g. the text "yes" or the number 1, is rejected.
- Consciousness given in lower case (e.g. "a") or with spaces is rejected; only the exact codes A, C, V, P, U are accepted.
- SpO2 of exactly 100 and 0 are accepted (0 is implausible but stored by TS-03; it scores 3); 101 is rejected.
- Several parameters invalid at once: the error lists all of them, not only the first.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The backend MUST provide one generic scoring interface: it takes one set of the seven vital signs (the TS-03 `vital_signs` fields) and returns a result with the total score, the risk band, the scoring system's name, and a list of explanation entries, one per parameter in a fixed order.
- **FR-002**: Each explanation entry MUST be structured data, not a sentence: the parameter's identifier, the value received, the points given, and the range that gave them (lower and upper bound, either of which may be open, or the matching category for yes/no and consciousness). The UI can translate these later.
- **FR-003**: NEWS2 (Royal College of Physicians, 2017), SpO2 Scale 1, MUST be the implementation, with these points:

  | Parameter | 3 | 2 | 1 | 0 | 1 | 2 | 3 |
  |---|---|---|---|---|---|---|---|
  | Respiratory rate (breaths/min) | ≤8 | | 9–11 | 12–20 | | 21–24 | ≥25 |
  | SpO2 Scale 1 (%) | ≤91 | 92–93 | 94–95 | ≥96 | | | |
  | Supplemental oxygen | | yes | | no (air) | | | |
  | Systolic BP (mmHg) | ≤90 | 91–100 | 101–110 | 111–219 | | | ≥220 |
  | Heart rate (beats/min) | ≤40 | | 41–50 | 51–90 | 91–110 | 111–130 | ≥131 |
  | Consciousness | | | | A | | | C, V, P or U |
  | Temperature (°C) | ≤35.0 | | 35.1–36.0 | 36.1–38.0 | 38.1–39.0 | ≥39.1 | |

  The plan's research MUST check this table and the bands (FR-004) against the official RCP NEWS2 chart and record the source; any difference is raised before implementation.
- **FR-004**: The risk band MUST be one of four fixed identifiers: `low` (total 0–4, no single parameter at 3), `low-medium` (total 0–4 with at least one parameter at 3), `medium` (total 5–6), `high` (total ≥7). Band identifiers are generic so another scoring system can use the same set.
- **FR-005**: Input MUST be validated before any scoring. A set MUST be rejected, with one clear error that lists every offending parameter and why, when: a parameter is missing or unknown; a value has the wrong type (integers for respiratory rate, SpO2, systolic BP and heart rate; yes/no for supplemental oxygen; one of `A`, `C`, `V`, `P`, `U` for consciousness; a number with at most one decimal for temperature); or a value is outside the accepted range (see Assumptions). A rejected set MUST NOT produce any score.
- **FR-006**: No code outside the scoring module MAY contain or depend on NEWS2 thresholds, points or band rules (constitution V, D-08). Callers MUST obtain the scorer through one selection point that returns the current implementation, so a different scoring system can be added as a new implementation of the same interface and selected there without changing callers.
- **FR-007**: Scoring MUST be deterministic and have no side effects: no database, network, files, clock or environment settings; the same input always gives the same result.
- **FR-008**: The module MUST use only Python and its standard library (plus what the backend already uses); no new dependencies (D-23).
- **FR-009**: Automated tests MUST cover: both sides of every threshold of every parameter in FR-003; every band in FR-004 including a single 3 with total ≤4, a single 3 with total ≥5, and totals 4/5 and 6/7; at least three full worked examples checked by hand (total, band and every entry); every invalid-input case in FR-005 and the edge cases above; and a check that the result's total is the sum of the entries. They MUST run without database, network or API, and all existing backend tests MUST keep passing.
- **FR-010**: `backend/README.md` MUST document the scoring interface (input fields and accepted values, result fields, band identifiers, errors) and the steps to plug in a different scoring system. `docs/PROJECT_STATUS.md` and `docs/BACKLOG.md` MUST be updated when the story is done, and SpO2 Scale 2 MUST be recorded as a note for a later story.
- **FR-011**: The module MUST export the accepted value ranges (see Assumptions) as public data available through the generic interface: for each parameter, its lower and upper limit, or its allowed values (yes/no, the ACVPU codes), and for temperature the one-decimal rule. The validation in FR-005 MUST use this same data, so the limits are defined in exactly one place, and later API code (US-03) MUST validate input with it instead of repeating the numbers. These limits describe plausible input, not NEWS2 scoring rules, so using them outside the module does not break FR-006. A test MUST check that every exported limit is accepted and that one step beyond it is rejected.

### Key Entities

- **Vital signs set (input)**: the seven parameters of one reading, matching the TS-03 `vital_signs` columns: respiratory rate, SpO2, on supplemental oxygen, systolic BP, heart rate, consciousness, temperature. No patient identity or time; the module scores values only.
- **Score result**: scoring system name (e.g. `NEWS2`), total score, risk band, and the ordered list of explanation entries. Its total and the triggering parameters are what US-03 will store and US-04 will turn into an alert reason.
- **Explanation entry**: parameter identifier, value, points, and the range (bounds or category) that gave the points.
- **Accepted value ranges**: per parameter, the lower and upper limit (or allowed values) of plausible input; exported by the module and reused by US-03 (FR-011).
- **Risk band**: one of `low`, `low-medium`, `medium`, `high`.
- **Scoring system**: any implementation of the generic interface; NEWS2 is the only one now, the Colombian triage scheme may be added later.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the threshold boundary values of the seven parameters (both sides of every threshold) score exactly as in the NEWS2 table.
- **SC-002**: 100% of tested invalid sets are rejected with an error that names every offending parameter, and none of them returns a score.
- **SC-003**: For every scored set, a clinician can trace each point of the total to one parameter, its value and its range from the result alone, with no extra lookup.
- **SC-004**: A search of the repository outside the scoring module and its tests finds zero NEWS2 thresholds or band rules.
- **SC-005**: A teammate can explain, from the README alone, how to add a second scoring system in under 10 minutes of reading.
- **SC-006**: The whole backend test suite (new and existing tests) passes with no database and no network in under 30 seconds.

## Assumptions

- The input uses the TS-03 field names and units: respiratory rate in breaths/min, SpO2 in %, systolic BP in mmHg, heart rate in beats/min, temperature in °C with one decimal, consciousness as a single ACVPU letter, on supplemental oxygen as yes/no.
- Accepted ranges (anything outside is "impossible" and rejected): respiratory rate 0–80, SpO2 0–100, systolic BP 0–300, heart rate 0–300, temperature 25.0–45.0 °C. These are generous plausibility limits for a synthetic-data prototype, consistent with the TS-03 database checks (non-negative, SpO2 0–100). Confirmed in Clarifications; the module exports them for US-03 (FR-011).
- The NEWS2 table and bands given in the story match the RCP NEWS2 (2017) chart, as far as known when writing this spec; the plan's research confirms it (FR-003).
- The module is plain backend code called directly as a function (no endpoint in this story); US-03 calls it when saving a reading and US-04 uses the band.
- The errors are for developers and later API code (US-03 turns them into HTTP 422); they do not need to be translated.
- The scoring system's name is part of the result so stored scores can later show which system produced them if NEWS2 is replaced.
