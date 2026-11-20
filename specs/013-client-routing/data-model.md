# Data Model: Client Routing (TS-13)

No database, API or stored data changes. The "data" in this story is client-side state only.

## Page address (route)

| Path | Access | Page | Notes |
|---|---|---|---|
| `/` | any | — | `<Navigate to="/patients" replace />` |
| `/login` | public | `LoginPage` | Signed in → `<Navigate to={returnPath(state)} replace />` |
| `/patients` | protected | `PatientListPage` | Placeholder + `/health` result (from the old start page) |
| `/patients/:identifier` | protected | `PatientDetailPage` | Shows the patient code; invalid code → not-found page |
| `*` | any | `NotFoundPage` | Unknown or nested addresses |

Rules: no path starts with `/api` or equals `/health` (FR-013). Trailing slashes match the same route. Static paths (a future `/patients/new`) rank above `/patients/:identifier`.

## Patient code (`identifier` URL parameter)

- Valid: string matching `^[A-Z0-9-]{1,20}$` (`isPatientCode`, `src/utils/patientCode.js`).
- Invalid (lower case, spaces, other characters, empty, longer than 20): `NotFoundPage` is shown; the address is left as is.
- Shown only as plain text; no other patient data in any address.

## Return-to page (router navigation state)

- Shape: `location.state = { from: '/patients/PAT-003' }`, set only by `<RequireAuth>` when it redirects a signed-out user and `loggedOut` is false.
- Lifetime: the current history entry of `/login`; lost on reload or new tab.
- Read by `returnPath(state)` (`src/auth/returnPath.js`): returns `state.from` if it is a string starting with a single `/` (not `//`, not `/\`) and is not `/login` or below it; otherwise `/patients`.

## Auth state (existing `AuthContext`, one field added)

| Field | Existing | Meaning |
|---|---|---|
| `user` | yes | Signed-in user or `null` |
| `sessionExpired` | yes | Last sign-out came from a 401; `LoginPage` shows the message |
| `loggedOut` | **new** | Last sign-out came from the logout button; the guard then redirects without `from` |

Transitions:

| Event | `user` | `sessionExpired` | `loggedOut` | Where the user ends |
|---|---|---|---|---|
| First visit, no session | `null` | false | false | `/login` with `from` = page asked for |
| `signIn` succeeds | user | false | false | `returnPath(state)` |
| 401 on a request | `null` | true | false | `/login` with `from` = current page, message shown |
| Logout button | `null` | false | true | `/login`, no `from`, no message |
