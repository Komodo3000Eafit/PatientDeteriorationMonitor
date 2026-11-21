# Quickstart: Patient Detail Page (US-05)

Validation guide for the two read-only endpoints and the detail page. No migration; no new
dependency. Run from the repository root.

## Prerequisites

- Backend deps installed (`backend/requirements.txt`); frontend deps installed (`frontend/`).
- For the manual API/UI checks: `DATABASE_URL` set to a Neon branch, the demo users seeded
  (TS-06) and at least one patient with a reading (US-01 + US-03, e.g. run the simulator briefly).

## 1. Automated tests (the gate)

```bash
# Backend — new endpoint tests plus the unchanged suite
cd backend && pytest tests/test_patient_detail.py && pytest

# Frontend — the detail page states plus the unchanged suite
cd frontend && npm test
```

Expected: `test_patient_detail.py` and `PatientDetailPage.test.jsx` pass, and the full backend and
frontend suites stay green (record the baseline counts in the first task).

## 2. Backend API checks (manual, optional)

With a valid token (`POST /api/auth/login`) and an existing patient `PAT-007`:

```bash
# Patient data: 200, no monitoring_status, no internal id, last_reading_at present or null
curl -sS -H "Authorization: Bearer $TOKEN" .../api/patients/PAT-007

# Triage history: 200, newest-first, no id/patient_id
curl -sS -H "Authorization: Bearer $TOKEN" .../api/patients/PAT-007/triage-events

# Current reading reused unchanged
curl -sS -H "Authorization: Bearer $TOKEN" ".../api/patients/PAT-007/readings?limit=1"
```

Expected:
- `GET /api/patients/PAT-007` → `identifier, name, age, sex, triage_level, status, admitted_at,
  last_reading_at`; **no** `monitoring_status`, **no** `id`.
- `GET /api/patients/PAT-007/triage-events` → `{ "triage_events": [...] }` newest-first; **no**
  `id`/`patient_id`; `previous_level`/`score` may be `null`.
- No token → 401. `GET /api/patients/not a code` or an unknown `PAT-999` → 404 `Patient not
  found`. `DATABASE_URL` unset → 503 `Service unavailable`. No submitted value appears in any
  error body.

## 3. UI checks (manual, optional)

```bash
cd frontend && npm run dev   # Vite dev server; backend running separately
```

- Sign in, open `/patients/PAT-007`:
  - Patient block: name, age, sex, `TriageLevelBadge`, status, `admitted_at`. No traffic-light
    badge.
  - Reading block: the current reading, its NEWS2 score, the risk band (via `RiskBandBadge`) and
    the reason per point (reused `ReadingResult`).
  - Triage history newest-first; the initial event shows "no previous level" and "no score".
  - The nurse-only "Registrar signos vitales" button appears for a nurse, not a doctor.
- Open a patient with **no** reading: the reading block shows "no readings yet" (no band, no time);
  the patient block and the triage history still render.
- Open `/patients/not-a-code` → the not-found page, with no backend call.
- Open `/patients/PAT-999` (well-formed, unknown) → "patient not found" with a link back.
- Stop the backend and reload → "could not load" with a retry button, never raw server text.
- Toggle ES/EN → every label, section heading, source label and message switches; the loaded data
  is not lost.
- Sign out and open `/patients/PAT-007` directly → redirected to `/login`.

## 4. Acceptance-criteria trace

| AC | Checked by |
|---|---|
| AC1, AC10 | reading block from `readings?limit=1`; `test_patient_detail` + `PatientDetailPage.test` |
| AC2 | patient block; endpoint has no `monitoring_status` |
| AC3, AC9 | triage-events endpoint newest-first; backend test |
| AC4 | risk band via `RiskBandBadge`, not `StatusBadge` |
| AC5 | "no readings yet" state; no fabricated time |
| AC6 | invalid code → not-found (no call); unknown code → 404 message |
| AC7 | 401 on both endpoints; `<RequireAuth>` redirect |
| AC8 | patient endpoint body + no `id` + 404 + 401 |
| AC11 | ES/EN tests |
| AC12 | `<RecordReadingButton>` kept; no change to `PatientListPage` / US-04 |
