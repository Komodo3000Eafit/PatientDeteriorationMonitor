# Implementation Plan: Client Routing

**Branch**: `013-client-routing` | **Date**: 2026-11-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/013-client-routing/spec.md`

## Summary

Give the React app real page addresses (`/login`, `/patients`, `/patients/:identifier`, `/` → `/patients`, and a not-found page) with `react-router` 8.5.2 in declarative mode. `<RequireAuth>` becomes a layout route that redirects signed-out users to `/login` and remembers the page they asked for in router navigation state; `LoginPage` sends a signed-in user to that page or to `/patients`. The old start page becomes the patient list placeholder; the detail page shows the patient code after a format check. Frontend only; the backend, workflows and API paths do not change.

## Technical Context

**Language/Version**: JavaScript (ES modules), React 19.3, Vite 8 (D-33); Node.js 26 locally and in CI

**Primary Dependencies**: existing React + react-dom; **new**: `react-router` 8.5.2 (single package, declarative mode, research R1–R2)

**Storage**: none new. Return-to page lives in router navigation state (memory). Session stays in `sessionStorage['pdm.session']` (D-35, unchanged)

**Testing**: Vitest + jsdom + React Testing Library; `MemoryRouter` with `initialEntries` through one helper `src/testing/renderApp.jsx` (research R9). Baseline: 14 files, 221 tests passing

**Target Platform**: modern browsers; local dev server (Vite) now, one Azure App Service after TS-11 (D-39)

**Project Type**: web application (backend/ + frontend/); this story touches `frontend/` and docs only

**Performance Goals**: page changes without a full reload; no extra backend calls (patient list keeps exactly one `/health` call per load, D-30)

**Constraints**: one new runtime dependency only; no raw colors (TS-12 scan) and contrast test green; no page path under `/api` or equal to `/health` (TS-11 agreement); no patient data in addresses except the patient code; `npm audit --audit-level=high` passes

**Scale/Scope**: 5 routes, 3 new small pages, 2 small helpers, 1 test helper, about 25 new tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] I. Spec-driven and traceable: each change maps to AC1–AC13 (see Structure below)
- [x] II. Small Scrum story: one technical story (TS-13); routing setup plus three placeholder pages
- [x] III. Independence: depends only on TS-06 and TS-12 (both merged), as in `docs/BACKLOG.md`; it creates the route table the functional stories register into, and changes no functional story code
- [x] IV. Multi-agent: frontend-dev builds, qa-tester writes and runs tests, security-reviewer reviews the guard and redirects, orchestrator logs in `agent-log.csv`
- [x] V. Clinical logic: none added; the patient code check is a format check only; triage levels and scoring untouched
- [x] VI. Data privacy: only synthetic codes (`PAT-001`…) in addresses; no other patient data; no secrets
- [x] VII. Tests: security path covered (guard, redirects, return-to validation, logout vs expiry) by automated tests
- [x] VIII. Security baseline: authentication on every clinical page through one guard; return-to accepts only internal paths (no open redirect); the URL parameter is validated and rendered as text
- [x] IX. Deployable at low cost: no new service; relies on TS-11's `index.html` fallback on the same App Service
- [x] X. Stack: React frontend; `react-router` is the standard React router (D-44)
- [x] XI. Language: English code and docs; new UI texts in Spanish and English in `translations.js`; new terms added to `docs/GLOSSARY.md` in this PR
- [x] XII. Simplicity: declarative routes, no data router or loaders, no extra wrappers; two tiny pure helpers only where a rule must be tested; the new dependency and the `loggedOut` field are justified in Complexity Tracking

**Post-design re-check (after Phase 1)**: still all pass. The added complexity (the `react-router` dependency and the `loggedOut` auth field) is justified in Complexity Tracking, as Principle XII requires.

## Project Structure

### Documentation (this feature)

```text
specs/013-client-routing/
├── spec.md
├── plan.md              # This file
├── research.md          # R1–R9 decisions
├── data-model.md        # Routes, return-to state, auth state transitions
├── quickstart.md        # Automated and manual validation
├── contracts/
│   └── routes.md        # Address table and promises to US-01/02/05 and TS-11
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
frontend/
├── package.json, package-lock.json      # + react-router ^8.5.2 (AC12, FR-001)
├── README.md                            # Page addresses + how to add a page (AC11, FR-017)
└── src/
    ├── main.jsx                         # Wrap <App /> in <BrowserRouter> (R2)
    ├── App.jsx                          # <Routes>: /, /login, RequireAuth group, * (AC1–AC3, AC7, FR-002, FR-014)
    ├── App.routes.test.jsx              # NEW: every route and redirect (FR-015)
    ├── App.test.jsx                     # Health tests now at /patients via renderApp
    ├── auth/
    │   ├── AuthContext.jsx              # + loggedOut flag (R6, AC6)
    │   ├── RequireAuth.jsx              # Layout route: <Outlet/> or <Navigate to="/login" state={{from}}/> (R3)
    │   ├── returnPath.js                # NEW: safe return-to path (R4, AC4)
    │   ├── returnPath.test.js           # NEW
    │   └── auth.test.jsx                # Updated for redirects (AC12)
    ├── components/
    │   └── AppShell.jsx                 # Logout → signOut() + navigate('/login', replace) (AC6)
    ├── i18n/
    │   ├── translations.js              # New keys es/en (R8, AC9)
    │   └── language.test.jsx            # Uses renderApp
    ├── pages/
    │   ├── login/LoginPage.jsx          # Signed in → <Navigate to={returnPath(state)} replace/> (R5, AC4, AC5)
    │   ├── login/LoginPage.test.jsx     # Uses renderApp
    │   ├── patient-list/PatientListPage.jsx    # NEW: placeholder + old StartPage health check (FR-004)
    │   ├── patient-detail/PatientDetailPage.jsx # NEW: patient code or NotFoundPage (FR-003, FR-004)
    │   ├── not-found/NotFoundPage.jsx   # NEW: message + link to /patients (FR-010)
    │   └── start/                       # DELETED
    ├── styles/
    │   ├── global.css                   # Link style: token color, 44px target (R8)
    │   └── contrast.test.js             # + text pair "primary on bg"
    ├── testing/
    │   └── renderApp.jsx                # NEW: MemoryRouter + location probe (R9)
    └── utils/
        ├── patientCode.js               # NEW: isPatientCode (R7)
        └── patientCode.test.js          # NEW

docs/
├── DECISIONS.md        # D-44 (AC13)
├── GLOSSARY.md         # patient list, patient detail, not-found page, page address (AC13)
├── BACKLOG.md          # TS-13 ✅ + spec link
└── PROJECT_STATUS.md   # TS-13 done
```

**Structure Decision**: web application layout (`backend/` + `frontend/`); only `frontend/` and `docs/` change. Pages follow the TS-12 `pages/<name>/` convention; helpers go in existing folders (`auth/`, `utils/`, `testing/`). No new top-level folder.

### Key design points

1. **Route table** (`App.jsx`, inside `LanguageProvider` → `AuthProvider` → `AppShell`):
   `/` → `<Navigate to="/patients" replace />`; `/login` → `LoginPage`; `<Route element={<RequireAuth />}>` containing `/patients` and `/patients/:identifier`; `*` → `NotFoundPage`. See [contracts/routes.md](contracts/routes.md).
2. **Guard** (R3): signed out → `<Navigate to="/login" replace state={loggedOut ? undefined : { from: location.pathname }} />`; nothing clinical is rendered.
3. **Login redirect** (R5): `LoginPage` returns `<Navigate to={returnPath(location.state)} replace />` when `user` is set; the form and `signIn` are unchanged.
4. **Expiry vs logout** (R6): expiry uses the existing 401 path; logout sets `loggedOut` and navigates to `/login`.
5. **Detail page** (R7): `isPatientCode(identifier)` false → render `NotFoundPage` in place.
6. **D-44** (DECISIONS): adds `react-router` 8.5.2 (declarative mode, no data router); supersedes the "no router" part of D-33; D-35 stays (clinical screens inside `<RequireAuth>`), its behavior changes from rendering the login page in place to redirecting to `/login` with an in-memory return-to page; rejected alternatives from R1, R4.

### Agents

| Agent | Work |
|---|---|
| orchestrator | Runs `/speckit-implement`, assigns tasks, keeps `agent-log.csv`, updates docs |
| frontend-dev | Dependency, routes, guard, pages, texts, styles, README |
| qa-tester | `renderApp` helper, route tests, helper unit tests, updates existing tests, runs `npm test` / build / audit |
| security-reviewer | Reviews guard coverage, return-to validation (open redirect), URL parameter handling, dependency |

## Complexity Tracking

| Added complexity | Why Needed | Simpler Alternative Rejected Because |
|------------------|------------|-------------------------------------|
| New runtime dependency `react-router` 8.5.2 (routing framework, research R1) | FR-001 asks for one routing library; the story needs address → page matching, redirects (`<Navigate>`), a guard for a group of routes (`<Outlet>`), browser history (back, forward, refresh) and a test router (`MemoryRouter`) so every route and redirect can be tested without a browser | A hand-written router on `window.history` + `popstate` would re-implement path matching, route ranking (`/patients/new` vs `/patients/:identifier`), redirects and a test harness, with more code to write and test (Principle XII); `react-router-dom` only re-exports `react-router` in v7+; a data router with loaders adds concepts the spec does not need (R2) |
| One new auth state field `loggedOut` in `AuthContext` (research R6) | FR-008: after logout the user must land on `/login` with **no** remembered page, while after expiry the page **is** remembered. Router navigations can render separately from the auth update, so the guard needs to know why the user is signed out | Relying on navigate-then-sign-out order alone is not guaranteed by React rendering and could remember the page after logout; clearing the state inside `LoginPage` cannot tell a logout from a first visit |
