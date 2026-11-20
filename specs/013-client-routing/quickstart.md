# Quickstart: Validate Client Routing (TS-13)

## Automated checks (no backend, no network)

From `frontend/`:

```bash
npm install            # picks up react-router from package-lock.json
npm test               # all tests, incl. App.routes.test.jsx, noRawColors and contrast
npm run build
npm audit --audit-level=high
```

Expected: all pass; the test count is the 221 existing tests plus the new route and helper tests.

## Manual check in local development (record in the PR, SC-005)

Start the backend (see `backend/README.md`) and `npm run dev`, then open `http://localhost:5173`.

| # | Steps | Expected |
|---|---|---|
| 1 | Signed out, open `/` | Address becomes `/login`; login page inside the page frame |
| 2 | Signed out, open `/patients/PAT-003`, sign in as the demo doctor | Lands on `/patients/PAT-003`, page shows `PAT-003` |
| 3 | Signed in, open `/login` | Address becomes `/patients` |
| 4 | On `/patients/PAT-003`, click "Volver a la lista de pacientes", then browser Back, then Forward | List → detail → list, no full reload, still signed in |
| 5 | On `/patients/PAT-003`, press F5 | Same page, still signed in (Vite dev server serves `index.html`) |
| 6 | Open `/abc`, `/patients/pat-001`, `/patients/PAT-001/extra` | Not-found page with link to the patient list |
| 7 | Switch ES/EN on each page | Texts change, address does not |
| 8 | On `/patients/PAT-003`, click "Cerrar sesión", sign in again | Ends on `/login` with no "session expired" message; after sign-in lands on `/patients` |
| 9 | Signed in, clear `sessionStorage['pdm.session']` token value to a bad token and reload a clinical page | Ends on `/login` with "Tu sesión ha terminado…"; after sign-in returns to the same page |
| 10 | Tab through each page | Links and buttons show the focus ring; links are at least 44px tall |

Deep-link refresh on the Azure URL is checked after TS-11 is merged.

See [contracts/routes.md](contracts/routes.md) for the full address table and [data-model.md](data-model.md) for the state transitions.
