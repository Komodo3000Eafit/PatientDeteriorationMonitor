# Quickstart: Header Navigation (TS-15)

How to validate the redesigned header. Frontend only; no backend or network needed for the tests.

## Prerequisites

- Node + the frontend dependencies installed:

  ```sh
  cd frontend
  npm install
  ```

## Automated validation (primary)

Run the frontend suite (includes the header tests and the raw-color/contrast guards):

```sh
cd frontend
npm test            # vitest run
npm run build       # must succeed
```

Expected: all tests pass and the passing-test count does not drop below the baseline (628 across
32 files). The header coverage proves each acceptance criterion:

| Acceptance criterion | Where asserted |
|----------------------|----------------|
| AC1 brand link shows logo + title, `href="/patients"` | `auth.test.jsx` / `App.routes.test.jsx` |
| AC2 brand link navigates to `/patients` | `App.routes.test.jsx` |
| AC3 Home link navigates to `/patients` | `App.routes.test.jsx` |
| AC4 brand + Home absent when signed out | `auth.test.jsx` |
| AC5 brand + Home visible on `/patients` when signed in | `auth.test.jsx` / `language.test.jsx` |
| AC6 keyboard reachable with accessible names (role=link, named by text) | `auth.test.jsx` |
| AC7 disclaimer `role="note"`, always visible, non-closable | `language.test.jsx` |
| AC8 user block, sign out → `/login`, ES/EN still work | `auth.test.jsx` / `language.test.jsx` |
| AC9 Spanish default + English for brand and Home | `language.test.jsx` |
| AC10 icons decorative, tokens only, no raw colors | `styles/noRawColors.test.js`, `styles/contrast.test.js` |
| AC11 scope + no new dependency | manual diff review; `package.json` unchanged |
| AC12 nothing else breaks | full `npm test` + `npm run build` |

## Manual validation (optional)

```sh
cd frontend
npm run dev
```

1. On the login screen (signed out): confirm the header shows the disclaimer and the ES/EN switch,
   and does NOT show the logo/title or the Home control.
2. Sign in as a demo user. Confirm the header shows, left to right: logo (`HeartPulse`) + title,
   then a Home button-looking link, then the disclaimer, user name + role, sign out, ES/EN.
3. Navigate to a patient detail screen, then click the logo/title: it returns to `/patients`.
   Repeat with the Home control.
4. On `/patients`, confirm both the logo/title and Home control are still visible.
5. Tab through the header: the logo/title link and the Home link are focusable and announced by
   their visible text; switch to EN and confirm the title and Home label change language.
6. Resize to a narrow width: the header wraps without clipping or overlap.

## Out of scope to validate

- Backend behavior (unchanged).
- Authentication / route protection (unchanged).
- Any navigation target other than `/patients`.
