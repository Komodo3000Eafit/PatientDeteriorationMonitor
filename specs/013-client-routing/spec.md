# Feature Specification: Client Routing

**Feature Branch**: `013-client-routing`

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "TS-13 Client routing. Use feature directory 013-client-routing (not the next auto number: 011 is reserved for TS-11). Source: docs/BACKLOG.md row TS-13. Depends on TS-06 (auth) and TS-12 (UI foundation), both merged. Goal: the React app gets real page URLs, so the functional stories (US-01..US-05) only add a page and register its route in App.jsx. Scope: add react-router as the routing dependency, with a docs/DECISIONS.md entry (new dependency, version, why); routes /login, /patients, /patients/:identifier (identifier is the synthetic patient code, e.g. PAT-001, allowed in the URL; no other patient data in URLs); "/" redirects to /patients; /patients and /patients/:identifier are placeholder pages until US-02 and US-05 replace them (texts via i18n, Spanish default + English); a not-found page for unknown paths (i18n texts); <RequireAuth> protects every clinical route; a signed-out user is sent to /login and, after signing in, returns to the page they first asked for; a signed-in user who opens /login goes to /patients; session expiry (TS-06) still ends on /login with the existing 'session expired' message; AppShell (disclaimer, user block, language switch) stays on every page, including /login and not-found; reuse TS-12 components, tokens and pages/ folder structure; no raw colors (the noRawColors and contrast tests must keep passing). Out of scope: any backend change, API paths and the production index.html fallback (TS-11; agreed: the API moves under /api except /health and browser pages stay at the root; this story must not use /api for any page path); real patient list/detail content (US-02, US-05) and patient registration (US-01; it will add /patients/new, which must not be captured by /patients/:identifier). Acceptance: frontend tests cover each route, the redirects (signed out → /login → back to the original page; '/' → /patients; signed-in /login → /patients), not-found, and that existing tests still pass; npm test, npm run build and npm audit --audit-level=high pass. Deep-link refresh on Azure is checked after TS-11 is merged. Use docs/GLOSSARY.md terms."

## Clarifications

### Session 2026-11-19

- Q: Where is the page a signed-out user asked for remembered until they sign in? → A: Only in the app's in-memory navigation state for the current visit (no `?next=` in the address, no browser storage); lost if the login page is reloaded, then the user lands on `/patients`.
- Q: What happens to the current start page (welcome text and backend `/health` result)? → A: It becomes the `/patients` placeholder, keeping the health check until US-02 replaces it; no separate start page remains.
- Q: After the session expires on a clinical page and the user signs in again, where do they land? → A: Back on the page they were on (same in-memory mechanism as the return-to page); after logout they land on `/patients`.

## User Story *(mandatory)*

**Story ID**: TS-13

**Type**: Technical

**Story**: As a team member building a functional story, I want the app to have real page addresses (login, patient list, patient detail, not found) with sign-in protection already in place, so that my story only adds its page and registers its address, and clinicians can bookmark, share inside the team, refresh and use the browser's back and forward buttons.

**Depends on**: TS-06 (authentication), TS-12 (UI foundation). Both merged.

### Acceptance Criteria

1. **AC1 — Page addresses**: **Given** a signed-in user, **When** they open `/patients`, **Then** they see the patient list placeholder page; **and When** they open `/patients/PAT-001`, **Then** they see the patient detail placeholder page showing the patient code `PAT-001` and no other patient data.
2. **AC2 — Root address**: **Given** any user, **When** they open `/`, **Then** the address changes to `/patients` (a replace, so the back button does not return to `/`), and the normal sign-in protection of `/patients` applies.
3. **AC3 — Signed-out user is sent to the login page**: **Given** a signed-out user, **When** they open any clinical page (`/patients` or `/patients/<patient code>`), **Then** the address changes to `/login`, the login page is shown, and no clinical page content is shown, not even for an instant.
4. **AC4 — Return to the first page asked for**: **Given** a signed-out user who opened `/patients/PAT-003` and was sent to `/login`, **When** they sign in successfully, **Then** they land on `/patients/PAT-003`; **and Given** a user who opened `/login` directly, **When** they sign in, **Then** they land on `/patients`.
5. **AC5 — Signed-in user opens the login page**: **Given** a signed-in user, **When** they open `/login`, **Then** the address changes to `/patients` and the login form is not shown.
6. **AC6 — Session expiry and logout**: **Given** a signed-in user on a clinical page, **When** the session expires (a request answered 401, TS-06), **Then** they end on `/login` with the existing "session expired" message, and after signing in again they return to the page they were on; **and When** a user logs out, **Then** they end on `/login` without the "session expired" message.
7. **AC7 — Not-found page**: **Given** any user, signed in or not, **When** they open an address the app does not know (for example `/abc`, `/patients/PAT-001/extra`, or a patient code with characters a patient code cannot have), **Then** a not-found page is shown with a message and a link to the patient list, and nothing crashes.
8. **AC8 — Page frame on every page**: **Given** any page (login, patient list, patient detail, not-found), **When** it is shown, **Then** the shared page frame from TS-05/TS-06 is present: the pinned disclaimer, the user block (only when signed in) and the ES/EN switch.
9. **AC9 — Language**: **Given** the placeholder pages and the not-found page, **When** the language is switched between Spanish (default) and English, **Then** every text changes without a reload and the address does not change; every new text exists in `translations.js` in both languages.
10. **AC10 — Browser navigation**: **Given** a signed-in user who moved from the patient list to a patient detail page with an in-app link, **When** they press the browser's back button, **Then** the patient list is shown again without reloading the whole app or losing the session; **and When** they refresh the page, **Then** the same page is shown again (in local development; on Azure this is checked after TS-11).
11. **AC11 — Ready for the functional stories**: **Given** a teammate starting US-01, US-02 or US-05, **When** they read `frontend/README.md`, **Then** they find the list of page addresses and how to add a page and register its address in `App.jsx` as a protected or public page in a few lines, including the note that a fixed address registered later, such as `/patients/new` (US-01), wins over `/patients/:identifier` by react-router's documented route ranking (verified in US-01 when it adds `/patients/new`, not in this story).
12. **AC12 — Nothing else breaks**: **Given** the finished story, **When** `npm test`, `npm run build` and `npm audit --audit-level=high` run in `frontend/`, **Then** all pass with no network and no backend; the raw-color scan and the contrast test from TS-12 still pass; every existing test still passes (tests may change how the app is rendered, inside a router; assertions change only where the old "login page inside the protected screen" behavior is replaced by a redirect); and the backend is unchanged.
13. **AC13 — Documentation**: **Given** the merged story, **When** a teammate reads the docs, **Then** `docs/DECISIONS.md` has an entry for the routing dependency (name, version, why, alternatives rejected), `docs/GLOSSARY.md` has any new term introduced here, `docs/BACKLOG.md` and `docs/PROJECT_STATUS.md` show TS-13 as done.

### Out of Scope

- Any backend change, including API paths and the production fallback that serves `index.html` for page addresses (TS-11). Agreed with TS-11: the API moves under `/api` (except `/health`) and browser pages stay at the root; this story uses no page address starting with `/api` or equal to `/health`.
- Real patient list and patient detail content (US-02, US-05) and patient registration (US-01, which will add `/patients/new`).
- Checking whether a patient code exists in the database: the detail placeholder only shows the code from the address.
- Role-based access (doctor vs nurse pages), navigation menus, breadcrumbs, page transitions or loading screens.
- Keeping the "return to" page across a full reload of the login page or across browser tabs.
- Deep-link refresh on the deployed Azure site: checked after TS-11 is merged.

### Edge Cases

- **Trailing slash** (`/patients/`, `/patients/PAT-001/`): treated as the same page as without the slash.
- **Unknown nested address** (`/patients/PAT-001/extra`, `/login/x`): not-found page.
- **Patient code in lower case or with other characters** (`/patients/pat-001`, `/patients/PAT 001`, `/patients/<script>`): not a valid patient code (upper-case letters, digits and `-` only, 1–20 characters (database limit), GLOSSARY), so the not-found page is shown; the address text is never shown as markup.
- **Address that looks like the API** (`/api/...`, `/health`) opened in the browser during local development: shown as not-found by the app; the app never treats them as pages.
- **"Return to" target that is not an app page** (an outside site, `//host`, the login page itself): ignored, the user lands on `/patients` (no open redirect).
- **Signed-out user opens the not-found page**: the not-found page is shown (it holds no clinical data); its link to the patient list then leads to `/login`.
- **Session stored but expired when a page is opened**: the first request answered 401 clears the session and the user ends on `/login` with the "session expired" message (TS-06 behavior).
- **Logout on a patient detail page, then sign in as another user**: lands on `/patients`, not on the previous user's page.
- **Language switch on any page**: the page and address stay the same.
- **Back button after logout**: shows `/login` again for clinical pages, never the old clinical content.
- **`/patients/new` registered later by US-01**: the fixed address wins over the patient-code address by react-router's route ranking; US-01 verifies it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The frontend MUST use one routing library (`react-router`) as the single way to map page addresses to pages; the exact version is chosen in the plan and recorded with its reason in `docs/DECISIONS.md`. No other new runtime dependency MAY be added.
- **FR-002**: The app MUST offer exactly these page addresses: `/login` (public), `/patients` and `/patients/:identifier` (clinical, protected), `/` (redirects to `/patients`) and a catch-all not-found page for every other address.
- **FR-003**: The patient code in `/patients/:identifier` MUST be the only patient data in any page address (no names, vital signs, scores or internal `patient_id`). A value that is not a valid patient code (upper-case letters, digits and `-` only, 1–20 characters) MUST show the not-found page.
- **FR-004**: `/patients` and `/patients/:identifier` MUST show placeholder pages, written so that US-02 and US-05 can replace them without changing the routing. The patient list placeholder MUST take over the current start page's content (welcome text and backend `/health` result), and the start page MUST be removed. The detail placeholder MUST show the patient code from the address as plain text.
- **FR-005**: `<RequireAuth>` MUST protect every clinical page. A signed-out user who opens a clinical page MUST be redirected to `/login` before any clinical content is shown, and the page they asked for MUST be remembered only in the app's in-memory navigation state for the current visit (not in the address and not in browser storage).
- **FR-006**: After a successful sign-in, the user MUST land on the remembered page if it is a page of this app other than `/login`; otherwise on `/patients`.
- **FR-007**: A signed-in user who opens `/login` MUST be redirected to `/patients`.
- **FR-008**: When the session ends by expiry (401, TS-06) the user MUST end on `/login` with the existing "session expired" message and the current page remembered; when the user logs out they MUST end on `/login` without that message and without a remembered page.
- **FR-009**: The shared page frame (`AppShell`: disclaimer, user block when signed in, ES/EN switch) MUST surround every page, including `/login` and the not-found page.
- **FR-010**: The not-found page MUST show a short message and a link to `/patients`, and MUST be reachable signed in or not.
- **FR-011**: Every text added by this story (placeholder pages, not-found page, any link text) MUST be in `src/i18n/translations.js` in Spanish and English and used by key; switching language MUST NOT change the address.
- **FR-012**: New pages MUST live in `pages/` following the TS-12 structure and MUST use the TS-12 tokens and shared components (for example `Card`); no raw color MAY be added, and the raw-color scan and contrast test MUST keep passing.
- **FR-013**: No page address MAY start with `/api` or equal `/health`, so they never collide with backend paths (agreement with TS-11).
- **FR-014**: The page addresses MUST be registered in one place, `App.jsx`, so a functional story adds its page by adding one entry there (protected or public). A fixed address such as `/patients/new` takes priority over `/patients/:identifier` through react-router's documented route ranking (static segments rank above dynamic ones); this story adds no code or test for it, and US-01 verifies it when it registers `/patients/new`.
- **FR-015**: Frontend tests MUST cover: each page address; `/` → `/patients`; signed out → `/login` → back to the original page after sign-in; signed in `/login` → `/patients`; session expiry → `/login` with the message; logout → `/login`; the not-found page (unknown address, nested address, invalid patient code); the page frame on each page; and both languages for the new texts. Tests MUST run without a backend or network, and all existing tests MUST keep passing.
- **FR-016**: The backend MUST NOT change.
- **FR-017**: `frontend/README.md` MUST list the page addresses and explain how to add a page and register its address. `docs/DECISIONS.md` MUST gain the routing dependency entry, `docs/GLOSSARY.md` any new term (D-40), and `docs/BACKLOG.md` and `docs/PROJECT_STATUS.md` MUST show TS-13 as done.

### Key Entities *(include if feature involves data)*

- **Page address (route)**: a browser path the app knows, linked to one page and marked public or protected (clinical).
- **Patient code** (`identifier`): the synthetic code such as `PAT-001`; the only patient data allowed in a page address.
- **Return-to page**: the protected page a signed-out user asked for, remembered only for the current visit and used once after sign-in.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the page addresses and redirects listed in FR-002 to FR-010 are covered by automated frontend tests that pass with no backend and no network.
- **SC-002**: A signed-out user who opens a patient detail address reaches that same page right after signing in, in 1 sign-in, with no extra clicks.
- **SC-003**: 0 clinical page content is visible to a signed-out user at any address, verified by tests for every protected page.
- **SC-004**: A teammate adds a new protected page for a functional story by creating the page and adding one entry in `App.jsx`, in under 5 minutes, following only `frontend/README.md`.
- **SC-005**: Back, forward and refresh keep the user on the expected page with the session kept, in a manual check in local development recorded in the pull request (and on Azure after TS-11).
- **SC-006**: `npm test`, `npm run build` and `npm audit --audit-level=high` pass; exactly one runtime dependency is added; 0 raw colors are added (TS-12 scan passes).

## Assumptions

- The routing library is `react-router` (the current major line, which supports React 19); the plan picks the exact version and the routing style, and keeps it as plain as possible (Principle XII). Adding it supersedes the "no router" part of D-33 and the "router library" rejection in D-35; the rest of D-35 stays (clinical screens inside `<RequireAuth>`), and the new DECISIONS entry states that.
- The remembered "return to" page is kept in the app's navigation memory for the current visit, not in the address (no `?next=` parameter) and not in browser storage; it is lost if the login page is reloaded, and the user then lands on `/patients`. This keeps patient codes out of extra addresses and avoids open-redirect risk (confirmed in Clarifications).
- The current start page (TS-04/TS-05: welcome text and backend `/health` result) becomes the patient list placeholder, so the `/health` check still appears after sign-in; no separate start page remains (confirmed in Clarifications).
- The patient detail placeholder does not call the backend; a non-existent but valid-looking code (`PAT-999`) still shows the placeholder. US-05 decides how to show "patient not found".
- "Clinical page" means every page except `/login` and the not-found page.
- The sign-in, session and logout logic from TS-06 (`AuthContext`, `session.js`, `client.js`) keeps its behavior; only where the login page is shown changes (an address instead of being drawn inside the protected screen).
- The production fallback that serves `index.html` for page addresses is built in TS-11; until then, refresh on a deep address works in local development (the dev server already does this) and is checked on Azure after TS-11 is merged.
- The Spanish/English wording of the new texts is chosen in the plan following the glossary (for example "Pacientes" / "Patients", "Página no encontrada" / "Page not found").
