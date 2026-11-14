# Contract: demo-patient command, simulator command and `record_reading` (TS-08)

Both commands are run by hand from `backend/` with the virtual environment active. They read `DATABASE_URL` from the environment or from `backend/.env` (TS-02). Neither command ever prints the connection string, an error message from the driver, or a secret.

## 1. `python -m app.demo_patients [--reset] [--yes]`

| Option | Meaning |
|---|---|
| (none) | Create the missing demo patients PAT-001 to PAT-006, each with one "initial" triage event. Existing ones are left unchanged. |
| `--reset` | Additionally, for exactly PAT-001 to PAT-006: delete their readings, triage events and alerts, set them back to `active` at their initial triage level, and add a new "initial" triage event. Everything happens in one transaction. |
| `--yes` | Confirm `--reset` without a prompt. It has no effect without `--reset`. |

**Confirmation for `--reset`**:
- With `--yes`, there is no prompt.
- In an interactive terminal without `--yes`, the command asks `Type "yes" to delete the readings, triage events and alerts of PAT-001 to PAT-006: `. Only the exact answer `yes` continues.
- If the answer is anything else, or the input is not interactive, it prints `Reset cancelled: nothing was changed` to stderr and exits with code 1. The database is not touched.

**Output** (stdout, one line per demo patient, in identifier order):

```text
created: PAT-001 (stable, triage 4)
exists: PAT-002
reset: PAT-003 (slow, triage 3)
```

**Exit codes and errors**:

| Case | stderr | Exit code |
|---|---|---|
| success | (none) | 0 |
| reset not confirmed | `Reset cancelled: nothing was changed` | 1 |
| `DATABASE_URL` not set | `DATABASE_URL is not set` | 1 |
| database error (`SQLAlchemyError`) | `Could not update the demo patients (<ErrorType>)`; nothing is committed | 1 |
| bad option | argparse usage message | 2 |

## 2. `python -m app.simulator [options]`

| Option | Default | Meaning |
|---|---|---|
| `--interval-seconds N` | 300 | Seconds between rounds (positive whole number). |
| `--demo` | off | Use 15 seconds between rounds. Cannot be combined with `--interval-seconds`. |
| `--once` | off | Run one round and exit. Cannot be combined with `--rounds`. |
| `--rounds N` | none | Stop after N rounds (positive whole number). |
| `--minutes M` | 60 | Stop when the next round would start at or after M minutes (positive whole number). |
| `--seed S` | random | Whole number; the same seed gives the same values. Without it, a seed is chosen and printed. |

- **Stopping**: the simulator stops at the first limit reached (rounds or minutes), or on Ctrl+C. It never starts on its own and is not started by the API.
- **Round**: every patient with `status = 'active'`, in identifier order, gets one reading at step = their number of saved readings. Each reading is committed on its own.

**Output** (stdout; the values below are only an example):

```text
Simulator: interval 15 s, limit 60 min, rounds no limit, seed 482913 (use --seed 482913 to repeat)
Round 1
  PAT-001 stable step 0: RR 16, SpO2 97, O2 no, SBP 124, HR 77, ACVPU A, T 36.8
  PAT-005 rapid step 0: RR 17, SpO2 96, O2 no, SBP 121, HR 81, ACVPU A, T 37.0
Round 2
  ...
Stopped: round limit reached. Rounds: 2, readings saved: 12.
```

- With no active patients, the round prints `  no active patients` and saves nothing.
- If a generated reading fails validation (a defect), the round prints `  PAT-00X not saved: invalid <parameter>, <parameter>` and continues with the next patient.
- The stop reasons are `round limit reached`, `time limit reached` and `stopped by Ctrl+C`.

**Exit codes and errors**:

| Case | stderr | Exit code |
|---|---|---|
| normal stop or Ctrl+C | (none); the summary is on stdout | 0 |
| `DATABASE_URL` not set | `DATABASE_URL is not set` (before any round) | 1 |
| database error (`SQLAlchemyError`) at any time | `Could not reach the database (<ErrorType>)`, after the summary of what was already saved | 1 |
| bad or conflicting option | argparse usage message (before any database access) | 2 |

## 3. `app.readings.record_reading(session, patient_id, vitals) -> VitalSign`

- **Inputs**:
  - `session` is an open SQLAlchemy `Session`;
  - `patient_id` is an `int` (`patients.id`);
  - `vitals` is a TS-07 `app.scoring.VitalSigns`.
- **Behaviour**:
  - It validates with `app.scoring.validate_vital_signs`. Invalid values raise `InvalidVitalSigns` (with problems listed by parameter and reason, and no values), and **nothing is added to the session**.
  - When the values are valid, it adds one `VitalSign` row with the 7 values, calls `flush()`, and returns the row, which now has its `id`.
  - It does not commit. The caller commits or rolls back.
- **Single insertion point**: no other code in `backend/app/` creates `VitalSign` rows. A test enforces this with a source search, the same approach as the TS-07 isolation test.
- **Extension (US-03)**: US-03 adds scoring and storing the score inside this function (or right after the insert, in the same function). Callers don't change.
