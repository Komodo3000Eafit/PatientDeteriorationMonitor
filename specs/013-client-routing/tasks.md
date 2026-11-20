---

description: "Task list for TS-13 client routing"
---

# Tasks: Client Routing

**Input**: Design documents from `specs/013-client-routing/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/routes.md](contracts/routes.md), [quickstart.md](quickstart.md)

**Tests**: Mandatory. This story is a security control (constitution Principle VII: authentication on clinical views, redirects, return-to validation), so every acceptance criterion gets at least one automated test (spec FR-015). Tests are written by qa-tester after the implementation, as the project template orders it. Real-browser back/forward/refresh and the keyboard pass are the manual task T024.

**Organization**: This feature has one story (TS-13), so all story tasks carry the `[TS-13]` label.

## Format: `[ID] [P?] [Story] Description (agent)`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **(agent)**: Owner agent, at the end of the line: frontend-dev, qa-tester, security-reviewer or orchestrator. **(human)** = a manual step for the person running the story (needs a browser).
- All paths are relative to the repository root. Frontend commands run from `frontend/`.
- Edit files with the file tools, not PowerShell (non-ASCII Spanish text). Keep files UTF-8.
- **Only these paths change**: `frontend/src/**`, `frontend/package.json`, `frontend/package-lock.json` (only for `react-router`), `frontend/README.md`, `docs/GLOSSARY.md`, `docs/DECISIONS.md`, `docs/PROJECT_STATUS.md`, `docs/BACKLOG.md` and this story's `agent-log.csv`. Do not touch `backend/`, `.github/` or `.specify/` (FR-016).
- Agents log each step with `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/log-agent.ps1 -Agent <agent> -Task <Txxx> -Action <action> -Details "<text>"` (`pwsh` on macOS).
- Rules for every frontend task: import router APIs only from `react-router` (never `react-router-dom`); no raw color, no inline `style`, no hard-coded visible text, only `var(--token)` in styles; no page path starting with `/api` or equal to `/health` (FR-013); no patient data in any address except the patient code (FR-003); never commit a failing `npm test`.

---

## Phase 1: Setup

- [X] T001 [TS-13] Baseline before any change: in `frontend/` run `npm ci`, `npm test` and `npm run build`. Expect 14 test files and **221 passing tests**. Note the numbers for the PR description. Do not edit files (AC12) (qa-tester)
- [X] T002 [TS-13] Add the dependency: in `frontend/` run `npm install react-router@8.5.2`. Check that `frontend/package.json` `dependencies` now lists only `react`, `react-dom` and `react-router` (`^8.5.2`), and that `package-lock.json` changed. Run `npm audit --audit-level=high`: it must pass; if 8.5.2 is flagged or unavailable, install `react-router@8.5.1` instead and tell the orchestrator for D-45 (research R1). Run `npm test` and `npm run build`: both still pass with no code change. Depends on T001 (AC12, FR-001) (frontend-dev)

---

## Phase 2: Foundational

None. TS-05 (`LanguageContext`, `translations.js`, `AppShell`), TS-06 (`AuthContext`, `RequireAuth`, `LoginPage`, `client.js`) and TS-12 (tokens, `Card`, `Button`, `pages/` folders) are merged and are reused.

---

## Phase 3: TS-13 Client routing 🎯 MVP

**Goal**: the app has real page addresses (`/login`, `/patients`, `/patients/:identifier`, `/` → `/patients`, not-found), every clinical page is protected by one guard that redirects to `/login` and returns the user to the page they asked for, and functional stories add a page with one `<Route>` line in `App.jsx`.

**Independent Test**: `npm test`, `npm run build` and `npm audit --audit-level=high` pass in `frontend/`; `App.routes.test.jsx` covers every row of [contracts/routes.md](contracts/routes.md); the manual pass in [quickstart.md](quickstart.md) (T024) shows back, forward and refresh keep the page and the session.

### Helpers, texts and styles

- [X] T003 [P] [TS-13] Create `frontend/src/utils/patientCode.js` with a named export `isPatientCode(value)`: returns `true` only when `typeof value === 'string'` and it matches `/^[A-Z0-9-]{1,20}$/` ("upper-case letters, digits and `-`, 1–20 characters", GLOSSARY + `backend/app/models.py` `String(20)`); `false` for everything else. Header comment: "Patient code format check (TS-13). Presentation only: no clinical logic, no backend call." (research R7, FR-003) (frontend-dev)
- [X] T004 [P] [TS-13] Create `frontend/src/auth/returnPath.js` with a named export `returnPath(state)`: let `from = state?.from`; return `from` only when it is a string that starts with `/`, does **not** start with `//` or `/\`, and is neither `/login` nor starts with `/login/`; otherwise return `'/patients'`. Never throws for `undefined`, `null`, numbers or objects. Header comment: "Return-to page after sign-in (TS-13): only internal app paths, never /login, so no open redirect." (research R4, AC4, FR-006) (frontend-dev)
- [X] T005 [P] [TS-13] Edit `frontend/src/i18n/translations.js`: add these keys to **both** `es` and `en` (research R8): `patients.title` "Pacientes" / "Patients"; `patients.placeholder` "La lista de pacientes se mostrará aquí." / "The patient list will be shown here."; `patientDetail.title` "Paciente {code}" / "Patient {code}"; `patientDetail.placeholder` "El detalle del paciente se mostrará aquí." / "The patient detail will be shown here."; `nav.backToPatients` "Volver a la lista de pacientes" / "Back to the patient list"; `notFound.title` "Página no encontrada" / "Page not found"; `notFound.message` "La dirección que abriste no existe en esta aplicación." / "The address you opened does not exist in this app." Keep existing keys unchanged (AC9, FR-011) (frontend-dev)
- [X] T006 [P] [TS-13] Edit `frontend/src/styles/global.css`: add one rule for links: `a { color: var(--color-primary); display: inline-flex; align-items: center; min-height: var(--size-target); }` (token color, 44px target; the existing global `:focus-visible` rule already gives the focus ring). Add a comment above the rule: "Links are styled as standalone controls (TS-13). An inline link inside running text needs its own rule (e.g. display: inline) when a story adds one." No raw color (research R8, FR-012) (frontend-dev)

### Pages

- [X] T007 [P] [TS-13] Create `frontend/src/pages/not-found/NotFoundPage.jsx` (`export default`): `<main>` with `<h1>{t('notFound.title')}</h1>`, a `Card` (from `../../components/Card.jsx`) containing `<p>{t('notFound.message')}</p>` and `<Link to="/patients">{t('nav.backToPatients')}</Link>` (`Link` from `react-router`). No auth check (public page). Depends on T005 (AC7, FR-010) (frontend-dev)
- [X] T008 [TS-13] Create `frontend/src/pages/patient-list/PatientListPage.jsx` (`export default`) by moving the old start page: `git mv frontend/src/pages/start/StartPage.jsx frontend/src/pages/patient-list/PatientListPage.jsx`, rename the function to `PatientListPage`, update the header comment ("Patient list placeholder (TS-13) until US-02 replaces it; keeps the TS-04 /health check, once per load"). Keep the `<h1>{t('app.title')}</h1>` and the whole `/health` `<section role="status">` **unchanged** (existing tests rely on them); add, between the `h1` and the section, `<Card title={t('patients.title')}><p>{t('patients.placeholder')}</p></Card>`. Delete the now-empty `frontend/src/pages/start/` folder. Depends on T005 (FR-004, AC1) (frontend-dev)
- [X] T009 [TS-13] Create `frontend/src/pages/patient-detail/PatientDetailPage.jsx` (`export default`): `const { identifier } = useParams()` (from `react-router`); if `!isPatientCode(identifier)` return `<NotFoundPage />` (address left as is); else `<main>` with `<h1>{t('patientDetail.title', { code: identifier })}</h1>`, a `Card` with `<p>{t('patientDetail.placeholder')}</p>` and `<Link to="/patients">{t('nav.backToPatients')}</Link>`. Show the code only as React text (never `dangerouslySetInnerHTML`); no backend call. Depends on T003, T005, T007 (AC1, FR-003, FR-004) (frontend-dev)

### Auth and routes

- [X] T010 [TS-13] Edit `frontend/src/auth/AuthContext.jsx` (research R6, data-model "Auth state"): add `const [loggedOut, setLoggedOut] = useState(false)`; `signOut` sets it `true`; `signIn` (on success) and the `onUnauthorized` handler set it `false`; add `loggedOut` to the context value and the `useMemo` dependencies; update the header comment to list `loggedOut`. Nothing else changes (AC6, FR-008) (frontend-dev)
- [X] T011 [TS-13] Rewrite `frontend/src/auth/RequireAuth.jsx` as a layout route (research R3): no `children` prop and no `LoginPage` import; `const { user, loggedOut } = useAuth()`, `const location = useLocation()`; if `user` return `<Outlet />`; otherwise return `<Navigate to="/login" replace state={loggedOut ? undefined : { from: location.pathname }} />`. Header comment: "Guard for clinical pages (TS-06, routes from TS-13): put protected <Route>s inside <Route element={<RequireAuth />}>. Signed out → /login, remembering the page unless the user logged out." Depends on T010 (AC3, AC6, FR-005) (frontend-dev)
- [X] T012 [TS-13] Edit `frontend/src/pages/login/LoginPage.jsx` (research R5): import `Navigate`, `useLocation` from `react-router` and `returnPath` from `../../auth/returnPath.js`; read `user` from `useAuth()` too; call every hook first (keep hook order), then `if (user) return <Navigate to={returnPath(location.state)} replace />` before the form markup. Keep the form, `signIn`, errors and the "session expired" message unchanged; update the header comment ("Login page at /login (TS-06, TS-13)…"). Depends on T004 (AC4, AC5, FR-006, FR-007) (frontend-dev)
- [X] T013 [TS-13] Edit `frontend/src/components/AppShell.jsx`: import `useNavigate` from `react-router`; the sign-out button's `onClick` calls `signOut()` then `navigate('/login', { replace: true })`, so logout ends on `/login` from any page, public or protected. Nothing else changes (AC6, FR-008) (frontend-dev)
- [X] T014 [TS-13] Rewrite `frontend/src/App.jsx` (plan "Key design points" 1, [contracts/routes.md](contracts/routes.md)): keep `LanguageProvider` → `AuthProvider` → `AppShell`; inside it `<Routes>` with, in this order: `<Route path="/" element={<Navigate to="/patients" replace />} />`; `<Route path="/login" element={<LoginPage />} />`; `<Route element={<RequireAuth />}>` containing `<Route path="/patients" element={<PatientListPage />} />` and `<Route path="/patients/:identifier" element={<PatientDetailPage />} />` plus the comment `{/* Functional stories: add protected pages here, e.g. /patients/new (US-01) */}`; `<Route path="*" element={<NotFoundPage />} />`. All imports from `react-router`. No `BrowserRouter` here. Update the header comment. Depends on T007, T008, T009, T011, T012 (AC1–AC3, AC7, AC8, FR-002, FR-009, FR-014) (frontend-dev)
- [X] T015 [TS-13] Edit `frontend/src/main.jsx`: wrap `<App />` in `<BrowserRouter>` imported from `react-router`; keep the CSS imports and the "No StrictMode" comment. Then run `npm run build` (must pass) and `npm run dev` for a quick smoke check of `/` → `/login`. Depends on T014 (research R2) (frontend-dev)

### Docs by frontend-dev

- [X] T016 [P] [TS-13] Edit `frontend/README.md`: replace the "start page" sentence in the intro with the page list; add a section "Pages and addresses" with the address table from [contracts/routes.md](contracts/routes.md), how to add a protected page (one `<Route>` line inside the `<RequireAuth>` group in `App.jsx`, with the snippet from the contract) and a public page (outside the group), that a fixed address such as `/patients/new` wins over `/patients/:identifier` by react-router's route ranking (US-01 verifies it with its own test), that only the patient code may appear in an address, that no page path may start with `/api` or equal `/health` (TS-11), that links use `<Link>` from `react-router`, and that the global link style makes links standalone 44px controls (an inline link inside running text needs its own rule). Depends on T014 (AC11, FR-017, SC-004) (frontend-dev)
- [X] T017 [P] [TS-13] Edit `docs/GLOSSARY.md`: add rows for **patient list** ("Lista de pacientes", page at `/patients`), **patient detail** ("Detalle del paciente", page at `/patients/:identifier`), **not-found page** ("Página no encontrada") and **page address** (route; only the patient code may appear in one; "Avoid: URL in UI text"), with sources `translations.js` and TS-13; follow the existing table format (AC13, FR-017, D-40) (frontend-dev)

### Tests

- [X] T018 [TS-13] Create `frontend/src/testing/renderApp.jsx` (named export `renderApp(entries = ['/'], index)`; research R9): renders `<MemoryRouter initialEntries={entries} initialIndex={index ?? entries.length - 1}><App /><LocationProbe /></MemoryRouter>` with React Testing Library and returns its result. `LocationProbe` (same file) renders `<output data-testid="location">{location.pathname}</output>` and a hidden test-only `<button data-testid="go-back" onClick={() => navigate(-1)} />`. Also export `currentPath()` = `screen.getByTestId('location').textContent`. Synthetic data only. Depends on T014 (qa-tester)
- [X] T019 [TS-13] Update existing tests to the router, changing assertions **only** where the old in-place login page became a redirect (AC12): in `frontend/src/App.test.jsx`, `frontend/src/i18n/language.test.jsx`, `frontend/src/auth/auth.test.jsx` and `frontend/src/pages/login/LoginPage.test.jsx`, replace `render(<App />)` with `renderApp(['/patients'])` (signed-in tests) or `renderApp(['/login'])` / `renderApp(['/patients'])` (signed-out tests; the latter must end on `/login`). In `auth.test.jsx`, add `currentPath()` checks: logout ends on `/login`; a rejected stored session ends on `/login` with the "session expired" text. Rename the `App.test.jsx` describe to "Patient list page: backend status" and update its header comment. Run `npm test`: all 221 pass. Depends on T015, T018 (qa-tester)
- [X] T020 [P] [TS-13] Create `frontend/src/utils/patientCode.test.js` (FR-003, research R7): `true` for `PAT-001`, `A`, `123`, `-`, a 20-character code; `false` for `pat-001`, `PAT 001`, `PAT_001`, `<script>`, `''`, a 21-character code, `PAT-001\n`, `undefined`, `null`, `1`, `{}`. Header comment cites TS-13 FR-003. Depends on T003 (qa-tester)
- [X] T021 [P] [TS-13] Create `frontend/src/auth/returnPath.test.js` (AC4, FR-006, research R4): returns `/patients/PAT-003` and `/patients` for those `from` values; returns `/patients` for `undefined`, `null`, `{}`, `{ from: 5 }`, `{ from: '' }`, `{ from: 'patients' }`, `{ from: 'https://evil.example' }`, `{ from: '//evil.example' }`, `{ from: '/\\evil.example' }`, `{ from: '/login' }`, `{ from: '/login/x' }`. Depends on T004 (qa-tester)
- [X] T022 [TS-13] Create `frontend/src/App.routes.test.jsx` (FR-015, SC-001, SC-003) using `renderApp`, `currentPath()`, `stubBackend`, `signInForTest`, `resetSession` from `src/testing/`. One `it` per row, each naming its AC:
  - AC1: signed in `/patients` shows "Pacientes" and the placeholder text; signed in `/patients/PAT-001` shows "Paciente PAT-001" and the placeholder, and the page shows no other patient data.
  - AC2: `/` signed in ends on `/patients`; `/` signed out ends on `/login`.
  - AC3: signed out `/patients` and `/patients/PAT-001` end on `/login`, show the login heading, and `queryByText('Pacientes')` / `queryByText('Paciente PAT-001')` / `queryByText('API: funcionando')` are null; `/health` was never fetched.
  - AC4: signed out `/patients/PAT-003`, submit the login form (stubbed login and `/me` succeed) → ends on `/patients/PAT-003`; signed out `/login` directly, sign in → ends on `/patients`.
  - AC5: signed in `/login` ends on `/patients`; no login form (`queryByLabelText('Usuario')` null).
  - AC6: signed in on `/patients/PAT-002` with `/me` answering 401 → ends on `/login` with "Tu sesión ha terminado. Inicia sesión de nuevo."; sign in again → ends on `/patients/PAT-002`. Logout from `/patients/PAT-002` → `/login` with no expired message; sign in → `/patients`. Logout from the not-found page (`/abc`) → `/login`.
  - AC7: `/abc`, `/patients/PAT-001/extra`, `/login/x`, `/api/patients`, `/health`, `/patients/pat-001`, `/patients/PAT%20001` (signed in) show "Página no encontrada" and a link "Volver a la lista de pacientes" with `href` `/patients`; `/abc` signed out also shows it; nothing throws.
  - Edge case: `/patients/` and `/patients/PAT-001/` show the same pages as without the slash.
  - AC8: on `/login`, `/patients`, `/patients/PAT-001` and `/abc` the disclaimer (`role="note"`) and the ES/EN buttons are present; the user block (`role="group"` named "Sesión iniciada") is present only when signed in.
  - AC9: on `/patients`, `/patients/PAT-001` and `/abc`, click "EN" (English button) → "Patients" and "The patient list will be shown here." / "Patient PAT-001" / "Page not found", "Back to the patient list", and `currentPath()` unchanged.
  - AC10: `renderApp(['/patients', '/patients/PAT-001'])` signed in, click the detail page's back link → `/patients`; then start again on the detail page, click `go-back` → `/patients`, still signed in (user name visible).
  - Edge case (not AC11): signed in, `/patients/new` shows the not-found page today, because `new` is not a valid patient code. This does **not** verify that a fixed route wins over `/patients/:identifier`; that relies on react-router's route ranking and is verified in US-01 (spec AC11, FR-014, [contracts/routes.md](contracts/routes.md)).
  Depends on T018, T019 (qa-tester)
- [X] T023 [TS-13] Edit `frontend/src/styles/contrast.test.js`: add the text pair `{ name: 'primary on bg (links)', fg: 'primary', bg: 'bg' }` to the ≥ 4.5:1 list; add a static check that `global.css` has an `a` rule with `color: var(--color-primary)` and `min-height: var(--size-target)` (whitespace-tolerant regex). Then run the automated checks from [quickstart.md](quickstart.md) in `frontend/`: `npm test` (all pass: 221 baseline plus new tests, no backend, no network), `npm run build`, `npm audit --audit-level=high`, `git diff --stat backend/ .github/` (empty), `grep -rn "react-router-dom\|pages/start\|StartPage" frontend/src` (empty). Report the counts next to the T001 baseline. If a check fails, fix it in the owning task. Depends on T006, T016–T022 (qa-tester)

### Checks and review

- [X] T024 [TS-13] **Manual checks (human).** With the backend and `npm run dev` running, follow the 10 steps in [quickstart.md](quickstart.md) "Manual check" (redirects, return-to after sign-in and after expiry, logout, browser Back/Forward, F5 refresh on `/patients/PAT-003`, not-found addresses, ES/EN on every page, keyboard pass with visible focus and links at least 44px tall). Also have a teammate follow only `frontend/README.md` to add a dummy protected page and time it (SC-004), then remove it. Record the results in the PR description (SC-002, SC-005). Depends on T023 (human)
- [X] T025 [TS-13] Review the story (read-only, change no code). Check: every clinical route is inside the `<RequireAuth>` group and no clinical content renders before the redirect; `returnPath` blocks outside, `//`, `/\` and `/login` targets (no open redirect); the return-to page is kept only in router state (no `?next=`, no `localStorage` / `sessionStorage` writes added); logout leaves no return-to page; `identifier` is validated by `isPatientCode` and rendered only as text (no `dangerouslySetInnerHTML`, no `style=`); no patient data other than the code in any address or link; no page path under `/api` or equal to `/health`; `react-router` is the only new dependency, pinned in the lock file, and `npm audit --audit-level=high` passes; backend unchanged. Return the findings as a report; the orchestrator logs them (constitution VI, VIII) (security-reviewer)

---

## Phase 4: Polish

- [X] T026 [P] Edit `docs/DECISIONS.md`: add **D-45** after D-43 (today's date, Status "Active"): frontend routing with **`react-router` 8.5.2** (or the version T002 installed), single package, declarative mode (`BrowserRouter` in `main.jsx`, `<Routes>` in `App.jsx`), no data router or loaders; page addresses `/login`, `/patients`, `/patients/:identifier`, `/` → `/patients`, not-found; `<RequireAuth>` is a layout route that redirects to `/login` and keeps the return-to page only in router navigation state, accepting only internal paths; patient code checked with `^[A-Z0-9-]{1,20}$`; no page path under `/api` or equal to `/health` (TS-11 agreement). **Supersedes the "no router" part of D-33** and the "a router library" rejection in D-35; **D-35 otherwise stays** (clinical screens inside `<RequireAuth>`), its behavior changes from rendering the login page in place to redirecting. Reasons and rejected options as in [research.md](research.md) R1–R4 and R6 (hand-written router, `react-router-dom`, data router, `?next=`, `sessionStorage`). Also add "Superseded in part by D-45" to the Status of D-33 (orchestrator)
- [X] T027 [P] Edit `docs/PROJECT_STATUS.md` and `docs/BACKLOG.md`: mark TS-13 done and link `specs/013-client-routing/spec.md` in the backlog's Spec column; update "Last updated", "Current step" (add TS-13 ✅) and "Next step" (TS-11, or as the team decides); add a "Notes for later stories" bullet: US-01 adds `/patients/new` inside the `<RequireAuth>` group; US-02 replaces `PatientListPage` (and decides whether to keep the `/health` block); US-05 replaces `PatientDetailPage` and reads `useParams().identifier`; TS-11 must serve `index.html` for every non-API path and re-check deep-link refresh on Azure (AC13, FR-017) (orchestrator)
- [X] T028 Check `specs/013-client-routing/agent-log.csv`: every task has `assigned`, `started` and `done` rows from its agent; log each T025 finding with `-Action finding` on the security-reviewer's behalf (that agent has no shell). Prepare the PR record: link to `specs/013-client-routing/`, which agent did what, the T001 and T023 test counts, the `react-router` version and audit result, the T024 manual results and the security-reviewer's findings with how each was resolved (constitution workflow step 6) (orchestrator)

---

## Dependencies & Execution Order

- **Setup**: T001 before any edit; T002 depends on T001.
- **Helpers, texts, styles**: T003, T004, T005, T006 depend on T002 only and run in parallel.
- **Pages**: T007 and T008 depend on T005 (run in parallel); T009 depends on T003, T005, T007.
- **Auth and routes**: T010 → T011. T012 depends on T004. T013 has no code dependency after T002. T014 depends on T007, T008, T009, T011, T012 (and T013 for a working logout). T015 depends on T014.
- **Docs by frontend-dev**: T016 depends on T014; T017 has no code dependency. Both can run in parallel with the tests.
- **Tests**: T018 depends on T014. T019 depends on T015 and T018. T020 depends on T003, T021 on T004 (both can start early, in parallel). T022 depends on T018 and T019. T023 depends on T006 and T016–T022.
- **Checks and review**: T024 (human) depends on T023. T025 depends on T023 and can run while T024 is done by hand.
- **Polish**: T026 and T027 can run after T023; T028 runs last.
- **Story dependencies**: TS-06 and TS-12 (merged), per `docs/BACKLOG.md`. No functional story code is touched.

## Parallel Example

```text
# Round 1: T001 (qa-tester baseline) → T002 (frontend-dev dependency)
# Round 2 (frontend-dev):  T003, T004, T005, T006 in parallel; T010; T013
# Round 3 (frontend-dev):  T007 + T008 in parallel → T009; T011; T012
# Round 4 (frontend-dev):  T014 → T015; then T016 + T017 in parallel
# Round 5 (qa-tester):     T020 + T021 (any time after T003/T004); T018 → T019 → T022 → T023
# Round 6:                 T024 (human) and T025 (security-reviewer) → T026, T027 → T028 (orchestrator)
```

## Implementation Strategy

TS-13 is the whole MVP, built so each step stays green:

1. Baseline and dependency (T001–T002): tests and build still pass with `react-router` installed and unused.
2. Helpers, texts and link style (T003–T006), then the three pages (T007–T009).
3. Auth changes and the route table (T010–T015): from here the app routes by address.
4. README and glossary (T016–T017), then tests: helper, updated existing tests, route tests, checks (T018–T023).
5. Manual pass (T024), security review (T025), decision, status and PR record (T026–T028).

After T028, commit (`TS-13: Client routing`), push and open the PR. CI (TS-09) runs the tests, build and dependency check; the PR includes the agent activity log and the T024 manual results.

## Notes

- The orchestrator assigns each task to its agent and logs `assigned` / `started` / `done` rows (see `docs/agents.md`).
- Testing runs after implementation, as the project template orders it (qa-tester, then security-reviewer).
- Do not add anything not listed here (Principle XII): no data router, loaders, lazy routes, navigation menu, breadcrumbs, role checks, `?next=` parameter, storage for the return-to page, backend call from the placeholders, or `/patients/new` route (US-01 adds it).
