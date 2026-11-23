# Quickstart: Deterioration Prediction (US-08)

Validation guide. API details: [contracts/prediction-api.md](contracts/prediction-api.md); UI: [contracts/ui.md](contracts/ui.md); rule: [data-model.md](data-model.md).

## Prerequisites

- Backend dev setup and test database as in earlier stories (`backend/`, `DATABASE_URL` for tests).
- Frontend: `cd frontend && npm ci`.
- Demo users seeded (doctor and nurse).

## Automated checks

```bash
cd backend && pytest                        # all tests, including the new ones
cd backend && pytest tests/test_prediction.py tests/test_prediction_api.py tests/test_scoring_interface.py
cd frontend && npm test && npm run build && npm audit --audit-level=high
```

Expected new coverage:

| Test file | Cases |
|---|---|
| `backend/tests/test_prediction.py` (no DB) | `2,4,6` rising; `2,2,5` equal step → not_rising; `6,4,2` falling; `5,4,6` mixed; `3,3,3` flat; 0, 1, 2 totals → not_enough_readings; a `None` total → missing_score; precedence (2 totals with a `None` → not_enough_readings) |
| `backend/tests/test_prediction_api.py` | 401 without token; 404 unknown code and malformed code; 200 rising (scores oldest first, `latest_band`); 200 not rising; 200 no readings / 2 readings; only the 3 most recent of 5 readings count; equal `recorded_at` tie broken by id; rising with newest band `high`; discharged patient gets the same answer; response keys are exactly `rising, reason, readings, latest_band` and no id or vital value appears; no row added to `alerts` / `triage_events` and `triage_level` unchanged after the call; 503 on a database error (logged by type) |
| `backend/tests/test_scoring_interface.py::test_news2_confined` | still passes (no "news2" text in the new modules) |
| `frontend/.../DeteriorationPrediction.test.jsx` | rising card (icon, title, 3 scores in order, RiskBandBadge); not_rising and missing_score note; not_enough_readings note; nothing rendered while loading; error note on 503 / network failure / timeout; 404 and 401 render nothing; Spanish default and English after the switch; page-level: prediction 503 while patient data and the record-reading button still render |
| existing raw-color and contrast guards, `PatientDetailPage.test.jsx`, `RetriageSuggestion.test.jsx` | still pass |

## Manual check

1. Start the backend and frontend; sign in as the doctor.
2. Open a patient with fewer than 3 readings → "Se necesitan al menos 3 lecturas…".
3. Record readings so the scores go up three times (for example via the simulator `rapid` scenario, or record-reading with worse vitals) and reload the page → the "Predicción de deterioro" warning shows the three scores and the risk band.
4. Record a reading with a lower score and reload → "Sin predicción de deterioro."
5. Switch to English → texts change, values stay.
6. Confirm the patient's triage level and the re-triage suggestion section did not change because of the warning.
7. `curl` the endpoint without a token → 401; with `PAT-999999` → 404.
