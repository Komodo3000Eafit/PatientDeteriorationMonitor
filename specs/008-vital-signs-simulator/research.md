# Research: Vital Signs Simulator (TS-08)

There were no `NEEDS CLARIFICATION` items left after `/speckit-clarify`. Each entry below records one design choice, with the alternatives rejected.

## R1. Where readings are saved: `app/readings.py`

- **Decision**: one function, `record_reading(session, patient_id, vitals)`, in a new module `backend/app/readings.py`.
  - It calls `app.scoring.validate_vital_signs(vitals)` first, so invalid values raise `InvalidVitalSigns` before anything is added to the session.
  - It then adds one `VitalSign` row, calls `session.flush()` so the row gets its id, and returns it.
  - It does **not** commit. The caller commits, like `upsert_demo_users` in TS-06, so a caller can group writes in one transaction and roll back on error.
- **Rationale**: FR-008 needs a single insertion point that US-03 can extend (score and store the result) without touching the simulator. `vitals` is the TS-07 `VitalSigns` dataclass, so API code (US-03) builds it with `vital_signs_from_mapping` and the simulator builds it directly. Both use the same validation.
- **Alternatives rejected**: a service class or repository layer (not needed for one function, D-23); committing inside the function (the caller couldn't group or roll back writes); accepting a plain dict (the API and simulator would validate differently).

## R2. Scenario model: table-driven linear progress

- **Decision**: `SCENARIOS` in `simulator.py` maps each scenario name to:
  - a start value and a final value for each numeric parameter;
  - `steps`, the number of steps to go from start to final;
  - the progress points at which oxygen switches on and consciousness changes from "A" to "C" (or none).

  `progress = min(step / steps, 1)`, and `value = start + (final - start) * progress + noise`. The stable scenario has `start == final`. The values are in [data-model.md](data-model.md).
- **Rationale**: this gives gradual change and a built-in level-off (FR-006, edge case "scenario already finished") with about 25 lines of data and one formula. The trajectories describe generic physiology (breathing faster, SpO2 lower, and so on) with no NEWS2 thresholds (constitution V). The tests use the scoring module only to *check* the trend.
- **Alternatives rejected**: random walks (could drift outside plausible values and are hard to make reproducible per step); per-scenario functions or classes (more code for the same result); reading real waveforms or datasets (out of scope, D-09).

## R3. Reproducible noise from (seed, patient, step)

- **Decision**: for each reading, `rng = random.Random(f"{seed}:{identifier}:{step}")`. The noise is `rng.randint(-n, n)` per integer parameter and `rng.randint(-1, 1) / 10` for temperature, drawn in a fixed parameter order.
  - Without `--seed`, the run picks one seed with `random.SystemRandom().randrange(1_000_000)` and prints it in the run header, so a run can still be repeated.
- **Rationale**: `random.Random` seeded with a `str` is deterministic across processes and platforms (it hashes the string with SHA-512). Python's `hash()` changes per process, so it is not used. Because the noise depends only on (seed, identifier, step), the clarified "runs continue" rule (step = saved readings) and reproducibility fit together. The noise is independent per step, so it never accumulates or drifts.
- **Alternatives rejected**: one `Random(seed)` for the whole run (values would depend on how many patients and rounds came before); `hash()` (not stable); `numpy` (new dependency).

## R4. Step = number of saved readings

- **Decision**: at the start of each round, one query counts the readings per active patient (`GROUP BY patient_id`). That count is the patient's step for this round.
- **Rationale**: this is the clarified rule. No new column or state file is needed, and readings saved by any other route (US-03 later) also advance the step. A reset (R6) sets it back to 0.
- **Alternatives rejected**: storing the step or scenario in a new column (needs a migration, D-23); a local state file (gets out of sync with the database).

## R5. Rounding, clamping and validation

- **Decision**: integer parameters are rounded with `round()` to `int`. Temperature becomes `Decimal(str(round(x, 1))).quantize(Decimal("0.1"))`. Every numeric value is then clamped to `ACCEPTED_LIMITS[name].minimum` and `maximum`. `on_oxygen` is a `bool` and `consciousness` is `"A"` or `"C"`. The result is a `VitalSigns`, which `record_reading` validates (FR-007).
- **Rationale**: the scenario values are far inside the limits, so clamping is only a safety net. Reading the limits from `ACCEPTED_LIMITS` keeps one source of truth (D-36). Exact types are required because TS-07's validation rejects subclasses and floats for integer parameters.
- **Alternatives rejected**: skipping the clamp (a future table edit could create invalid values); validating inside the generator as well (`record_reading` already does it once).

## R6. Demo patients and reset

- **Decision**: `DEMO_PATIENTS` in `app/demo_patients.py` is a tuple of six rows `(identifier, name, age, sex, scenario, triage_level)`. `python -m app.demo_patients`:
  - **without `--reset`**: creates each missing identifier with an "initial" triage event, and reports existing ones as `exists` without changing them;
  - **with `--reset`**: needs `--yes`, or an interactive prompt answered `yes` (only when stdin is a terminal). It selects the patients whose identifier is **in** the six fixed identifiers (never a `LIKE 'PAT-%'`). In **one transaction** it then:
    1. deletes their `alerts`, `triage_events` and `vital_signs`;
    2. sets `triage_level` back to the initial value and `status` to `active`;
    3. adds a new "initial" triage event;
    4. creates any of the six that are missing.
  - It commits once, so a failure leaves nothing half-reset.
- **Rationale**: this follows FR-001, FR-002 and FR-017 and the clarification (exactly the six identifiers). The rows are deleted in child-first order because every foreign key in TS-03 is `ON DELETE RESTRICT`. Confirmation through `input()` with an injectable function keeps it testable.
- **Note for US-03**: if US-03 adds a scores table that references `vital_signs` or `patients`, US-03 must add it to the reset's delete list. This is recorded in the agent log and PROJECT_STATUS.
- **Alternatives rejected**: a separate reset command (two commands for one dataset); updating existing patients on every run (would undo escalations, spec edge case); `TRUNCATE` (would touch other patients).

## R7. Run loop, stop conditions and testability

- **Decision**: `run(options, session_factory, sleep=time.sleep, clock=time.monotonic, out=print)` returns `(rounds, readings, reason)`. Each round:
  1. opens a session with `session_factory()`;
  2. reads the active patients and their counts;
  3. records one reading per patient and commits after each one;
  4. closes the session.

  After a round, the loop stops when one of these is true:
  - `rounds == max_rounds` → `"round limit reached"`;
  - `clock() - start + interval >= max_seconds` → `"time limit reached"` (no round starts at or after the limit; with the defaults, 60 minutes at a 5-minute interval gives 12 rounds);

  Otherwise it calls `sleep(interval)`. `KeyboardInterrupt`, raised during a round or during sleep, is caught in `run()`: the open session is rolled back and closed, and the reason is `"stopped by Ctrl+C"`.
- **Rationale**: injected `sleep` and `clock` let the tests check every stop condition instantly (FR-014). Committing after each reading means Ctrl+C or a lost connection never leaves a half-saved reading, and readings already saved are kept. Closing the session between rounds means no connection is held while sleeping.
- **Alternatives rejected**: `sched`, threads, APScheduler or a FastAPI startup task (more machinery; FR-010 forbids starting with the API); signal handlers (`KeyboardInterrupt` is enough on Windows and Linux).

## R8. Options

- **Decision** (`argparse`):

  | Option | Meaning |
  |---|---|
  | `--interval-seconds N` | wait between rounds, default 300 |
  | `--demo` | 15 seconds between rounds |
  | `--once` | one round and exit |
  | `--rounds N` | stop after N rounds |
  | `--minutes M` | stop when the time limit is reached, default 60 |
  | `--seed S` | make the values reproducible |

  - `--demo` and `--interval-seconds` cannot be used together, and neither can `--once` and `--rounds`.
  - Every number must be a positive whole number. A bad value gives argparse's usage error (exit code 2) before any database access.
- **Rationale**: this is the option set from the user input, and the defaults come from the constitution (5 minutes) and the spec (60 minutes, 15 s).
- **Alternatives rejected**: environment variables for these options (harder to discover); a config file.

## R9. Errors and output

- **Decision**:
  - If `DATABASE_URL` is not set → `DATABASE_URL is not set` on stderr, exit 1. This happens before anything else, but after argument parsing.
  - Any `SQLAlchemyError` → `Could not reach the database (<ErrorType>)` on stderr, exit 1, after printing the summary of what was saved. The message never includes the URL, the error message or the parameters, the same pattern as TS-02, TS-03 and TS-06.
  - An `InvalidVitalSigns` from `record_reading` (a defect) → the session is rolled back, the line `PAT-00X not saved: invalid <parameter names>` is printed, and the round continues.
  - Output is one header line (interval, limits, seed), then per round a `Round N` line and one line per patient with the identifier, scenario, step and the 7 values, then a final summary line. Patient names are not printed.
  - Exit codes: 0 for normal and Ctrl+C stops.
- **Rationale**: this covers FR-011, FR-012 and the edge cases, and reuses known safe patterns.

## R10. Tests without a real database

- **Decision**:
  - In-memory SQLite with `Base.metadata.create_all(engine)` for all TS-03 tables. This was checked locally: `Identity`, check constraints and `Numeric(3, 1)` work, and the temperature round-trips as `36.8`.
  - Tests use `StaticPool`, or a single engine from a fixture, so every session shares the same in-memory database.
  - `get_engine` and `database_url` are monkeypatched in each module, as in `test_seed_demo_users.py`.
  - The conftest autouse fixture already removes `DATABASE_URL`, so no test can reach Neon.
- **Rationale**: this is the TS-06 approach (FR-014) and adds no dependency.
