# Quickstart: Export Vital Signs to CSV (US-10)

How to check that the feature works. Contracts:
[readings-export-api.md](contracts/readings-export-api.md), [ui.md](contracts/ui.md).

## Automated checks

```bash
cd backend && python -m pytest tests/test_readings_export_api.py tests/test_scoring_interface.py
cd backend && python -m pytest            # full suite still green
cd frontend && npm test                   # includes readingsCsv, ExportReadingsButton and the guard tests
cd frontend && npm run build
```

Expected: all pass, `test_news2_confined` included, as well as the frontend raw-color
(`styles/noRawColors.test.js`) and contrast (`styles/contrast.test.js`) guards.

## Manual check (local)

Prerequisites: backend `.env` with `DATABASE_URL` and `AUTH_SECRET`, demo patients and users
seeded ([DEVELOPMENT.md](../../DEVELOPMENT.md)), and some readings (run the simulator for a few
rounds, or enter readings as `demo.nurse`).

1. Start the backend (`uvicorn app.main:app --reload`) and the frontend (`npm run dev`).
2. Sign in as `demo.doctor` and open `/patients/PAT-001`.
   - **Expect** an "Exportar CSV" button with a download icon next to the title.
3. Click it.
   - **Expect** a download named `PAT-001-vital-signs-<today>.csv`.
   - **Expect** the first line to be
     `recorded_at,respiratory_rate,spo2,on_oxygen,systolic_bp,heart_rate,consciousness,temperature,news2_total,risk_band`.
   - **Expect** one row per reading, oldest first, with temperatures such as `37.0`, `true`/`false`,
     ACVPU letters and band codes.
   - Compare the latest row with the "Lectura actual" block on the page: **expect** the same values,
     NEWS2 score and band.
4. Open the file in a spreadsheet. **Expect** 10 columns and no value treated as a formula.
5. Register a new patient (as `demo.nurse`), open its detail page and export.
   - **Expect** a file with only the header line.
6. Switch to English. **Expect** "Export CSV". The file content is the same.
7. Sign in as `demo.nurse` on `/patients/PAT-001`. **Expect** the export button there too.
8. Sign out and open `/patients/PAT-001`. **Expect** a redirect to the login page and no export
   button.
9. Stop the backend and click export. **Expect** "No se pudo exportar el CSV. Inténtalo de nuevo."
   and no file.

## Unauthenticated API check

```bash
curl -i http://localhost:8000/api/patients/PAT-001/readings/export
```

Expect `401` with `{"detail":"Not authenticated"}` and no reading data.
