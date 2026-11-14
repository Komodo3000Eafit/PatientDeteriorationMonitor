# PatientDeteriorationMonitor — Frontend

React app (Vite, plain JavaScript) for the PatientDeteriorationMonitor prototype. This is the
TS-04 skeleton: one start page that shows whether the backend API and its database are working.
The UI is in Spanish by default, with an **ES / EN** switch to English (see "How to add or change texts").

## Prerequisites

- **Node.js 26 LTS** (check with `node -v`).
- The backend running locally, as described in [backend/README.md](../backend/README.md)
  (by default at `http://localhost:8000`).

## Commands

Run these from the `frontend/` folder:

| Command | What it does |
|---|---|
| `npm install` | Installs the dependencies (first time, or after `package.json` changes). |
| `npm run dev` | Starts the development server at **http://localhost:5173**. |
| `npm run build` | Builds the production files into `dist/` (git-ignored). |
| `npm test` | Runs the automated tests once. No backend or network is needed. |

Notes on `npm run dev`:

- Open the page at `http://localhost:5173`, **not** `http://127.0.0.1:5173`. For the browser
  they are different origins, and the backend only allows `http://localhost:5173` by default
  (CORS).
- The port is fixed: if 5173 is already in use, `npm run dev` fails instead of moving to
  another port. Stop the other process and try again.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Base URL of the backend API. |

- The default works for local development, so no configuration is needed.
- To override it, copy `.env.example` to `.env` in `frontend/` and edit the value. `.env` is
  git-ignored; only `.env.example` is committed.
- The value is read when `npm run dev` or `npm run build` starts. Restart `npm run dev` after
  changing it.
- It is **not a secret**: it ends up in the built JavaScript that every visitor downloads. Never
  put secrets in frontend configuration.

## API client

All calls to the backend go through one module: [`src/api/client.js`](src/api/client.js). It
holds the base URL, a 10-second timeout and the error handling.

**Rule:** screens and components never build backend URLs or call `fetch` directly. They call a
function from `src/api/client.js` (add a new one there, or use `apiGet(path)`).

## How to add or change texts

All visible texts live in [`src/i18n/translations.js`](src/i18n/translations.js), one entry per
key in `es` (the complete reference) and in `en`.

- To add a text, add the same key to both `es` and `en`. Then, in a component:

  ```jsx
  import { useLanguage } from './i18n/LanguageContext.jsx'

  const { t } = useLanguage()
  return <p>{t('area.name')}</p>
  ```

- To insert a value, write `{name}` in the text and call `t('area.name', { name })`.
- A key missing in English shows the Spanish text. A test fails if English has a key that Spanish
  doesn't.
- **Never write visible text directly in a component.**
- New screens are rendered inside `AppShell` (in `src/App.jsx`), so they get the disclaimer banner
  and the language switch.
- The language choice is remembered in the browser under the `localStorage` key `pdm.language`
  (`es` or `en`). When nothing valid is stored, the page is in Spanish. To reset it, run
  `localStorage.removeItem('pdm.language')` in the browser console.

## Sign-in

- While signed out, the app shows the login page inside `AppShell` (with the disclaimer banner and
  the language switch). The demo users (`demo.doctor`, `demo.nurse`) are created by the backend
  command described in [backend/README.md](../backend/README.md#authentication).
- The session (token and user) is kept in the browser under the `sessionStorage` key
  `pdm.session`. It belongs to one tab: a reload keeps it, closing the tab signs out. No cookies
  are used. **Sign out** clears it, and a `401` answer from the backend on a stored session signs
  out and shows "Tu sesión ha terminado. Inicia sesión de nuevo."
- [`src/api/client.js`](src/api/client.js) adds `Authorization: Bearer <token>` automatically.
  Screens never handle the token and must call the backend only through the client.
- To add a protected screen, render it inside `<RequireAuth>` (from
  [`src/auth/RequireAuth.jsx`](src/auth/RequireAuth.jsx)), and get the signed-in user with
  `useAuth()` (from [`src/auth/AuthContext.jsx`](src/auth/AuthContext.jsx)):

  ```jsx
  <RequireAuth>
    <MyClinicalScreen />
  </RequireAuth>
  ```

- Roles are shown with the `role.*` texts (`role.doctor`, `role.nurse`) from
  `src/i18n/translations.js`.

## What the start page shows

The start page is shown only after signing in, with the user's name, role and a sign-out button
in the header.

The page checks the backend's `GET /health` once when it loads:

| Situation | Page shows |
|---|---|
| While checking | `Comprobando la conexión con el servidor…` |
| API and database working | `API: funcionando`, `Versión: <version>`, `Base de datos: disponible` |
| API working, database not available | `API: funcionando`, `Versión: <version>`, `Base de datos: no disponible`, `Recarga la página para volver a comprobar.` |
| Backend cannot be reached (not running, error, or no answer within 10 s) | `No se puede conectar con el servidor.`, `Recarga la página para volver a comprobar.` |

The page is in Spanish by default, with an **ES / EN** switch at the top next to the pinned
disclaimer banner; the English texts are in [`src/i18n/translations.js`](src/i18n/translations.js).

The page does not retry on its own: **reload the page** to check again.

## Troubleshooting

**The page shows "No se puede conectar con el servidor."**

- The backend is not running: start it as in [backend/README.md](../backend/README.md) and
  reload the page.
- Or the backend's `CORS_ORIGINS` doesn't include the page's origin (for example, you opened
  `http://127.0.0.1:5173`, or set `CORS_ORIGINS` without `http://localhost:5173`). The browser
  console (F12) then shows a CORS error. Open `http://localhost:5173`, or see the
  "Allowed frontend origins (CORS)" section of [backend/README.md](../backend/README.md).
- Or `VITE_API_BASE_URL` points to the wrong address: check `frontend/.env` (if any) and restart
  `npm run dev`.
