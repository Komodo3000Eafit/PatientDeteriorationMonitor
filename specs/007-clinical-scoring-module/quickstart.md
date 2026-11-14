# Quickstart: Clinical Scoring Module (TS-07)

The story needs only the automated tests. There is no database, network, endpoint or UI, so no manual Neon or browser check is needed. Paste the test summary in the PR (D-27). The behaviour is defined in [contracts/scoring-interface.md](contracts/scoring-interface.md).

## 1. Automated tests

From `backend/` with the virtual environment active (no new packages to install):

```powershell
python -m pytest
```

Expected:

- all tests pass, including the 136 existing ones;
- the whole suite takes under 30 s (SC-006);
- the new files are `tests/test_scoring_news2.py`, `tests/test_scoring_limits.py` and `tests/test_scoring_interface.py`.

To run only the new tests:

```powershell
python -m pytest tests -k scoring -v
```

## 2. Quick look in a Python shell (optional)

From `backend/`:

```powershell
python -c "from app.scoring import get_scoring_system, vital_signs_from_mapping as v; r = get_scoring_system().score(v({'respiratory_rate': 16, 'spo2': 98, 'on_oxygen': False, 'systolic_bp': 120, 'heart_rate': 70, 'consciousness': 'V', 'temperature': 37.0})); print(r.system, r.total, r.band)"
```

Expected: `NEWS2 3 low-medium`. With `'spo2': 101` it raises `InvalidVitalSigns: invalid vital signs: spo2: out_of_range` instead.

## 3. Isolation check (SC-004)

```powershell
git grep -n -i news2 -- backend/app ':!backend/app/scoring'
```

Expected: no output. `tests/test_scoring_interface.py` checks the same thing automatically.
