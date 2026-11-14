# Contract: Sign-in UI, session and API client (TS-06)

## Screen structure

```text
<LanguageProvider>
  <AuthProvider>
    <AppShell>                      header: disclaimer · [user name · role · Logout] · ES/EN
      <RequireAuth>                 signed out → <LoginPage />
        <StartPage />               signed in only (TS-04/TS-05 behaviour unchanged)
      </RequireAuth>
    </AppShell>
  </AuthProvider>
</LanguageProvider>
```

- The user block (full name, translated role, logout button) is shown in the `AppShell` header **only when signed in**. The disclaimer and the ES/EN switch are always shown (TS-05).
- **Signed out**, no clinical or start-page content is rendered and `/health` is not called. The login page makes no backend call until the user submits.
- **Later stories** wrap each clinical screen in `<RequireAuth>` and call the backend only through `src/api/client.js`.

## LoginPage

| Element | Details |
|---|---|
| Heading | `h1` = `app.title`; `h2` = `login.title` |
| Username | `<input>` with `<label>` `login.username`, `autocomplete="username"`, `maxLength=50`, `required` |
| Password | `<input type="password">` with `<label>` `login.password`, `autocomplete="current-password"`, `maxLength=128`, `required` |
| Button | `type="submit"`, text `login.submit`; while a request is in flight it shows `login.submitting` and is `disabled` (only one request at a time) |
| Message | `<p role="alert">` with one of the error keys below, or nothing |

| Situation | Message key | Fields |
|---|---|---|
| Arrived after a 401 on a stored session | `login.sessionExpired` | empty |
| Login answered 401 | `login.invalidCredentials` | username kept, password cleared |
| Network error, timeout, 5xx, 422 or failed `/me` | `login.unreachable` | both kept |
| Success | message cleared | the start page is shown |

The message is stored as a key, so switching language translates a message already shown. The typed username is kept when the language is switched.

## Texts added to `src/i18n/translations.js`

| Key | es | en |
|---|---|---|
| `login.title` | Iniciar sesión | Sign in |
| `login.username` | Usuario | Username |
| `login.password` | Contraseña | Password |
| `login.submit` | Entrar | Sign in |
| `login.submitting` | Entrando… | Signing in… |
| `login.invalidCredentials` | Usuario o contraseña incorrectos. | Incorrect username or password. |
| `login.unreachable` | No se puede conectar con el servidor. Inténtalo de nuevo. | Cannot connect to the server. Please try again. |
| `login.sessionExpired` | Tu sesión ha terminado. Inicia sesión de nuevo. | Your session has ended. Please sign in again. |
| `auth.signedInAs` | Sesión iniciada | Signed in |
| `auth.logout` | Cerrar sesión | Sign out |
| `role.doctor` | Médico | Doctor |
| `role.nurse` | Enfermero(a) | Nurse |

- `auth.signedInAs` is the `aria-label` of the user block in the header.
- The role is shown as `t('role.' + user.role)`.

## Session module `src/auth/session.js`

| Export | Behaviour |
|---|---|
| `SESSION_KEY` | `'pdm.session'` |
| `getSession()` | Stored session if `sessionStorage` holds a valid one (see data-model). Otherwise the in-memory copy, or `null`. It never throws. |
| `saveSession(s)` | Sets the in-memory copy and writes JSON to `sessionStorage`. A storage error is ignored. |
| `clearSession()` | Clears the in-memory copy and removes the item. A storage error is ignored. |

## API client `src/api/client.js` (extends TS-04)

| Export | Behaviour |
|---|---|
| `API_BASE_URL`, `REQUEST_TIMEOUT_MS`, `getHealth()` | unchanged |
| `ApiError` | `Error` subclass with a numeric `status`. Its message is `HTTP <status>`; the response text is never included. |
| `apiGet(path, options?)` | `GET` through `request` |
| `apiPost(path, body, options?)` | `POST`, JSON body, `Content-Type: application/json` |
| `login(username, password)` | `POST /auth/login`. Returns `{ access_token, expires_in }`. Throws `ApiError(401)` on wrong credentials. |
| `getMe(token?)` | `GET /me`. Returns `{ username, full_name, role }`. |
| `onUnauthorized(handler)` | Registers the one 401 handler and returns a function that removes it. |

Every request goes through one internal `request(method, path, { body, token })`:

- It uses the 10 s timeout. The token is `options.token ?? getSession()?.token`.
- When there is a token, it adds `Authorization: Bearer <token>`. Tokens never go in the URL.
- A **401 on a request that used the stored session's token** → `clearSession()`, then the handler, then `throw ApiError(401)`. Any other non-2xx status → `throw ApiError(status)`. Network errors, timeouts and invalid JSON are thrown as before.

## AuthContext `src/auth/AuthContext.jsx`

`useAuth()` → `{ user, signIn(username, password), signOut(), sessionExpired }`. Used outside the provider, it throws a developer error, as `useLanguage` does.

| When | What happens |
|---|---|
| Load with a stored session | `user` = stored user at once; one `getMe()` call. 200 → user refreshed and saved. 401 → signed out, `sessionExpired = true`. Other errors → nothing changes. |
| Load without a session | `user = null`, `sessionExpired = false`, no backend call |
| `signIn` | `login()` → `getMe(token)` → `saveSession({ token, user })` → `user` set, `sessionExpired = false`. Errors from `login()` are rethrown unchanged for `LoginPage` to map (401 → wrong credentials). Any failure of the `getMe` call, even a 401, is rethrown as a plain non-`ApiError` error, so `LoginPage` shows `login.unreachable`; nothing is saved. |
| `signOut` | `clearSession()`; `user = null`; `sessionExpired = false`; the language is unchanged |
| Any later 401 (handler) | `user = null`; `sessionExpired = true` |
