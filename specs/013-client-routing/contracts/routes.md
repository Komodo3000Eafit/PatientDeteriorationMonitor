# UI Contract: Page Addresses (TS-13)

This is the contract the functional stories and TS-11 rely on. Changing it needs a DECISIONS entry.

## Addresses

| Address | Signed out | Signed in |
|---|---|---|
| `/` | → `/patients` (replace) → `/login` | → `/patients` (replace) |
| `/login` | Login page | → remembered page or `/patients` (replace) |
| `/patients` | → `/login` (replace, remembers `/patients`) | Patient list placeholder |
| `/patients/PAT-001` | → `/login` (replace, remembers it) | Patient detail placeholder showing `PAT-001` |
| `/patients/pat-001`, `/patients/<script>` | → `/login` (protected first) | Not-found page |
| `/abc`, `/patients/PAT-001/extra`, `/login/x`, `/api/...`, `/health` | Not-found page | Not-found page |

Every page is drawn inside `AppShell` (disclaimer, user block when signed in, ES/EN switch).

## Promises to other stories

- **US-02** replaces the body of `pages/patient-list/PatientListPage.jsx`; the route stays.
- **US-05** replaces the body of `pages/patient-detail/PatientDetailPage.jsx`; it reads the code with `useParams().identifier`, already checked by `isPatientCode`.
- **US-01** adds `<Route path="/patients/new" element={<NewPatientPage />} />` inside the `<RequireAuth>` group in `App.jsx`. It wins over `/patients/:identifier` by react-router's documented route ranking (static segments rank above dynamic ones), with no extra code. TS-13 does not test this; **US-01 verifies it** with a test that `/patients/new` shows its page, not the patient detail or not-found page.
- **TS-11** serves `index.html` for every non-API path; no page address starts with `/api` or equals `/health`.
- In-app links use `<Link to="/patients/PAT-001">`; only the patient code may be put in an address.

## Registering a page (for the README)

```jsx
// App.jsx, inside <Routes>
<Route element={<RequireAuth />}>
  <Route path="/patients" element={<PatientListPage />} />
  <Route path="/patients/:identifier" element={<PatientDetailPage />} />
  {/* protected pages go here */}
</Route>
{/* public pages go outside the group */}
```
