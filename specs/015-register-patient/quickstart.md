# Quickstart: validate Register Patient (US-01)

## Prerequisites

- Local setup from [DEVELOPMENT.md](../../DEVELOPMENT.md) (Python 3.13 venv in `backend/`, Node 26 in `frontend/`).
- For the manual check only: a Neon dev branch in `backend/.env` (`DATABASE_URL`, `AUTH_SECRET`),
  migrations applied, demo users seeded (`python -m app.seed_demo_users`) and optionally the demo
  patients (`python -m app.demo_patients`). Synthetic data only.

## 1. Automated checks (no database, no network)

```bash
cd backend && python -m pytest            # all pass; new: tests/test_patients.py (AC1–AC6)
cd frontend && npm test                   # all pass; new: register-patient tests (AC7–AC14)
cd frontend && npm run build && npm audit --audit-level=high
```

Expected: the previous totals plus the new tests, 0 failures; the raw-color and contrast guard
tests still pass.

## 2. API check (local backend: `uvicorn app.main:app --reload`)

1. `POST /api/auth/login` as the demo nurse → token.
2. `POST /api/patients` with `{"name":"Paciente Ficticio","age":40,"sex":"other","triage_level":3}`
   → 201, `identifier` is `PAT-007` (or the next after the highest existing code), `status` `active`.
3. Same request again → 201 with the next code.
4. Add `"identifier":"PAT-001"` to the body → 422, body names `identifier`, does not contain `PAT-001`.
5. `"age": 131` → 422 (loc `["body","age"]`), value not in the body.
6. As the demo doctor → 403 `Only nurses can register patients`; without a token → 401.
7. In the database: exactly one `triage_events` row for each new patient, `source='initial'`,
   `previous_level` NULL, `created_by_id` = the nurse, `occurred_at = admitted_at`.

Contract: [contracts/patients-api.md](contracts/patients-api.md).

## 3. UI check (`npm run dev`, backend running)

1. Sign in as the nurse → patient list shows **Registrar paciente**. Sign in as the doctor → no button.
2. Nurse: open it → `/patients/new`; nothing pre-selected; the name label says *ficticio* with
   "No uses datos reales.".
3. Submit empty → a message next to each field, no request sent (Network tab).
4. Fill in valid data → the app goes to `/patients/PAT-NNN`.
5. Switch to EN while typing → texts change, typed values stay.
6. Doctor opens `/patients/new` directly → "Solo el personal de enfermería puede registrar pacientes." and the back link, no form.
7. Signed out, open `/patients/new` → redirected to `/login`.

Contract: [contracts/ui.md](contracts/ui.md).
