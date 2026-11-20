# Research: Client Routing (TS-13)

No item in the Technical Context was left as NEEDS CLARIFICATION. Each decision below records what was chosen, why, and what was rejected.

## R1 — Routing library and version

- **Decision**: `react-router` **8.5.2** (the `latest` tag on npm), the single package only (no `react-router-dom`). Added to `dependencies` with the same caret style as the other packages (`^8.5.2`); `package-lock.json` pins the exact tree and is committed.
- **Checked** (npm registry, 2026-11-19): peer dependencies `react >=19.2.7`, `react-dom >=19.2.7` (the project has `^19.3.1`); `engines.node >=22.22.0` (local and CI use Node 26, D-38); two small runtime dependencies (`cookie-es`, `@remix-run/route-pattern`). The root entry `react-router` exports everything this story needs: `BrowserRouter`, `MemoryRouter`, `Routes`, `Route`, `Navigate`, `Outlet`, `Link`, `useLocation`, `useParams`, `useNavigate`. No `react-router/dom` import is needed for declarative mode.
- **Note**: 8.5.2 was published on 2026-11-18, one day before this plan. `npm audit --audit-level=high` must pass at implementation time; if 8.5.2 is pulled or flagged, fall back to **8.5.1** (2026-10-27) and record that in D-44.
- **Rationale**: the standard React router; one dependency gives addresses, redirects, history, nested protected routes and a test router (`MemoryRouter`). Static segments rank above dynamic ones, so `/patients/new` (US-01) beats `/patients/:identifier` with no extra code (FR-014).
- **Alternatives rejected**: `react-router-dom` (in v7+ it only re-exports `react-router`; one more name to remember); a hand-written router on `window.history` + `popstate` (re-implements matching, ranking and `<Navigate>`, more code to test, Principle XII); TanStack Router / Wouter (less known by the team, no benefit at this size).

## R2 — Routing style

- **Decision**: **declarative mode**: `<BrowserRouter>` in `main.jsx`, `<Routes>` / `<Route>` in `App.jsx`. No data router (`createBrowserRouter`), loaders, actions, lazy routes or framework mode.
- **Rationale**: the spec needs only address → page, redirects and a guard; pages fetch their own data as today (`StartPage` pattern). Keeping `BrowserRouter` in `main.jsx` lets tests render `<App />` inside `<MemoryRouter initialEntries={[path]}>` and start at any address.
- **Alternatives rejected**: data router (loaders would move fetching out of the pages and change TS-04/TS-06 patterns; not needed); `BrowserRouter` inside `App.jsx` (tests could not choose the starting address without touching `window.history`).

## R3 — Protecting clinical pages

- **Decision**: `<RequireAuth>` becomes a **layout route**: `<Route element={<RequireAuth />}>` wraps every clinical route and renders `<Outlet />` when signed in, otherwise `<Navigate to="/login" replace state={{ from: pathname }} />`. A functional story adds one `<Route>` line inside that group.
- **Rationale**: one guard for all clinical pages, so a new page cannot forget it; `replace` keeps the protected address out of the back history; `<Navigate>` renders nothing, so no clinical content is shown even for one frame (AC3, SC-003). D-35 still holds (clinical screens are inside `<RequireAuth>`); only its behavior changes from "draw the login page in place" to "redirect to `/login`".
- **Alternatives rejected**: wrapping each page element (`<RequireAuth><Page/></RequireAuth>`) (each story must remember it); a role check (out of scope).

## R4 — Return-to page

- **Decision**: router **navigation state** only: `state.from` = the protected pathname. `/login` reads it after sign-in through a small pure function `returnPath(state)` in `src/auth/returnPath.js`, which returns `state.from` only if it is a string that starts with a single `/`, is not `//…` or `/\…`, and is not `/login` (or under it); otherwise `/patients`. Unit-tested.
- **Rationale**: memory only, as clarified (no `?next=`, no storage, patient codes stay out of extra addresses). History state is same-origin, but the check still blocks any outside or odd target (no open redirect). Only the pathname is kept: the app has no query strings or hashes.
- **Alternatives rejected**: `?next=` (clarification chose memory only); `sessionStorage` (same); passing the whole `location` object (more to validate, nothing gained).

## R5 — Where the post-sign-in redirect happens

- **Decision**: `LoginPage` starts with `if (user) return <Navigate to={returnPath(location.state)} replace />`. This one line covers both "a signed-in user opens `/login` → `/patients`" (no state) and "after sign-in, go back to the remembered page" (state set by the guard). `signIn` itself is unchanged.
- **Rationale**: no extra route wrapper component; `LoginPage` already reads `useAuth()`; `replace` keeps `/login` out of the back history after sign-in.
- **Alternatives rejected**: `navigate()` inside `onSubmit` after `signIn` (two places to keep in sync with the "already signed in" case; runs after the page may already be unmounting); a separate `RedirectIfSignedIn` wrapper (one more component for one line).

## R6 — Session expiry vs logout

- **Decision**: expiry needs no new code: the 401 handler sets `user = null` and `sessionExpired = true` (TS-06), the guard redirects to `/login` with `from` = current page, and `LoginPage` already shows the "session expired" message. For **logout**, `AuthContext` gains one boolean `loggedOut` (true after `signOut`, false after `signIn` and after a 401). The guard passes `state` only when `loggedOut` is false. The sign-out button in `AppShell` calls `signOut()` and then `navigate('/login', { replace: true })`, so logout also ends on `/login` from a public page such as not-found.
- **Rationale**: React may apply the router's location update and the auth update in different renders (router navigations run in a transition), so "navigate first, then sign out" alone could let the guard remember the page. A flag read by the guard makes the outcome independent of render order (FR-008: no remembered page after logout).
- **Alternatives rejected**: relying on update batching only (render order not guaranteed); clearing `state.from` inside `LoginPage` (cannot tell logout from a first visit).

## R7 — Patient code check

- **Decision**: `src/utils/patientCode.js` exports `isPatientCode(value)`: `true` only for a string matching `^[A-Z0-9-]{1,20}$` (glossary: upper-case letters, digits and `-`; database column `String(20)` in `backend/app/models.py`). `PatientDetailPage` renders the not-found page for any other value. Pure presentation check, no clinical logic, unit-tested.
- **Rationale**: an address-level check keeps odd values (lower case, spaces, markup, very long strings) away from future API calls in US-05 and shows a clear page instead. React escapes the value, so it is never markup.
- **Alternatives rejected**: a constraint in the route path syntax (ties the rule to router syntax and is harder to unit-test than one plain function); no check (US-05 would need its own).

## R8 — Pages, texts and links

- **Decision**: new folders `pages/patient-list/`, `pages/patient-detail/`, `pages/not-found/` (TS-12 structure); `pages/start/` is deleted and its health check moves into `PatientListPage` unchanged. Pages use `Card` and existing tokens; in-app links are `react-router` `<Link>`, styled once in `styles/global.css` (`a { color: var(--color-primary) }`, inline-flex with `min-height: var(--size-target)` for the 44px target); `primary on bg` is added to the text pairs in `contrast.test.js` (5.17:1). No new CSS Module is needed unless a page needs layout spacing; if one does, it uses tokens only.
- **New translation keys** (es / en): `patients.title` Pacientes / Patients; `patients.placeholder` La lista de pacientes se mostrará aquí. / The patient list will be shown here.; `patientDetail.title` Paciente {code} / Patient {code}; `patientDetail.placeholder` El detalle del paciente se mostrará aquí. / The patient detail will be shown here.; `nav.backToPatients` Volver a la lista de pacientes / Back to the patient list; `notFound.title` Página no encontrada / Page not found; `notFound.message` La dirección que abriste no existe en esta aplicación. / The address you opened does not exist in this app. Final wording may be polished during implementation; keys stay.
- **Glossary**: add **patient list** ("Lista de pacientes"), **patient detail** ("Detalle del paciente"), **not-found page** ("Página no encontrada") and **page address** (route) with the rule that only the patient code may appear in one.

## R9 — Tests

- **Decision**: a test helper `src/testing/renderApp.jsx` renders `<MemoryRouter initialEntries={entries}><App /><LocationProbe /></MemoryRouter>`, where `LocationProbe` prints the current pathname in a `data-testid="location"` element, so tests can assert redirects. A new `src/App.routes.test.jsx` covers each route and redirect (FR-015). Existing tests that render `<App />` (`App.test.jsx`, `auth/auth.test.jsx`, `pages/login/LoginPage.test.jsx`, `i18n/language.test.jsx`) switch to `renderApp('/patients')` or `renderApp('/login')`; their assertions change only where the old in-place login page became a redirect (AC12). Unit tests for `isPatientCode` and `returnPath`. Back/forward is tested with two initial entries and a probe button that calls `navigate(-1)`; real browser back/forward/refresh is the manual check in quickstart (SC-005).
- **Rationale**: no new test tool; one helper avoids repeating router setup in five files.
