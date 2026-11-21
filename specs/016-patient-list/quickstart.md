# Quickstart: validate Patient List (US-02)

## Prerequisites

- Local setup from [DEVELOPMENT.md](../../DEVELOPMENT.md). For the manual check: a Neon dev branch
  in `backend/.env`, migrations applied, demo users seeded, demo patients created
  (`python -m app.demo_patients`). Synthetic data only.

## 1. Automated checks (no database, no network)

```bash
cd backend && python -m pytest            # new: tests/test_patient_list.py (AC1–AC5)
cd frontend && npm test                   # new: patient-list tests (AC6–AC15)
cd frontend && npm run build && npm audit --audit-level=high
```

All previous tests still pass; the guard tests (`noRawColors`, `contrast`, `tokens`) pass.

## 2. API check (`uvicorn app.main:app --reload`)

1. Sign in as the demo doctor; `GET /api/patients` → 200, the six demo patients, none with an `id`.
2. Run the simulator in demo mode (`python -m app.simulator --demo`) for a few rounds; repeat the
   request → every demo patient has `latest_score`; the rapid-deterioration patients come first.
3. Register a patient as the nurse (US-01) → it appears last with `latest_score: null`.
4. Without a token → 401.

Contract: [contracts/patient-list-api.md](contracts/patient-list-api.md).

## 3. UI check (`npm run dev`, backend running, simulator in `--demo`)

1. Nurse on `/patients`: "Registrar paciente" above the table; table columns Código, Nombre, Nivel de
   triage, Puntaje NEWS2, Última lectura; triage chips in the D-48 colors; score with the band badge.
2. Doctor: same table, no register button.
3. Wait 15 s: "Actualizado: …" changes and new scores appear without reloading.
4. Switch to another browser tab for a minute, come back: the list refreshes at once.
5. Stop the backend: after the next refresh the last list stays with "No se pudo actualizar la lista…";
   start it again: the message goes away on the next refresh.
6. A patient without readings shows "Sin datos" in score and time, never "Desconocida".
7. Click a patient code → `/patients/PAT-NNN`; Tab to a code and press Enter → same.
8. Narrow window (~360 px): the table scrolls sideways inside the card; the page does not.
9. Switch to EN: headers, "No data", "Updated: … ago" in English; the list stays.

Contract: [contracts/ui.md](contracts/ui.md).
