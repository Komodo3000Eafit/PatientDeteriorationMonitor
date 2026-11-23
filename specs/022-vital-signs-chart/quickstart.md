# Quickstart: validate Vital Signs Chart (US-06)

## Prerequisites

Local setup from [DEVELOPMENT.md](../../DEVELOPMENT.md). For the manual check: Neon dev branch in
`backend/.env`, migrations applied, demo users and demo patients created. Synthetic data only.

## 1. Automated checks (no database, no network)

```bash
cd frontend && npm ci && npm test        # new: vital-signs-chart tests (AC1–AC11)
cd frontend && npm run build              # note the JS bundle size before/after (D-54)
cd frontend && npm audit --audit-level=high
cd backend && python -m pytest -q         # unchanged backend still green
```

`package.json` shows exactly two new dependencies, `chart.js` and `react-chartjs-2`, with no caret.
The guard tests (`noRawColors`, `contrast`, `tokens`) and all US-05 tests pass.

## 2. UI check (`npm run dev`, backend running, `python -m app.simulator --demo`)

1. Open `/patients/PAT-005` as the doctor, then as the nurse: "Historial de signos vitales" below the
   two columns; the rest of the page as before.
2. Default line: Puntaje NEWS2; points oldest → newest; x labels `HH:MM:SS`; markers on every point;
   no colored bands or threshold lines.
3. Change the selector to each of the five vital signs: y-axis title with unit; the selector has no
   oxygen or consciousness option.
4. Wait 15 s: a new point appears, "En vivo · Actualizado: …" changes, the chosen parameter stays.
5. Hide the tab for a minute, come back: it updates at once.
6. Stop the backend: the last chart stays with "No se pudo actualizar el gráfico…".
7. A newly registered patient (US-01) shows "Aún no hay lecturas para este paciente."
8. Screen reader / devtools: canvas named "Gráfico de Puntaje NEWS2 del paciente PAT-005"; hidden table
   lists every point.
9. Switch to EN: texts in English, temperature with a dot; ~360 px window: the chart fits the card.
