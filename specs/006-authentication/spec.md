# Feature Specification: Authentication

**Feature Branch**: `006-authentication`

**Created**: 2026-11-13

**Status**: Draft

**Input**: User description: "TS-06 — Authentication (technical story, depends on TS-03 and TS-04). As a clinician, I want to sign in with my own account before I can see any clinical data, so that patient information is only visible to authorized staff. Acceptance criteria: Demo users (at least one doctor and one nurse, synthetic names) can be created in the database with one documented command. Their passwords come from environment variables / backend/.env, never from committed files; only a password hash is stored (users.password_hash from TS-03). A login endpoint accepts username + password and, if correct, returns a short-lived access token (expiry configurable, sensible default such as 8 hours). Wrong username and wrong password give the same generic error, and no detail that helps guessing. A protected endpoint (e.g. GET /me returning username, full name and role) works only with a valid token; missing, invalid or expired tokens get 401. This is the pattern every later clinical endpoint will use. GET /health stays public. The token signing secret comes only from an environment variable (like DATABASE_URL); the backend refuses to start without it. No secret in code, logs or responses. Frontend: a login page inside the TS-05 page frame (banner and language switch), all texts translated ES/EN. After login the user sees the start page plus their name and role and a logout button; logout clears the session. Clinical screens in later stories must be reachable only when signed in. CORS from TS-04 is extended only as needed (e.g. POST and the Authorization header), still no wildcard and no cookies. Automated tests, no real database or network: password hashing and verification, login success and failure, protected endpoint with valid / missing / invalid / expired token, the startup check for the secret, and the frontend login, logout and error states in both languages. Existing tests keep passing. READMEs explain how to set the secret and demo passwords and how to create the demo users. A one-time manual check on Neon and in the browser is recorded in the PR. Out of scope: user registration, password reset, roles-based permissions beyond showing the role (later stories), account lockout and rate limiting (note for TS-10), deployment (TS-10/TS-11). Keep it as simple as possible (D-23). Note for the plan: on our laptops Windows Smart App Control blocks unknown compiled Python packages (D-31), so prefer pure-Python or standard-library options."

## Clarifications

### Session 2026-11-13

- All assumptions in this spec are accepted as written, including keeping the browser session in the tab's session storage (user, 2026-11-13).
- Q: How must existing tests behave once the signing secret is required at startup? → A: They keep passing: the backend tests set a dummy test secret, and the TS-04 `*` CORS startup subprocess test passes one to the subprocess too, so it still fails only because of `*` (FR-018).
- `/speckit-analyze` fixes (2026-11-13): the token lifetime is 1–1440 minutes (FR-005), and the TS-05 "banner cannot be dismissed" test may also expect the logout button (FR-018).
- Q: The TS-04/TS-05 frontend tests expect the `/health` status right after the app loads, but it is now shown only after sign-in. How do they keep passing? → A: They may be changed only so they start from a signed-in session (stored session plus a mocked `/me`); what they check stays the same (FR-018).

## User Story *(mandatory)*

**Story ID**: TS-06

**Type**: Technical

**Story**: As a clinician, I want to sign in with my own account before I can see any clinical data, so that patient information is only visible to authorized staff.

**Depends on**: TS-03, TS-04 (and the TS-05 page frame and texts, already merged)

### Acceptance Criteria

1. **AC1**: **Given** an empty `users` table and demo passwords set in the environment (or `backend/.env`), **When** a developer runs the one documented command from `backend/`, **Then** at least one doctor and one nurse account with synthetic names exist, each storing only a password hash (never the plain password); **and When** the command is run again, **Then** no duplicate accounts are created and the stored hashes match the current passwords; **and Given** a demo password is missing, **When** the command is run, **Then** it stops with a message naming the missing setting (never its value) and changes nothing.
2. **AC2**: **Given** a demo account, **When** a client sends its correct username and password to the login endpoint, **Then** the response contains an access token and its expiry, and the token is valid for the configured lifetime (default 8 hours).
3. **AC3**: **Given** the login endpoint, **When** a client sends an unknown username, or a known username with a wrong password, **Then** both answers are HTTP 401 with exactly the same generic body, and neither reveals whether the username exists; **and When** the username or password is empty, missing or too long, **Then** the request is rejected as invalid input without checking any account.
4. **AC4**: **Given** a valid token, **When** a client calls `GET /me`, **Then** it gets HTTP 200 with the account's username, full name and role and nothing else (no password hash, no token details); **and When** the token is missing, malformed, signed with another secret, tampered with, expired, or belongs to an account that no longer exists, **Then** it gets HTTP 401 with a generic body.
5. **AC5**: **Given** no token, **When** a client calls `GET /health`, **Then** it behaves exactly as in TS-02/TS-04 (public, HTTP 200, same fields).
6. **AC6**: **Given** the signing secret is not set, is blank or is too short, **When** the backend starts, **Then** it refuses to start with a fixed message that names the setting but never shows a value; **and** the secret never appears in the code, the repository, logs, error messages or responses.
7. **AC7**: **Given** a user who is not signed in, **When** they open the app, **Then** they see the login page inside the shared page frame (disclaimer banner and ES/EN switch), with all texts in the selected language, and no clinical content.
8. **AC8**: **Given** the login page, **When** the user signs in with correct credentials, **Then** they see the start page with their full name, their role (translated: Spanish "Médico" / "Enfermero(a)", English "Doctor" / "Nurse") and a logout button; **and When** the credentials are wrong, **Then** a generic "incorrect username or password" message is shown in the selected language and the password field is cleared; **and When** the server cannot be reached, **Then** a "cannot connect" message is shown instead.
9. **AC9**: **Given** a signed-in user, **When** they click logout, **Then** the stored session is cleared and the login page is shown; **and Given** a stored session whose token has expired or been rejected, **When** the app calls the backend and gets 401, **Then** the session is cleared and the login page is shown with a "session expired" message in the selected language.
10. **AC10**: **Given** the TS-04 CORS settings, **When** the frontend calls the login endpoint and `GET /me` from an allowed origin, **Then** the calls succeed; the allowed methods and headers are extended only to what these calls need (POST and the `Authorization` header), origins are still the explicit `CORS_ORIGINS` list with no wildcard, and credentials (cookies) are still not allowed.
11. **AC11**: **Given** a fresh clone with no database and no network, **When** a developer runs `python -m pytest` in `backend/` and `npm test` in `frontend/`, **Then** tests for password hashing and verification, login success and both failure cases, `/me` with valid / missing / invalid / expired token, the startup check for the secret, the demo-user command, and the frontend login, logout, wrong-credentials, unreachable and expired-session states in both languages pass, and all existing tests keep passing, including the TS-04 `*` CORS startup subprocess test (FR-018).
12. **AC12**: **Given** a teammate reading `backend/README.md` and `frontend/README.md`, **When** they set up the project, **Then** the READMEs explain how to set the signing secret, the token lifetime and the demo passwords (in `backend/.env`, never committed), how to create the demo users, the demo usernames, and how later clinical endpoints and screens require sign-in.

### Out of Scope

- User registration, password change or reset, account management screens.
- Permissions by role (doctor vs nurse can do the same things for now); the role is only shown.
- Account lockout, rate limiting and login attempt logging (noted for TS-10).
- Refresh tokens, "remember me", single sign-on, multi-factor authentication.
- Revoking tokens on the server at logout (see Assumptions).
- Cookies of any kind.
- Deployment and production secret setup (TS-10/TS-11); CI (TS-09).
- Clinical endpoints and screens themselves (later stories use the pattern defined here).

### Edge Cases

- Login with a username that differs only in letter case or has surrounding spaces: treated as a different (unknown) username, same generic error. Usernames are matched exactly.
- Login while the database is unavailable: a generic "service unavailable" error (not the wrong-credentials error and no internal detail); the frontend shows the "cannot connect" style message.
- A token signed for an account that was later deleted: 401 on `/me`.
- A token whose expiry has just passed: 401; no grace period.
- `Authorization` header with a different scheme (e.g. `Basic ...`) or an empty value: 401.
- The user switches language on the login page or after an error: all texts, including the error message already shown, change language without losing what was typed in the username field.
- The user double-clicks the sign-in button: only one login request is sent while one is in progress.
- The token lifetime setting is not a whole number of minutes from 1 to 1440: the backend refuses to start with a fixed message naming the setting. If it is unset or blank, 480 is used.
- The demo-user command is run without a database connection: it stops with a clear message and no secret or connection string is printed.
- A stored session in the browser that cannot be read (storage blocked or corrupted): treated as signed out, no error shown.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST store for each account only a salted, slow password hash in `users.password_hash` (TS-03 table); plain passwords MUST NOT be stored, logged or returned anywhere.
- **FR-002**: One documented command MUST create or update the demo accounts: at least one doctor and one nurse with synthetic usernames and full names fixed in the code, and passwords read only from environment settings (or `backend/.env`). Running it again MUST NOT create duplicates and MUST update the stored hash to the current password. If a password setting is missing or shorter than 8 characters, the command MUST stop before changing anything and name the setting, never its value.
- **FR-003**: A login endpoint MUST accept a username and a password, validate them (both required, non-empty, with maximum lengths matching the `users` table for the username and a reasonable limit such as 128 characters for the password), and on success return an access token, its type and its expiry.
- **FR-004**: Unknown username and wrong password MUST give the same HTTP 401 status and identical body, and the system SHOULD take a similar time in both cases so response time does not reveal whether a username exists.
- **FR-005**: Access tokens MUST be signed with a secret, carry the account identity and an expiry, and expire after a lifetime set by an environment setting, a whole number of minutes from 1 to 1440 (24 hours), defaulting to 8 hours (480 minutes).
- **FR-006**: A reusable protection check MUST reject requests with a missing, malformed, wrongly signed, tampered, expired or unknown-account token with HTTP 401 and a generic body. Every later clinical endpoint MUST use this same check.
- **FR-007**: `GET /me` MUST use the protection check and return only the signed-in account's username, full name and role.
- **FR-008**: `GET /health` MUST stay public and unchanged.
- **FR-009**: The signing secret MUST come only from an environment setting (or `backend/.env`, never committed). The backend MUST refuse to start if it is missing, blank or shorter than 32 characters, or if the token lifetime setting is invalid, with fixed messages that name the setting and never show a value. The secret MUST NOT appear in code, logs, errors or responses.
- **FR-010**: CORS MUST be extended only to what login and `/me` need (POST and the `Authorization` and content-type headers); origins MUST remain the explicit `CORS_ORIGINS` list, `*` still stops startup, and credentials stay disallowed.
- **FR-011**: The frontend MUST show a login page (username, password, sign-in button) inside the TS-05 `AppShell` whenever there is no valid session, and MUST NOT show the start page or any later clinical screen until signed in. All its texts MUST be added to the TS-05 text collections in Spanish and English.
- **FR-012**: After sign-in, the frontend MUST show the start page with the user's full name, translated role and a logout button, and MUST send the token with every backend call that needs it, never in the URL.
- **FR-013**: The frontend MUST keep the session for the browser tab (see Assumptions) and clear it on logout or when the backend answers 401, returning to the login page; after a 401 on a stored session it MUST show a "session expired" message.
- **FR-014**: The frontend MUST provide one shared way for later screens to require sign-in (a guard around protected screens and one API helper that adds the token and handles 401), so later stories only register their screens.
- **FR-015**: Automated tests MUST cover AC1–AC10 without a real database or network, as listed in AC11, and all existing backend and frontend tests MUST keep passing.
- **FR-016**: `backend/README.md`, `backend/.env.example` (placeholders only) and `frontend/README.md` MUST document the new settings, the demo-user command and the sign-in pattern. `docs/PROJECT_STATUS.md` MUST be updated when the story is done, and the PR MUST record a one-time manual check against Neon (demo users created, login and `/me` work) and in the browser (login, wrong password, logout, both languages).
- **FR-017**: New dependencies MUST be the minimum needed and MUST run with Windows Smart App Control on (pure Python or standard library preferred, D-31); the plan MUST justify each one (D-23).
- **FR-018**: Requiring the signing secret MUST NOT break existing tests. The backend test setup MUST provide a dummy, clearly fake test secret (never a real one) so every existing test keeps passing, and the TS-04 `*` CORS startup subprocess test MUST pass a valid dummy secret to the subprocess so it still fails for the `*` reason only. Existing frontend tests MAY be changed only to start from a signed-in session (a stored session plus a mocked `/me`); the behaviour they check MUST stay the same. One exception: the TS-05 test "banner cannot be dismissed" MAY also expect the logout button in the header, because logout is not a control of the banner. The test still checks that there is no close, hide or dismiss control.

### Key Entities

- **User account** (TS-03 `users` table): username (unique), password hash, full name, role (`doctor` or `nurse`), created at. No new columns.
- **Demo account definition**: the fixed synthetic usernames, full names and roles of the demo users; their passwords come from environment settings.
- **Access token**: a signed, short-lived proof of sign-in carrying the account identity and an expiry; not stored on the server.
- **Session (browser)**: the token plus the signed-in user's name and role kept by the frontend for the tab until logout, expiry or a 401.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A teammate can create the demo users on Neon and sign in from the browser in under 5 minutes following only the READMEs.
- **SC-002**: 100% of tested requests to `/me` without a valid token (missing, malformed, wrong secret, tampered, expired, unknown account) are rejected with 401.
- **SC-003**: Wrong-username and wrong-password login responses are identical in status and body in 100% of tests.
- **SC-004**: A search of the repository finds no signing secret, demo password or password in plain text; only placeholders in `.env.example`.
- **SC-005**: A signed-in user sees their name and role within 2 seconds of a successful sign-in on a local setup, and logout returns to the login page immediately.
- **SC-006**: 100% of the login page and session texts (labels, button, all error messages, role names, logout) appear in English after selecting EN and in Spanish after selecting ES.
- **SC-007**: All backend and frontend tests (new and existing) pass with no database and no network, each suite in under 30 seconds.

## Assumptions

- Accounts use username + password (no email). Demo usernames, full names and roles are synthetic and fixed in the code (e.g. a doctor `dr.demo` and a nurse `nurse.demo`); exact values are fixed in the plan. Their passwords are separate environment settings (e.g. one per demo user) kept in `backend/.env`.
- The demo-user command is a small script run by hand from `backend/` against the same `DATABASE_URL`, like the TS-03 migrations (D-32); it is not run on app start.
- The token is a standard signed token sent in the `Authorization: Bearer` header; it is stateless, so logout only clears it in the browser and the token stays technically valid until it expires (accepted for the academic scope; the short lifetime limits the risk). Token format, signing algorithm and hashing algorithm are chosen in the plan, preferring the Python standard library or pure-Python packages (D-31).
- The browser keeps the session in the tab's session storage, so a reload keeps the user signed in but closing the tab signs them out; nothing is stored in cookies (confirmed in Clarifications).
- `GET /me` reads the account from the database on every call, so a deleted account is rejected and the shown name and role are current.
- After sign-in the start page keeps its TS-04/TS-05 behaviour (the `/health` status) and adds the user's name, role and logout; there is no router yet, so "reachable only when signed in" means the app shows the login page instead of any protected screen.
- Tests replace the database with fakes or overrides and mock `fetch` in the frontend, as in earlier stories; the manual Neon and browser checks are recorded in the PR, with the local test output (D-27) until TS-09.
- Role names shown in the UI: Spanish "Médico" / "Enfermero(a)", English "Doctor" / "Nurse"; exact wording is fixed in the plan's contract.
