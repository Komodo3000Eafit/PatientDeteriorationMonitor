---

description: "Task list for TS-08 vital signs simulator"
---

# Tasks: Vital Signs Simulator

**Input**: Design documents from `specs/008-vital-signs-simulator/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/commands.md](contracts/commands.md), [quickstart.md](quickstart.md)

**Tests**: MANDATORY. The spec lists them (AC10, FR-014), and the reset deletes data (a security control). The README (FR-015) and the Neon check are verified by review and recorded in the PR.

**Organization**: This feature has one story (TS-08), so all story tasks carry the `[TS-08]` label.

## Format: `[ID] [P?] [Story] Description (agent)`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **(agent)**: Owner agent, at the end of the line
- All paths are relative to the repository root. Backend commands run from `backend/` with `.\.venv\Scripts\Activate.ps1`.
- Edit files with Edit/Write, not PowerShell (CLAUDE.md). Keep the files UTF-8.
- **Standard library only.** Do not touch `backend/requirements.txt`, `backend/app/models.py`, `backend/migrations/`, `backend/app/main.py`, `backend/app/db.py` or `backend/app/scoring/`. No endpoint and no UI. The simulator never starts with the API (FR-010).
- No code in `backend/app/` outside `app/scoring/` may contain the text `news2` (the TS-07 isolation test). The simulator imports only from `app.scoring`.
- Only `backend/app/readings.py` may construct `VitalSign(` rows in `backend/app/` (FR-008).
- Never print or log the connection string, driver error messages or patient names in the simulator output.

---

## Phase 1: Setup

- [ ] T001 [TS-08] Confirm `python -m pytest` passes in `backend/` before any change (256 tests today), so later failures are clearly new. There are no new folders or dependencies (backend-dev)

---

## Phase 2: Foundational

None. TS-03 (tables) and TS-07 (`app.scoring`) are merged, and there is no migration.

---

## Phase 3: TS-08 Vital signs simulator 🎯 MVP

**Goal**: `python -m app.demo_patients` creates PAT-001 to PAT-006, with `--reset --yes` for a clean rehearsal. `python -m app.simulator` saves one valid, scenario-driven reading per active patient per round, through `record_reading`, and stops by itself.

**Independent Test**: `python -m pytest` in `backend/` passes with no database and no network, including `test_readings.py`, `test_demo_patients.py` and `test_simulator.py`. The quickstart §2 Neon check passes once.

### Implementation

- [ ] T002 [P] [TS-08] Create `backend/app/readings.py`. Module docstring: "Saving vital-sign readings (TS-08). record_reading is the only place that creates vital_signs rows; US-03 extends it to score the reading. See specs/008-vital-signs-simulator/contracts/commands.md §3."
  - Define `record_reading(session, patient_id: int, vitals: VitalSigns) -> VitalSign`:
    1. call `validate_vital_signs(vitals)` from `app.scoring`, so `InvalidVitalSigns` propagates **before** anything is added;
    2. build `VitalSign(patient_id=patient_id, **{name: getattr(vitals, name) for name in PARAMETERS})`;
    3. `session.add(row)`, then `session.flush()`, then `return row`.
  - **No commit.** The docstring says the caller commits or rolls back.

  (FR-007, FR-008, AC7; research R1) (backend-dev)
- [ ] T003 [P] [TS-08] Create `backend/app/demo_patients.py`. Module docstring: "Create or reset the synthetic demo patients PAT-001 to PAT-006 (TS-08). Run from backend/: python -m app.demo_patients [--reset] [--yes]. Never prints the connection string. See specs/008-vital-signs-simulator/contracts/commands.md §1."
  - **Constant** `DEMO_PATIENTS`, a tuple of `(identifier, name, age, sex, scenario, triage_level)`, exactly as in data-model:
    - `("PAT-001", "Paciente Demo Uno", 34, "female", "stable", 4)`
    - `("PAT-002", "Paciente Demo Dos", 58, "male", "stable", 5)`
    - `("PAT-003", "Paciente Demo Tres", 67, "female", "slow", 3)`
    - `("PAT-004", "Paciente Demo Cuatro", 45, "male", "slow", 4)`
    - `("PAT-005", "Paciente Demo Cinco", 72, "male", "rapid", 3)`
    - `("PAT-006", "Paciente Demo Seis", 51, "female", "rapid", 4)`

    Also define `DEMO_IDENTIFIERS = tuple(row[0] for row in DEMO_PATIENTS)` and `INITIAL_REASON = "Initial triage level (demo data)"`.
  - **`_initial_event(patient_id, level)`** returns `TriageEvent(patient_id=…, previous_level=None, new_level=level, score=None, reason=INITIAL_REASON, source="initial", created_by_id=None)`.
  - **`_create(session, row)`** adds the `Patient` (`status="active"`), flushes to get the id, then adds the initial event.
  - **`ensure_demo_patients(session) -> list[tuple[str, str]]`**: for each row in order, if a `Patient` with that identifier exists → `("exists", identifier)`, and nothing is changed. Otherwise it calls `_create` → `("created", identifier)`. No commit.
  - **`reset_demo_patients(session) -> list[tuple[str, str]]`**:
    1. select the patients `where Patient.identifier.in_(DEMO_IDENTIFIERS)` (**never** `like`/prefix);
    2. with `ids` = their ids, run `delete(Alert)`, `delete(TriageEvent)` and `delete(VitalSign)`, each `.where(<model>.patient_id.in_(ids))`, in that order (all foreign keys are RESTRICT);
    3. for each row in order: if the patient exists, set `triage_level` to the row's level and `status="active"`, add the initial event → `("reset", identifier)`; otherwise `_create` → `("created", identifier)`.

    No commit.
  - **`parse_args(argv)`**: argparse with `--reset` and `--yes` (`store_true`), and a description that names the command.
  - **`main(argv=None, input_fn=input, is_interactive=sys.stdin.isatty) -> int`**:
    1. Parse the arguments.
    2. If `--reset` without `--yes`: when `is_interactive()`, ask `input_fn('Type "yes" to delete the readings, triage events and alerts of PAT-001 to PAT-006: ')`. `EOFError` counts as no. If the answer is not exactly `yes` after `strip()`, or the input is not interactive, print `Reset cancelled: nothing was changed` to stderr and return 1, **before any database access**.
    3. If `database_url() is None`, print `DATABASE_URL is not set` to stderr and return 1.
    4. `with Session(get_engine()) as session:` run reset or ensure, then `session.commit()` once.
    5. On `SQLAlchemyError`, print `Could not update the demo patients (<type(exc).__name__>)` to stderr and return 1.
    6. Print one line per result to stdout: `created: PAT-001 (stable, triage 4)`, `exists: PAT-002`, `reset: PAT-003 (slow, triage 3)`. Return 0.
  - End with `if __name__ == "__main__": raise SystemExit(main())`.

  (FR-001, FR-002, FR-013, FR-017, AC1, AC11; research R6) (backend-dev)
- [ ] T004 [TS-08] Create `backend/app/simulator.py` (depends on T002, T003). Module docstring: "Synthetic vital-signs simulator (TS-08). Run by hand from backend/: python -m app.simulator [--demo|--interval-seconds N] [--once|--rounds N] [--minutes M] [--seed S]. Never started by the API; always stops by itself (constitution cost control). Contains no scoring rules. See specs/008-vital-signs-simulator/contracts/commands.md §2."
  - **`SCENARIOS`** dict, values exactly as in data-model. Each entry is `{"steps": int, "params": {name: (start, final, noise)}, "oxygen_at": float | None, "c_at": float | None}`, with the numeric params in this order: `respiratory_rate`, `spo2`, `systolic_bp`, `heart_rate`, `temperature`.
    - **stable**: steps 1; RR (16, 16, 1), SpO2 (97, 97, 1), SBP (125, 125, 3), HR (76, 76, 3), T (36.8, 36.8, 0.1); oxygen_at None; c_at None.
    - **slow**: steps 12; RR (16, 24, 1), SpO2 (97, 92, 1), SBP (125, 102, 3), HR (78, 112, 3), T (36.9, 38.4, 0.1); oxygen_at 0.75; c_at None.
    - **rapid**: steps 4; RR (17, 30, 1), SpO2 (96, 88, 1), SBP (122, 88, 3), HR (80, 135, 3), T (37.0, 39.4, 0.1); oxygen_at 0.6; c_at 0.9.

    Also define `DEFAULT_INTERVAL = 300`, `DEMO_INTERVAL = 15` and `DEFAULT_MINUTES = 60`.
  - **`scenario_for(identifier) -> str`** returns the `DEMO_PATIENTS` scenario for that identifier, else `"stable"`.
  - **`generate_vitals(scenario, seed, identifier, step) -> VitalSigns`** is pure:
    1. `rng = random.Random(f"{seed}:{identifier}:{step}")` (never `hash()`), and `progress = min(step / steps, 1)`.
    2. For each numeric param, in the order above: `x = start + (final - start) * progress`. For integers: `value = round(x) + rng.randint(-noise, noise)`. For temperature: `value = Decimal(str(round(x, 1))) + Decimal(rng.randint(-1, 1)) / 10`, then `.quantize(Decimal("0.1"))`.
    3. Clamp every numeric value to `ACCEPTED_LIMITS[name].minimum`/`maximum`, and convert integers to plain `int`.
    4. `on_oxygen = oxygen_at is not None and progress >= oxygen_at`, and `consciousness = "C" if c_at is not None and progress >= c_at else "A"`.
    5. Return `VitalSigns(...)`.
  - **`_summary(v) -> str`** returns `"RR {rr}, SpO2 {spo2}, O2 {yes|no}, SBP {sbp}, HR {hr}, ACVPU {c}, T {t}"`.
  - **`run_round(session, seed, out) -> int`**:
    1. Query the active patients: `select(Patient.id, Patient.identifier).where(Patient.status == "active").order_by(Patient.identifier)`.
    2. Get the counts with one query: `select(VitalSign.patient_id, func.count()).group_by(VitalSign.patient_id)`, made into a dict.
    3. If there are no active patients, `out("  no active patients")` and return 0.
    4. For each patient:
       - `step = counts.get(id, 0)`, `scenario = scenario_for(identifier)`, `vitals = generate_vitals(scenario, seed, identifier, step)`;
       - `try: record_reading(session, id, vitals); session.commit()`;
       - `except InvalidVitalSigns as exc: session.rollback(); out(f"  {identifier} not saved: invalid {', '.join(p.parameter for p in exc.problems)}"); continue`;
       - `out(f"  {identifier} {scenario} step {step}: {_summary(vitals)}")`.

       Never print the patient's name.
    5. Return the number saved.
  - **`run(interval, max_rounds, max_seconds, seed, session_factory, sleep=time.sleep, clock=time.monotonic, out=print, stats=None) -> tuple[int, int, str]`**:
    1. `start = clock()`, then loop:
       - increment `rounds` and `out(f"Round {rounds}")`;
       - `with session_factory() as session: saved += run_round(session, seed, out)`;
       - if `max_rounds is not None and rounds >= max_rounds` → reason `"round limit reached"`, break;
       - if `clock() - start + interval >= max_seconds` → reason `"time limit reached"`, break;
       - `sleep(interval)`.
    2. Wrap the loop in `try/except KeyboardInterrupt` → reason `"stopped by Ctrl+C"`. The `with` block closes the session, and the uncommitted reading is discarded.
    3. Return `(rounds, saved, reason)`.
  - **`positive_int(text)`** is an argparse type that raises `argparse.ArgumentTypeError("must be a positive whole number")` for a non-integer or a value ≤ 0.
  - **`parse_args(argv)`**:
    - group A (mutually exclusive): `--interval-seconds` (`positive_int`) or `--demo`;
    - group B (mutually exclusive): `--once` or `--rounds` (`positive_int`);
    - `--minutes` (`positive_int`, default 60) and `--seed` (`int`).

    The interval is 15 if `--demo`, else the given value, else 300. `max_rounds` is 1 if `--once`, else `--rounds` (or None).
  - **`main(argv=None) -> int`**:
    1. Parse the arguments.
    2. If `database_url() is None`, print `DATABASE_URL is not set` to stderr and return 1.
    3. `seed = args.seed if args.seed is not None else random.SystemRandom().randrange(1_000_000)`.
    4. Print the header `Simulator: interval {i} s, limit {m} min, rounds {n or "no limit"}, seed {seed} (use --seed {seed} to repeat)`.
    5. `try: rounds, saved, reason = run(..., session_factory=lambda: Session(get_engine()))`.
    6. `except SQLAlchemyError as exc`: print `Stopped: database error. Rounds: {stats["rounds"]}, readings saved: {stats["saved"]}.` to stdout, then `Could not reach the database (<type name>)` to stderr, and return 1. For this, `run` takes an optional `stats: dict | None = None` argument (`{"rounds": 0, "saved": 0}`, created by `main`) and updates it after each round and each saved reading. `run`'s return value is unchanged.
    7. Otherwise print `Stopped: {reason}. Rounds: {rounds}, readings saved: {saved}.` and return 0.
  - End with `if __name__ == "__main__": raise SystemExit(main())`.
  - The file must not contain the text `news2`.

  (FR-003 to FR-012, AC2 to AC9; research R2 to R5, R7 to R9; data-model) (backend-dev)
- [ ] T005 [P] [TS-08] Add a "Demo data and simulator" section to `backend/README.md`, before "## Run". Contents:
  - the two commands, with the options tables from [contracts/commands.md](contracts/commands.md);
  - the six demo patients and their scenarios (stable, slow over about 12 readings, rapid over about 4);
  - that runs continue from each patient's saved readings, and that `python -m app.demo_patients --reset --yes` starts a rehearsal from scratch (it touches only PAT-001 to PAT-006);
  - `--demo` (15 s) for presentations;
  - the cost-control rule: start it by hand, keep runs short, default limit 60 minutes, never left running;
  - a pointer to the quickstart Neon check.

  (FR-015) (backend-dev)

### Tests

All three test files use an in-memory SQLite engine fixture: `create_engine("sqlite://")` plus `Base.metadata.create_all(engine)`, disposed after the test. They monkeypatch `<module>.database_url` and `<module>.get_engine`, as in `backend/tests/test_seed_demo_users.py`. Use synthetic data only.

- [ ] T006 [P] [TS-08] Create `backend/tests/test_readings.py` (depends on T002). The module docstring cites FR-007, FR-008 and AC7. Tests:
  1. **`test_record_valid_reading`**: one patient, and a valid `VitalSigns(16, 97, False, 120, 72, "A", Decimal("36.8"))`. `record_reading` returns a row with an id and the 7 values equal to the input. After `session.rollback()` the row is gone, which proves the function does not commit.
  2. **`test_record_invalid_reading_saves_nothing`**: SpO2 101 and consciousness "X" raise `InvalidVitalSigns` with problems `spo2 out_of_range` and `consciousness not_allowed`. `session.new` is empty, and after a commit the count of `VitalSign` rows is 0.
  3. **`test_single_writer`** (FR-008): walk `backend/app/**/*.py` and assert that `"VitalSign("` appears only in `app/readings.py`.

  (qa-tester)
- [ ] T007 [P] [TS-08] Create `backend/tests/test_demo_patients.py` (depends on T003). The module docstring cites FR-001, FR-002, FR-013, FR-017, AC1, AC11 and SC-005. Tests:
  1. **`test_first_run_creates_six`**: `main([])` returns 0, and stdout has 6 `created:` lines in order. In the database:
     - 6 patients with exactly the `DEMO_PATIENTS` values, `status == "active"`, and identifiers matching `^PAT-\d{3}$`;
     - 6 triage events with `source "initial"`, `previous_level None`, `new_level` equal to the initial level, `score None`, reason `INITIAL_REASON` and `created_by_id None`.
  2. **`test_rerun_leaves_existing_unchanged`**: after the first run, set PAT-003 to `triage_level=1` and `status="discharged"` and add a reading. `main([])` prints 6 `exists:` lines, and PAT-003 is unchanged: still 6 patients, 6 events and 1 reading.
  3. **`test_reset_only_the_six`**:
     - Create the six, plus another patient `PAT-100` (and one `XYZ-1`), each with a reading, a non-initial triage event and an alert. Also give PAT-005 extra readings, an alert, an `automatic` event, and set it to level 1 and `discharged`.
     - Run `main(["--reset", "--yes"])` → 0, with 6 `reset:` lines.
     - Each demo patient has 0 readings, 0 alerts, exactly 1 initial event, its initial level and `active`.
     - `PAT-100` and `XYZ-1` still have their reading, event and alert, unchanged.
  4. **`test_reset_creates_missing`**: on an empty database, `--reset --yes` creates the six, with `created:` lines.
  5. **`test_reset_not_confirmed`**, parametrized over:
     - `input_fn` returning `"no"`;
     - `input_fn` raising `EOFError`;
     - `is_interactive=lambda: False` without `--yes`.

     Each returns 1 with `Reset cancelled: nothing was changed` on stderr. `get_engine` is patched to raise `AssertionError` if it is called, so the database is not touched. Also check that `input_fn` returning `"yes"` proceeds.
  6. **`test_errors`**: with no `DATABASE_URL` (conftest), the command returns 1 with `DATABASE_URL is not set`. With a failing engine (`creator` raising `sqlite3.OperationalError("synthetic failure at no/such/dir")`), it returns 1 with `Could not update the demo patients (`, and neither `no/such/dir` nor `sqlite://` appears in the output.
  7. **`test_scenarios_known`**: every `DEMO_PATIENTS` scenario is a key of `app.simulator.SCENARIOS`, and the initial levels are within 3–5.

  (qa-tester)
- [ ] T008 [P] [TS-08] Create `backend/tests/test_simulator.py` (depends on T004). The module docstring cites FR-003 to FR-012, AC2 to AC9, SC-002 and SC-003. Define `fake_sleep`, which records the intervals, and a fake clock that advances by each slept interval. Tests:
  1. **`test_values_within_limits_and_types`** (AC6, SC-003): for every scenario, seeds 1 to 5 and steps 0 to 50, `generate_vitals` returns:
     - exact types (`type(x) is int` for the 4 integers, `bool`, `"A"`/`"C"`, a `Decimal` with exponent −1);
     - values within `ACCEPTED_LIMITS`;
     - and `validate_vital_signs` does not raise.
  2. **`test_reproducible`** (AC5): the same `(scenario, seed, identifier, step)` gives equal results across two calls. Seeds 1 and 2 differ for at least one of steps 0 to 10.
  3. **`test_plateau_after_end`**: for slow and rapid, steps `steps` to `steps + 30` keep every numeric value within `final ± noise`, with oxygen on and the "C" setting as at progress 1.
  4. **`test_gradual`** (AC4): for each scenario and seed, the difference between consecutive steps is at most `|final - start| / steps + 2 * noise + 1` (temperature: `+ Decimal("0.1")`).
  5. **`test_trend_with_scoring`** (AC4, SC-002): uses `get_scoring_system().score(...)` with seeds 1 to 5.
     - stable: `band == "low"` at every step 0 to 20;
     - slow and rapid: total at step `steps` > total at step 0, and `band == "high"` at step `steps`;
     - rapid: `band == "high"` at step 3.
  6. **`test_scenario_for`**: PAT-005 → `"rapid"`, PAT-001 → `"stable"`, an unknown `"PAT-100"` → `"stable"`.
  7. **`test_round_active_only`** (AC2): the six demo patients via `ensure_demo_patients`, plus one discharged patient. `run_round` saves 6 readings, the discharged patient has 0, and each line contains the identifier, scenario and `step 0`, but not the name.
  8. **`test_step_continues`** (AC5): after one round, a second round prints `step 1`. A patient given 3 readings beforehand prints `step 3`, and its saved values equal `generate_vitals(scenario, seed, id, 3)`.
  9. **`test_no_active_patients`**: prints `  no active patients` and returns 0.
  10. **`test_invalid_generated_reading_skipped`**: patch `simulator.generate_vitals` to return SpO2 101 for one identifier. That patient prints `not saved: invalid spo2` and has no row; the others are saved.
  11. **`test_stop_conditions`** (AC8), using `run(...)` with an SQLite session factory, fake sleep and fake clock:
      - `max_rounds=1` → 1 round, no sleep, `"round limit reached"`;
      - `max_rounds=3` → 3 rounds, sleeps `[interval, interval]`;
      - interval 300 with 3600 s and no rounds limit → 12 rounds, `"time limit reached"`;
      - interval 15 with 60 s → 4 rounds.
  12. **`test_ctrl_c`** (AC8):
      - sleep raising `KeyboardInterrupt` after round 2 → `(2, 2 * n, "stopped by Ctrl+C")`, with the committed readings kept;
      - `record_reading` patched to raise `KeyboardInterrupt` on the 3rd patient → the first two readings are kept, there is no third row, and the reason is Ctrl+C.
  13. **`test_options`** (AC3):
      - `parse_args([])` → interval 300, minutes 60, rounds None;
      - `--demo` → 15; `--interval-seconds 20` → 20; `--once` → rounds 1;
      - `--demo --interval-seconds 20`, `--once --rounds 2`, `--rounds 0`, `--minutes -1` and `--interval-seconds abc` each raise `SystemExit(2)`.
  14. **`test_main_errors`** (AC9):
      - no `DATABASE_URL` → 1, `DATABASE_URL is not set`, and `get_engine` is never called;
      - a failing engine → 1 with `Could not reach the database (` on stderr, and no `no/such/dir` or `sqlite://` in the output.
  15. **`test_main_once_output`**: `main(["--once", "--seed", "7"])` on SQLite with the demo patients:
      - returns 0;
      - the header contains `seed 7`;
      - there are 6 patient lines;
      - the last line is `Stopped: round limit reached. Rounds: 1, readings saved: 6.`

  (qa-tester)

### Checks and review

- [ ] T009 [TS-08] Run `python -m pytest` in `backend/` (depends on T002–T008). Everything passes: the 256 existing tests plus the new ones (SC-006). Keep the output for the PR (D-27). Also confirm:
  - `git diff --stat main -- backend/requirements.txt backend/app/models.py backend/migrations backend/app/main.py backend/app/db.py backend/app/scoring` is empty;
  - `git grep -n -i news2 -- backend/app ':!backend/app/scoring'` prints nothing;
  - `git grep -n "VitalSign(" -- backend/app` shows only `backend/app/readings.py`.

  If a check fails, fix it in the owning task (qa-tester)
- [ ] T010 [TS-08] Review read-only: `backend/app/readings.py`, `demo_patients.py`, `simulator.py`, the three new test files and the README section. Check:
  - the reset is limited to the six exact identifiers (no prefix match), runs in one transaction, and the confirmation comes before any database access;
  - output and errors never show the connection string, driver messages or patient names;
  - every reading is validated before it is saved;
  - only synthetic data is used;
  - the stop limits can't be disabled (no "run forever" path), and there is no auto-start from `app/main.py`;
  - the seeds use `random.Random(str)`, not `hash()`;
  - `random` is used only for synthetic values, not for security.

  Report findings; don't change code (constitution VI, VIII, cost control) (security-reviewer)

**Checkpoint**: TS-08 is complete. US-03 extends `record_reading` (scoring) and, if it adds a table that refers to readings, the reset delete list.

---

## Phase 4: Polish

- [ ] T011 Run the one-time Neon check from [quickstart.md](quickstart.md) §2, steps 1–7, against the Neon `main` branch. Keep the session short. Record the commands, the summarized output (with no connection string) and the row counts for the PR description (FR-015) (orchestrator)
- [ ] T012 Edit the project docs, after T009–T011:
  - **`docs/PROJECT_STATUS.md`**:
    - Set "Last updated" to the current date. In step 11's notes, mark TS-08 ✅ and set "Next: TS-09 (CI pipeline)"; update "Current step" and "Next step" to match.
    - Rewrite the "Where we left off" note: TS-08 done (`app/readings.py` `record_reading`, `python -m app.demo_patients [--reset --yes]`, `python -m app.simulator`, with the options and defaults), with the local `pytest` result, the review result and the Neon check result.
    - Under "Notes for later stories", add:
      - **US-03** extends `record_reading` to score the reading and store the result. If it adds a table that refers to `vital_signs` or `patients`, it adds that table to `reset_demo_patients`' delete list.
      - **US-01** identifiers must not reuse PAT-001 to PAT-006 (the demo identifiers).
  - **`docs/BACKLOG.md`**: link `specs/008-vital-signs-simulator` in TS-08's Spec column. Set Status ✅ only when the PR is merged.
  - **`docs/DECISIONS.md`**: add **D-37** after D-36 (the current date, Status "Active"), using the table format of D-36. Content:
    - **Decision**: vital signs simulator (TS-08) as two hand-run standard-library commands.
      - `python -m app.demo_patients` creates the fixed six demo patients PAT-001 to PAT-006 with an initial triage event, and its `--reset` (with `--yes` or an interactive "yes") touches only those six identifiers, in one transaction.
      - `python -m app.simulator` runs table-driven stable, slow and rapid scenarios (linear progress capped at 1 plus small noise seeded from `seed:identifier:step`, where step = saved readings, so runs continue and stay reproducible). Defaults: 300 s interval, `--demo` 15 s, a 60-minute limit, plus `--once`, `--rounds` and `--seed`.
      - All readings go through `app/readings.py` `record_reading`, the single insertion point that US-03 extends.
    - **Reason**: constitution cost control and VI, D-09 and D-23.
    - **Rejected**: a background or API-started scheduler, a scheduler library, random walks, `hash()`-based seeds, a new step/scenario column, and prefix-based reset.

  (orchestrator)

---

## Dependencies & Execution Order

- **Setup**: T001 comes first.
- **Implementation**: T002, T003 and T005 have no dependencies on each other and can run in parallel (different files). T004 depends on T002 and T003.
- **Tests**: T006 depends on T002, T007 on T003 (and T004 for `test_scenarios_known`), and T008 on T004. They can run in parallel (different files).
- **Checks**: T009 depends on T002–T008. T010 depends on T009.
- **Polish**: T011 comes after T010. T012 runs last.
- **Story dependencies**: TS-03 and TS-07 (both merged), per `docs/BACKLOG.md`.

## Parallel Example

```text
# Round 1 (backend-dev): T001 → in parallel T002 (readings), T003 (demo patients), T005 (README) → T004 (simulator)
# Round 2 (qa-tester), in parallel: T006 (readings), T007 (demo patients), T008 (simulator)
# Round 3: T009 (qa-tester) → T010 (security-reviewer) → T011 Neon check → T012 docs (orchestrator)
```

## Implementation Strategy

There is one story, so the MVP is the whole of Phase 3: `record_reading` and the demo patients first, so the simulator can be built and tested against them. Validate with `python -m pytest` and the quickstart Neon check before the PR. The PR includes the spec link, the agent log summary, the local test output (D-27), the security review and the Neon check record.
