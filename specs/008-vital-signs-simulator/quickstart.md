# Quickstart: Vital Signs Simulator (TS-08)

## 1. Automated tests (no database, no network)

From `backend/` with the virtual environment active:

```powershell
python -m pytest
```

**Expected**: all tests pass, which is the 256 existing ones plus the new `test_readings.py`, `test_demo_patients.py` and `test_simulator.py`. Paste the output in the PR (D-27).

## 2. One-time manual check on Neon (record the result in the PR)

Prerequisite: `backend/.env` has `DATABASE_URL` for the Neon `main` branch, with the TS-03 migrations applied. Keep the session short, because the simulator keeps Neon awake (constitution cost control).

1. **Create the demo patients**: run `python -m app.demo_patients`.
   - The first run shows `created: PAT-001 …` to `created: PAT-006 …`.
   - Run it again: it shows six `exists:` lines.
2. **Run one round**: run `python -m app.simulator --once --seed 1`.
   - **Expected**: a header with seed 1, `Round 1` with six lines at `step 0`, and `Stopped: round limit reached. Rounds: 1, readings saved: 6.`
3. **List the readings**, with the Neon SQL editor or the Neon MCP `run_sql`:
   ```sql
   SELECT p.identifier, v.recorded_at, v.respiratory_rate, v.spo2, v.on_oxygen,
          v.systolic_bp, v.heart_rate, v.consciousness, v.temperature
   FROM vital_signs v JOIN patients p ON p.id = v.patient_id
   ORDER BY p.identifier, v.recorded_at;
   ```
   **Expected**: six rows, one per demo patient, with the same values as printed.
4. **Check that runs continue**: run `python -m app.simulator --once --seed 1` again.
   - **Expected**: every line shows `step 1`, and the query returns 12 rows.
5. **Optional, demo mode**: run `python -m app.simulator --demo --rounds 3`.
   - **Expected**: about 30 s in total, and PAT-005 and PAT-006 get visibly worse.
6. **Reset**: run `python -m app.demo_patients --reset --yes`.
   - **Expected**: six `reset:` lines. The query returns 0 rows, and each demo patient has exactly one triage event:
   ```sql
   SELECT p.identifier, count(t.id) FROM patients p
   LEFT JOIN triage_events t ON t.patient_id = p.id
   WHERE p.identifier IN ('PAT-001','PAT-002','PAT-003','PAT-004','PAT-005','PAT-006')
   GROUP BY p.identifier ORDER BY p.identifier;
   ```
7. **Check the error handling**: in a new shell with `DATABASE_URL` set to an invalid host, run `python -m app.simulator --once`.
   - **Expected**: `Could not reach the database (…)`, exit code 1, and no connection string in the output.

Leave the demo patients in place after the check. They are the demo data for the later stories.
