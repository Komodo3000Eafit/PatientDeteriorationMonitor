# Implementation Plan: Vital Signs Simulator

**Branch**: `008-vital-signs-simulator` | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/008-vital-signs-simulator/spec.md`

## Summary

TS-08 adds three small standard-library modules to the backend. There is no new dependency, table, endpoint or UI.

- **`app/readings.py`**: `record_reading(session, patient_id, vitals)`. It validates with TS-07's `validate_vital_signs`, adds one `vital_signs` row, flushes and returns it. It is the single insertion point that US-03 extends with scoring (research R1).
- **`app/demo_patients.py`** (`python -m app.demo_patients [--reset] [--yes]`): the six fixed synthetic patients PAT-001 to PAT-006 in one constant, each with a scenario and an initial triage level of 3 to 5.
  - Without `--reset`, it creates the missing ones with an "initial" triage event and leaves existing ones unchanged.
  - `--reset` touches exactly those six identifiers in one transaction, and needs `--yes` or an interactive `yes` (R6).
- **`app/simulator.py`** (`python -m app.simulator`):
  - **Scenarios**: table-driven stable, slow and rapid scenarios, using linear progress capped at 1 plus small noise. The noise is seeded from `"{seed}:{identifier}:{step}"`, where step is the number of readings the patient already has. The values are rounded and clamped to `ACCEPTED_LIMITS` (R2 to R5).
  - **Hand-run loop**: one reading per active patient per round, saved through `record_reading`. It stops at `--rounds`/`--once`, `--minutes` (default 60) or on Ctrl+C. `sleep` and `clock` are injectable for tests (R7, R8).
  - **Errors**: the database errors are generic and never include the connection string (R9).

Tests use in-memory SQLite with the TS-03 tables, as TS-06 did (R10). `backend/README.md` gets a "Demo data and simulator" section.

## Technical Context

**Language/Version**: Python 3.13 (unchanged).

**Primary Dependencies**: none new. Standard library: `argparse`, `random`, `time`, `decimal`, `sys`. It reuses `app.db` (`database_url`, `get_engine`), `app.models` (`Patient`, `VitalSign`, `TriageEvent`, `Alert`) and `app.scoring` (`VitalSigns`, `validate_vital_signs`, `ACCEPTED_LIMITS`, `InvalidVitalSigns`). It also uses SQLAlchemy, which is already pinned.

**Storage**: the existing Neon PostgreSQL tables from TS-03. No migration.

**Testing**: pytest (existing). In-memory SQLite engine fixtures, with `get_engine` and `database_url` monkeypatched per module. The conftest autouse fixture already removes `DATABASE_URL`.

**Target Platform**: the presenter's local machine (Windows), run from `backend/` against Neon. It is not deployed to Azure.

**Project Type**: web application (backend + frontend). This story touches only the backend, as command-line modules.

**Performance Goals**: a round for six patients finishes in well under a second plus Neon latency. The full test suite stays fast, with no real waiting, because `sleep` is injected.

**Constraints**:

- Cost control: the simulator is started only by hand and always ends on its own (default 60 minutes).
- No NEWS2 knowledge in the simulator (constitution V; the TS-07 isolation test keeps passing).
- Only `record_reading` creates `VitalSign` rows (enforced by a test).
- Synthetic data only, and no secrets in the output.

**Scale/Scope**: 3 source modules (about 300 lines in total), 3 test files, and 1 README section. Plus the docs: `PROJECT_STATUS`, `BACKLOG` and `DECISIONS` (D-37).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Spec-driven and traceable**: every file maps to an FR or AC (traceability below). Test docstrings name the AC or FR they verify.
- [x] **II. Small Scrum story**: two commands and one function, with no endpoint and no UI.
- [x] **III. Independence**: depends on TS-03 (and the merged TS-07), as `docs/BACKLOG.md` lists. It adds new files only, plus one README section.
- [x] **IV. Multi-agent**: each task has an owner agent, logged in `agent-log.csv`:
  - **backend-dev**: `readings.py`, `demo_patients.py`, `simulator.py` and the README section;
  - **qa-tester**: the three test files and the full suite run;
  - **security-reviewer**: output and error messages, reset scope, confirmation, synthetic data and cost-control limits;
  - **orchestrator**: `PROJECT_STATUS.md`, `BACKLOG.md`, `DECISIONS.md` (D-37), the agent log and the Neon manual check record.
- [x] **V. Clinical logic**: the simulator contains no scoring rules or thresholds. The trends are checked in tests only through `get_scoring_system()`. There are no alerts in this story.
- [x] **VI. Data privacy**: six fictional patients ("Paciente Demo …", `PAT-NNN`) and generated values only. No real or public dataset is used, and no secrets are printed or stored.
- [ ] **VII. Tests**: generation, `record_reading`, the stop conditions and the demo-patient command, including reset, are covered (FR-014). **Exception**: CI doesn't exist until TS-09, so tests run locally and the output is pasted in the PR (Complexity Tracking, D-27).
- [x] **VIII. Security baseline**:
  - every reading is validated before it is saved;
  - reset is limited to six exact identifiers and needs confirmation;
  - `DATABASE_URL` comes only from the environment;
  - errors show only the error type.

  There is no endpoint, so no authentication is involved.
- [x] **IX. Deployable at low cost**: no new service. The simulator runs only by hand, ends by itself, and holds no connection while it sleeps (constitution cost control).
- [x] **X. Stack**: Python and PostgreSQL.
- [x] **XI. Language**: code and docs are in English. The synthetic patient names are Spanish-style, which matches the Spanish UI. The console output is English (developer tool, not UI).
- [x] **XII. Simplicity**:
  - standard library only;
  - module-level functions and two constant tables;
  - no scheduler library, threads, classes or new columns;
  - the step is derived from the existing readings.

**Post-design re-check (after Phase 1)**: all items still pass, and only the Principle VII exception (CI in TS-09) remains. Phase 1 added two items, both from the spec:

- a source-search test, so `record_reading` stays the only `VitalSign` writer (FR-008);
- a note that US-03 must extend the reset delete list if it adds a table that references readings (R6).

## Project Structure

### Documentation (this feature)

```text
specs/008-vital-signs-simulator/
├── spec.md
├── plan.md                 # This file
├── research.md             # Phase 0: record function, scenarios, seeded noise, step, reset, run loop, options, errors, tests
├── data-model.md           # Phase 1: tables used, DEMO_PATIENTS, SCENARIOS, generate_vitals
├── quickstart.md           # Phase 1: run the tests; one-time Neon check
├── contracts/
│   └── commands.md         # Phase 1: both commands (options, output, exit codes) and record_reading
├── checklists/
│   └── requirements.md
└── tasks.md                # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── README.md                   # CHANGED: "Demo data and simulator" section
├── app/
│   ├── readings.py             # NEW: record_reading()
│   ├── demo_patients.py        # NEW: DEMO_PATIENTS, ensure_demo_patients(), reset_demo_patients(), main()
│   └── simulator.py            # NEW: SCENARIOS, scenario_for(), generate_vitals(), run_round(), run(), parse_args(), main()
└── tests/
    ├── test_readings.py        # NEW: valid insert, invalid rejected with nothing written, single-writer source check
    ├── test_demo_patients.py   # NEW: create, re-run unchanged, reset only the six, confirmation, reset before creation, errors
    └── test_simulator.py       # NEW: generation (limits, types, seed, plateau, gradual, trend), rounds, step continuation, stop conditions, Ctrl+C, options, errors

docs/PROJECT_STATUS.md          # CHANGED: TS-08 done; US-03 note (extend record_reading and the reset delete list)
docs/BACKLOG.md                 # CHANGED: TS-08 spec link and status
docs/DECISIONS.md               # CHANGED: D-37
```

**Structure Decision**: this is the existing web-application layout. The commands are `app` modules run with `python -m`, like `app.seed_demo_users` (TS-06), so they reuse `app.db` and `app.models` with no packaging changes.

### Design notes

- **`readings.py`**: `record_reading(session, patient_id: int, vitals: VitalSigns) -> VitalSign`.
  - It calls `validate_vital_signs(vitals)`, then builds `VitalSign(patient_id=…, **{name: getattr(vitals, name) for name in PARAMETERS})`, then `session.add`, `session.flush()`, and returns the row.
  - There is no commit.
- **`demo_patients.py`**:
  - `DEMO_PATIENTS`: a tuple of `(identifier, name, age, sex, scenario, triage_level)` rows (data-model). `DEMO_IDENTIFIERS = tuple(row[0] for row in DEMO_PATIENTS)`.
  - `ensure_demo_patients(session) -> list[tuple[str, str]]`: creates the missing patients plus their initial event, and returns `("created", id)` or `("exists", id)`.
  - `reset_demo_patients(session) -> list[...]`:
    1. selects the patients with `identifier.in_(DEMO_IDENTIFIERS)`;
    2. deletes their `Alert`, `TriageEvent` and `VitalSign` rows by `patient_id.in_(ids)`;
    3. restores `triage_level` and `status="active"`, then adds the initial event;
    4. creates the missing ones.

    It returns `("reset" | "created", id)`.
  - Neither function commits.
  - `main(argv=None, input_fn=input, is_interactive=sys.stdin.isatty) -> int`: parses the arguments, handles the confirmation (before any database access), checks `database_url()`, then runs one `Session(get_engine())` and commits once. `SQLAlchemyError` is caught and reported by error type.
- **`simulator.py`**:
  - `SCENARIOS` is a dict of `{"steps", "params": {name: (start, final, noise)}, "oxygen_at", "c_at"}` (data-model). `scenario_for(identifier)` uses `DEMO_PATIENTS`, otherwise `"stable"`.
  - `generate_vitals(scenario, seed, identifier, step) -> VitalSigns` is pure (R3, R5).
  - `run_round(session, seed, out) -> int`:
    1. queries the active patients ordered by identifier, plus the reading counts (`GROUP BY`);
    2. for each patient, generates the values, calls `record_reading` and commits;
    3. on `InvalidVitalSigns`, rolls back, prints the parameter names and continues;
    4. prints one line per patient.

    It returns the number of readings saved.
  - `run(options, session_factory, sleep, clock, out) -> (rounds, readings, reason)` implements the loop and the stop rules (R7). `KeyboardInterrupt` is caught there.
  - `parse_args(argv)` uses argparse with mutually exclusive groups (`--demo` and `--interval-seconds`, `--once` and `--rounds`) and a `positive_int` type.
  - `main(argv=None) -> int`:
    1. parses the arguments and checks `database_url()`;
    2. picks a seed if none was given and prints the header;
    3. runs `run(...)` with `lambda: Session(get_engine())`;
    4. prints the summary.

    A `SQLAlchemyError` gives the generic message and exit code 1 (R9).
  - No code in `app/simulator.py` mentions NEWS2 or imports `app.scoring.news2`.
- **README section "Demo data and simulator"**:
  - both commands with their options tables (from the contract);
  - the scenario list;
  - "runs continue; use `--reset --yes` for a fresh rehearsal";
  - the cost-control rule (start by hand, keep it short, default 60 minutes);
  - `--demo` for presentations.

### Traceability

| Requirement / AC | Delivered by |
|---|---|
| FR-001, FR-002, FR-013, AC1 (demo patients, re-runnable, synthetic) | `demo_patients.ensure_demo_patients`, `DEMO_PATIENTS`; `test_demo_patients.py` |
| FR-017, AC11 (reset of the six only, confirmation) | `demo_patients.reset_demo_patients`, `main` confirmation; `test_demo_patients.py` |
| FR-003, FR-006, AC4, AC5 (scenarios, gradual, reproducible, continuous) | `SCENARIOS`, `generate_vitals`, step counts in `run_round`; `test_simulator.py` |
| FR-004, AC2 (one reading per active patient per round) | `simulator.run_round`; `test_simulator.py` |
| FR-005, AC3 (interval 300 s, 15 s demo, explicit) | `parse_args`; `test_simulator.py` option tests and the sleep values recorded |
| FR-007, AC6 (valid values and types) | rounding and clamping in `generate_vitals`, validation in `record_reading`; `test_simulator.py`, `test_readings.py` |
| FR-008, AC7 (single record function) | `readings.record_reading`; `test_readings.py` (including the single-writer source check) |
| FR-009, FR-010, AC8 (stop conditions, never automatic) | `simulator.run`; `test_simulator.py` stop tests; no change to `app/main.py` |
| FR-011, FR-012, AC9 (output, errors without secrets) | `run_round` lines, summary, `main` error handling in both commands; tests on output and messages |
| FR-014, AC10 (tests) | three new test files; full `python -m pytest` |
| FR-015 (docs, Neon check) | `backend/README.md`, [quickstart.md](quickstart.md) §2, PR description |
| FR-016 (no new dependency) | `requirements.txt` unchanged |

### Test plan (summary, qa-tester)

- **`test_readings.py`**:
  - a valid `VitalSigns` creates one row with the same 7 values and returns it with an id, and nothing is committed by the function;
  - an invalid set (for example SpO2 101 and consciousness "X") raises `InvalidVitalSigns` with both problems and adds no row;
  - a source search finds `VitalSign(` constructed only in `app/readings.py` within `backend/app/`.
- **`test_demo_patients.py`**:
  - **First run**: 6 patients, the `DEMO_PATIENTS` values, `active`, and 1 initial event each (correct columns). The output lines are `created: …`.
  - **Second run**: still 6 patients and 6 events, with `exists:` lines. An existing patient changed by hand (level 1, discharged) stays unchanged without reset.
  - **Reset with `--yes`**:
    - demo readings, alerts and extra triage events are removed;
    - each demo patient is active at its initial level with exactly 1 event;
    - another patient `PAT-100`, with its own reading, event and alert, is unchanged.
  - **Reset when no demo patients exist** creates them.
  - **Reset not confirmed**: the answer `no`, end of input, and non-interactive without `--yes` all give exit code 1, `Reset cancelled`, and no change. The database is not touched; `get_engine` raises if it is called.
  - **Errors**: no `DATABASE_URL` gives exit code 1. A failing engine gives `Could not update the demo patients (`, no URL or driver text, and nothing committed.
- **`test_simulator.py`**:
  - **Limits and types**: every scenario at steps 0 to 50 with several seeds is within `ACCEPTED_LIMITS`, with exact types and temperature at one decimal, and passes `validate_vital_signs`.
  - **Reproducibility**: the same seed, identifier and step give equal results; a different seed gives a different result for at least one step.
  - **Plateau**: steps past `steps` keep values within the final value ± noise.
  - **Gradual**: consecutive-step differences are within the data-model bound.
  - **Trend**, using `get_scoring_system()`:
    - stable is in the lowest band at every step;
    - slow and rapid have a final total greater than the step-0 total and are in the highest band at their final step;
    - rapid is in the highest band at step 3.
  - Every `DEMO_PATIENTS` scenario is in `SCENARIOS`, and an unknown identifier maps to stable.
  - **Rounds** (SQLite):
    - one round saves one reading per active patient and none for discharged ones;
    - the second round uses step 1 (it continues from the count), and a patient with 3 existing readings gets step 3;
    - with no active patients, the round prints `no active patients` and saves 0.
  - **Stop conditions** (fake sleep and clock):
    - `--once` gives 1 round and no sleep;
    - `--rounds 3` gives 3 rounds and 2 sleeps of the interval;
    - the default time limit with the default interval gives 12 rounds;
    - `--minutes 1 --demo` gives 4 rounds;
    - `KeyboardInterrupt` raised from sleep, and from inside a round, ends with `stopped by Ctrl+C`, keeps the committed readings and leaves no partial reading.
  - **Options**:
    - default interval 300, `--demo` gives 15, an explicit value is used;
    - conflicting options and zero or negative numbers exit with code 2 before database access.
  - **Errors**:
    - no `DATABASE_URL` gives exit code 1 and the message;
    - a failing engine gives exit code 1, `Could not reach the database (`, and no URL or driver text;
    - an invalid generated reading (with `generate_vitals` patched) is reported by parameter name, not saved, and the round continues.
  - **Output**: the round lines include the identifier, scenario and step, never the patient name; the summary line format matches the contract.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle VII: tests not yet run in CI | CI is built in TS-09 (D-27) | Building CI here would merge two stories; the local test output is pasted in the PR until then |
