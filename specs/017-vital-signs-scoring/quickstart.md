# Quickstart: Validate US-03 (Save and Score Vital-Sign Readings)

Contracts: [readings-api.md](contracts/readings-api.md), [ui.md](contracts/ui.md). Data:
[data-model.md](data-model.md). Synthetic data only.

## 1. Automated checks (must all pass)

```bash
cd backend && python -m pytest            # all backend tests, incl. readings, API, migration, simulator, demo reset
cd frontend && npm test && npm run build && npm audit --audit-level=high
```

Expected: every test green; the backend and frontend test counts are the baseline from the first
task plus the new tests; no audit finding at high or above.

## 2. Migration on a Neon branch (never on production first)

**Deploy order**: during the US-03 deploy the migration (with the backfill) runs before the new
code is live. **Do not run the simulator while that deploy is in progress**: a reading saved by
the old code in that window would have no score. Run it again only once the new code is live,
then re-check the SQL below returns `0`.

```bash
cd backend
alembic heads                 # exactly one: 0002_reading_scores
alembic upgrade head --sql    # review: CREATE TABLE reading_scores with UNIQUE vital_sign_id
alembic upgrade head          # creates the table and backfills every existing reading
```

Check (SQL on the branch): `SELECT count(*) FROM vital_signs v LEFT JOIN reading_scores s ON
s.vital_sign_id = v.id WHERE s.id IS NULL;` → `0`. On the branch only: `alembic downgrade -1` drops `reading_scores`; `alembic upgrade head` again
recreates it and the check returns `0` again.

## 3. Simulator path

```bash
python -m app.demo_patients --reset --yes   # succeeds; scores of demo readings deleted with them
python -m app.simulator --rounds 1    # existing command, unchanged
```

Then the SQL check above still returns `0`.

## 4. API (local backend, demo users, `TOKEN_N` nurse / `TOKEN_D` doctor)

| Request | Expected |
|---|---|
| POST `/api/patients/PAT-001/readings` as nurse with the contract example body | 201; `score.total = 5`, `band = "medium"`, 7 entries; no `id` fields |
| same, no token | 401 |
| same as doctor | 403 `Only nurses can record vital signs` |
| POST `/api/patients/PAT-999/readings` / `.../pat-001/readings` | 404 |
| POST for a discharged patient | 409 |
| body with `spo2: 150`, `temperature: 37.25`, `recorded_at: "…"` | 422 with `out_of_range`, `too_many_decimals`, `unknown`; response contains none of `150`, `37.25` |
| GET `/api/patients/PAT-001/readings` as doctor | 200, newest first, ≤ 50 items |
| GET `...?limit=0` / `?limit=201` | 422 |

## 5. UI (npm run dev, sign in)

1. As the demo nurse open `/patients/PAT-001` → "Registrar signos vitales" button → form.
2. Submit empty → a message next to each of the 7 fields; nothing sent.
3. Enter the contract example (temperature `38,4` with a comma) → result: "Puntaje NEWS2 5",
   "Banda de riesgo: Media", 7 rows with reasons ("21–24", "94–95", "No", … "38.1–39.0").
4. Enter SpO2 `150` → sent; message "Valor no aceptado" next to SpO2 only; typed values kept.
5. Switch to EN → all texts in English; typed values / result unchanged.
6. As the demo doctor: no button on the patient detail page; the address shows the nurses-only
   message. `/patients/bad code/readings/new` → not-found page.
