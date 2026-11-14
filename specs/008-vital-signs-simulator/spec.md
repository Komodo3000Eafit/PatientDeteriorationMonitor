# Feature Specification: Vital Signs Simulator

**Feature Branch**: `008-vital-signs-simulator`

**Created**: 2026-11-13

**Status**: Draft

**Input**: User description: "TS-08 — Vital signs simulator (technical story, depends on TS-03; uses TS-07's accepted limits). As a demo presenter, I want synthetic vital-sign readings generated for each active patient on a schedule, so that the app shows realistic monitoring and deterioration without real patient data. Acceptance criteria: A documented command creates a small set of synthetic demo patients (e.g. PAT-001 to PAT-006, synthetic names, active, initial triage levels), re-runnable without duplicates, like the TS-06 demo users. A documented simulator command generates one reading (all 7 NEWS2 inputs from TS-03) for every active patient each round. The default interval is 5 minutes (constitution); a demo mode uses a short interval (e.g. 10–30 seconds). Each demo patient follows a scenario: stable, slowly deteriorating, or rapidly deteriorating, so a demo shows a patient getting worse over a few rounds. Values change gradually with small random noise; a seed option makes runs reproducible. Every generated value is within TS-07's ACCEPTED_LIMITS with the right types (whole numbers, temperature with one decimal, ACVPU code, oxygen yes/no), checked with TS-07's validation before saving. Readings are saved through one 'record a reading' function (patient + vital signs) that later stories (US-03) extend to score and react; the simulator never writes vital_signs directly. Cost control (constitution): the simulator runs only when started by hand, stops by itself after a configurable time (sensible default, e.g. 60 minutes) or number of rounds, has a 'one round and exit' option, and stops cleanly on Ctrl+C. It never starts with the API. Clear output per round (patient identifiers and a short summary, no secrets); a missing or unreachable database gives a clear error without the connection string. Automated tests, no real database or network: scenario value generation (stays within limits, deteriorating scenarios trend worse, same seed gives same values), the record function (with a test database like TS-06's SQLite approach), the stop conditions, and the patient seed command. Existing tests keep passing. backend/README.md explains both commands and their options. A one-time manual check on Neon (seed patients, one round, readings listed) is recorded in the PR. Out of scope: scoring or storing scores (US-03), escalation and alerts (US-04), any API endpoint or UI, a background or always-on scheduler, real or public datasets (synthetic only, D-09). Keep it as simple as possible (D-23): standard library only (random, time, argparse), no new dependencies."

## Clarifications

### Session 2026-11-13

- Q: Does each simulator run restart scenarios from the beginning or continue? → A: Continue. A patient's scenario step is the number of readings already saved for that patient; generated values depend only on (seed, patient, step), so runs stay reproducible.
- Q: How can a presenter start a rehearsal again from a clean state? → A: The demo-patient command gets a reset option that deletes the readings, triage events and alerts of the demo patients only, restores their initial triage level and initial triage event, requires an explicit confirmation (a "yes" option or an interactive prompt), and never touches other patients.
- Q: Which patients does the reset treat as demo patients? → A: Only the six fixed identifiers PAT-001 to PAT-006 defined by the demo-patient command, never any other "PAT-" patient (US-01 patients also use the PAT-NNN pattern). Reset also sets a discharged demo patient back to active.
- Q: Are defaults 2–6 (15 s demo interval; 2 stable / 2 slow / 2 rapid; existing patients left unchanged on re-run; initial triage event and levels 3–5; "trend worse" judged by the scoring total) accepted? → A: Yes, as written.

## User Story *(mandatory)*

**Story ID**: TS-08

**Type**: Technical

**Story**: As a demo presenter, I want synthetic vital-sign readings generated for each active patient on a schedule, so that the app shows realistic monitoring and deterioration without real patient data.

**Depends on**: TS-03 (patients and vital_signs tables). Also reuses the accepted limits and validation of TS-07 (already merged).

### Acceptance Criteria

1. **AC1 — Demo patients**: **Given** a database with the TS-03 tables, **When** the presenter runs the demo-patient command, **Then** six synthetic active patients PAT-001 to PAT-006 exist (synthetic names, age, sex, initial triage level), each with one "initial" triage event, and the command lists what it created; **When** it is run again, **Then** no duplicate patient or triage event is created and the existing patients are reported as already present.
2. **AC2 — One reading per active patient per round**: **Given** active and discharged patients, **When** the simulator runs one round, **Then** exactly one reading with all 7 vital signs (respiratory rate, SpO2, on oxygen, systolic BP, heart rate, consciousness, temperature) is saved for every active patient and none for discharged patients.
3. **AC3 — Schedule**: **Given** no interval option, **When** the simulator runs, **Then** rounds are 5 minutes apart; **When** demo mode is chosen, **Then** rounds are 15 seconds apart; **When** an explicit interval is given, **Then** that interval is used.
4. **AC4 — Scenarios**: **Given** the demo patients, **When** the simulator runs several rounds, **Then** stable patients stay around normal values, slowly deteriorating patients get worse over about 10–12 rounds, and rapidly deteriorating patients get clearly worse within 3–4 rounds, each with small random noise and no sudden jumps between consecutive rounds.
5. **AC5 — Reproducible and continuous**: **Given** the same seed, patient and step (number of readings already saved for that patient), **When** values are generated twice, **Then** they are identical; **Given** a patient already has readings, **When** a new run starts, **Then** the patient continues from its next step instead of restarting the scenario.
6. **AC6 — Valid values only**: **Given** any scenario and any number of rounds, **When** a reading is generated, **Then** every value is inside TS-07's accepted limits with the right type (whole numbers, temperature with one decimal, an ACVPU code, oxygen yes/no) and passes TS-07's validation before it is saved.
7. **AC7 — Single record function**: **Given** a patient and a set of vital signs, **When** the "record a reading" function is called, **Then** it validates the values, saves one reading for that patient and returns it; invalid values are rejected and nothing is saved. The simulator saves readings only through this function.
8. **AC8 — Stops by itself**: **Given** the simulator is started, **When** the maximum run time (default 60 minutes) or the maximum number of rounds is reached, or the "one round" option is used, or the presenter presses Ctrl+C, **Then** it stops cleanly with a short final summary and no error trace.
9. **AC9 — Clear output and errors**: **Given** a round runs, **Then** one line per patient shows the identifier and a short summary of the values, without secrets; **Given** the database setting is missing or the database cannot be reached, **When** either command runs, **Then** it exits with a clear error that does not show the connection string.
10. **AC10 — Tests and docs**: **Given** the test suite, **When** it runs without a real database or network, **Then** it covers scenario generation, the record function, the stop conditions and the demo-patient command (including reset), and all existing tests still pass; the backend README explains both commands and their options.
11. **AC11 — Reset for rehearsals**: **Given** demo patients with readings, triage events and alerts, and other patients with their own data, **When** the presenter runs the demo-patient command with the reset option and confirms, **Then** the readings, triage events and alerts of PAT-001 to PAT-006 are deleted, each of them is active again at its initial triage level with one "initial" triage event, and no other patient's data changes (including other patients whose identifiers start with "PAT-"); **When** the presenter does not confirm, **Then** nothing is deleted.

### Out of Scope

- Scoring readings or storing scores (US-03).
- Escalating triage levels and creating alerts (US-04).
- Any API endpoint, UI, or change to the API's startup.
- A background, always-on or cloud-scheduled simulator.
- Real or public datasets (synthetic data only, D-09).
- Registering, editing or discharging patients from the app (US-01 and later).

### Edge Cases

- **No active patients**: the round prints a clear "no active patients" line, saves nothing, and the simulator keeps its schedule and stop conditions.
- **Active patient not in the demo set** (e.g. registered later by US-01): it follows the stable scenario.
- **Deterioration limit**: deteriorating scenarios level off at a severe but plausible state and never leave the accepted limits, however many rounds run.
- **Generated value fails validation** (a defect): the reading is not saved, the patient and the failing parameter names are reported, and the round continues with the other patients.
- **Database lost mid-run**: the simulator stops with a clear error (no connection string) and a non-zero exit code; readings saved before the error are kept.
- **Ctrl+C during a round or a wait**: no half-saved reading; readings already saved are kept; the final summary is shown.
- **Invalid options** (zero or negative interval, rounds or minutes): rejected with a clear message before connecting to the database.
- **Demo patients edited or discharged by later stories**: re-running the demo-patient command without reset does not overwrite or reactivate existing patients.
- **Scenario already finished**: a patient whose step is past the end of its scenario stays at the scenario's final (levelled-off) state with noise.
- **Reset without confirmation**: in a non-interactive run without the "yes" option, or when the presenter answers anything but yes, the command deletes nothing and exits with a clear message.
- **Reset when demo patients do not exist yet**: missing demo patients are simply created, as without reset.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a documented, hand-run command that creates the demo patients PAT-001 to PAT-006 with clearly synthetic names, an age, a sex, an initial triage level and active status, plus one "initial" triage event per created patient.
- **FR-002**: The demo-patient command MUST be re-runnable: patients that already exist (by identifier) are left unchanged and reported as "exists"; only missing ones are created.
- **FR-003**: Each demo patient MUST be assigned a fixed scenario: two stable, two slowly deteriorating and two rapidly deteriorating.
- **FR-004**: The system MUST provide a documented, hand-run simulator command that, each round, generates and records one reading with all 7 vital signs for every active patient and none for discharged patients.
- **FR-005**: The simulator MUST wait 5 minutes between rounds by default, 15 seconds in demo mode, or a presenter-chosen number of seconds.
- **FR-006**: Generated values MUST change gradually from step to step following the patient's scenario, with small random noise. A patient's step MUST be the number of readings already saved for that patient, so a new run continues where the last one stopped. Generated values MUST depend only on (seed, patient, step), so the same seed gives the same values.
- **FR-007**: Every generated reading MUST be within TS-07's accepted limits with the correct types and MUST pass TS-07's validation before it is saved.
- **FR-008**: The system MUST provide one "record a reading" function (patient + vital signs) that validates, saves and returns a reading; it is the only way the simulator saves readings, and later stories extend it to score and react.
- **FR-009**: The simulator MUST stop by itself after a maximum run time (default 60 minutes) or a maximum number of rounds, whichever comes first; it MUST offer a "one round and exit" option and stop cleanly on Ctrl+C.
- **FR-010**: The simulator MUST never start automatically with the API or any other process.
- **FR-011**: Each round MUST print one line per patient with its identifier, scenario and a short summary of the values, and the run MUST end with a summary (rounds run, readings saved, why it stopped). Output MUST NOT include secrets or the connection string.
- **FR-012**: When the database setting is missing or the database is unreachable, both commands MUST exit with a non-zero code and a clear message that does not include the connection string.
- **FR-013**: Patient names and identifiers MUST be synthetic; identifiers MUST follow the `PAT-NNN` pattern.
- **FR-014**: Automated tests MUST cover, without a real database or network: generation stays within limits for every scenario over many rounds; deteriorating scenarios trend worse (measured with the scoring module's total) while stable ones do not; same seed gives the same values; the record function saves valid readings and rejects invalid ones; each stop condition; and the demo-patient command including re-runs.
- **FR-015**: The backend README MUST explain both commands, their options and the cost-control rule; the PR MUST record a one-time manual check on Neon (seed patients, one round, readings listed).
- **FR-016**: No new dependency MAY be added.
- **FR-017**: The demo-patient command MUST offer a reset option that deletes the readings, triage events and alerts of the demo patients only — the six fixed identifiers PAT-001 to PAT-006, never selected by prefix — restores each demo patient's initial triage level and active status, and creates its "initial" triage event again. It MUST require an explicit confirmation (a "yes" option, or an interactive prompt answered yes) and MUST NOT change any other patient or their data. It reports what it reset.

### Key Entities

- **Demo patient**: one of six synthetic patients (identifier, synthetic name, age, sex, initial triage level, active status) used for demos; existing TS-03 patients table.
- **Scenario**: the trajectory a patient's vital signs follow — stable, slowly deteriorating or rapidly deteriorating — defined by a starting state, a worst state at which it levels off, and how many steps it takes to get there. Not stored in the database; assigned by patient identifier.
- **Step**: a patient's position in its scenario, equal to the number of readings already saved for that patient. Not stored separately.
- **Reading**: one set of the 7 vital signs for one patient at one time; existing TS-03 vital_signs table.
- **Initial triage event**: the first triage history entry for a demo patient (source "initial"); existing TS-03 triage_events table.
- **Simulator run**: one hand-started execution with an interval, a maximum time, a maximum number of rounds and an optional seed; it ends with a summary.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A presenter can go from an empty patient list to the first round of readings for six demo patients in under 2 minutes using only the README.
- **SC-002**: In demo mode, a rapidly deteriorating patient reaches a clearly abnormal state (high risk according to the scoring module) within 4 rounds, i.e. about 1 minute.
- **SC-003**: 100% of generated readings over 1,000 simulated rounds per scenario are within the accepted limits.
- **SC-004**: An unattended simulator stops on its own within its configured limit (60 minutes by default), so it never keeps the database awake longer than intended.
- **SC-005**: Running the demo-patient command any number of times, with or without reset, leaves exactly six demo patients and at least their six initial triage events; right after a reset, each demo patient has zero readings, zero alerts and exactly one triage event.
- **SC-006**: All new and existing automated tests pass with no real database or network access.

## Assumptions

- Simulator runs continue each patient's scenario from its saved readings (see Clarifications); a presenter who wants a fresh demo uses the demo-patient reset option.
- Without a seed option, the noise is not reproducible between runs; with a seed, it is.
- Demo mode uses a 15-second interval (inside the requested 10–30 seconds); a presenter can still choose any interval explicitly.
- "Trend worse" is judged by the current scoring module's total score rising over the rounds; the simulator itself does not score or store scores (US-03).
- Deteriorating scenarios use generic physiological changes (faster breathing, lower SpO2, lower blood pressure, faster heart rate, rising temperature, later reduced consciousness and supplemental oxygen) and do not depend on NEWS2 thresholds (constitution V).
- Demo patients start at less urgent triage levels (3 to 5) so later stories (US-04) can show an escalation.
- The reading time is the time it is saved; the simulator does not backdate readings.
- The database connection setting and session handling from TS-02/TS-06 are reused; tests use an in-memory test database as TS-06 did.
- The simulator is a local command run from the backend folder by a presenter; it is not deployed to Azure.
