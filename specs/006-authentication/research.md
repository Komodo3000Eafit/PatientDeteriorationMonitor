# Research: Authentication (TS-06)

The main tech choices came with the `/speckit-plan` input (standard-library password hashing, PyJWT, settings from the environment, `sessionStorage`). This file records them, why they were chosen, and the details that needed deciding. These include how tests avoid a real database, what happens when the database is down, and how existing tests keep passing. Checked on a team laptop (Python 3.13, FastAPI 0.162.4) on 2026-11-13.

## R1. Password hashing: PBKDF2 from the standard library

- **Decision**: new module `backend/app/passwords.py` with two pure functions:
  - `hash_password(password, *, iterations=600_000) -> str`: `salt = secrets.token_bytes(16)`, `dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)`. It returns `"pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>"`, with standard base64 and no line breaks (about 90 characters, well inside `users.password_hash` varchar(255)).
  - `verify_password(password, stored) -> bool`: splits `stored` on `$`. It returns `False` (never raises) if there are not exactly 4 parts, the scheme isn't `pbkdf2_sha256`, the iterations value isn't an integer from 1 to 10 000 000, or the base64 is bad. Otherwise it recomputes the hash with the stored salt and iterations and compares with `hmac.compare_digest`.
- **Rationale**: no new dependency and nothing compiled (D-31). 600 000 iterations of PBKDF2-HMAC-SHA256 is the current OWASP Password Storage recommendation. Keeping the iteration count in the stored value lets it be raised later without breaking old hashes. The `iterations` keyword lets tests build fake users with a low count so the suite stays fast (R7). Production code always uses the default.
- **Alternatives considered**: bcrypt, argon2-cffi and passlib were rejected: all need compiled extensions or are unmaintained, and Smart App Control blocks compiled `.pyd` files (D-31). `hashlib.scrypt` was rejected because it depends on the OpenSSL build and its memory cost needs tuning.

## R2. Access tokens: PyJWT, HS256

- **Decision**: add `PyJWT==2.15.1` to `backend/requirements.txt`. The wheel `pyjwt-2.15.1-py3-none-any.whl` is pure Python. HS256 uses only the standard `hmac`/`hashlib`; the optional `cryptography` extra is not installed (only RSA/EC need it).
  - `create_access_token(user_id, *, now=None) -> (token, expires_in_seconds)` builds the claims `sub` = `str(user_id)` (PyJWT 2.10+ requires `sub` to be a string), `iat` = now and `exp` = now + `ACCESS_TOKEN_MINUTES`. It signs them with `AUTH_SECRET` using `HS256`. The `now` keyword lets tests make an already-expired token.
  - `decode_access_token(token) -> int | None`: `jwt.decode(token, secret, algorithms=["HS256"], options={"require": ["exp", "iat", "sub"]})` with no leeway. It returns the user id, or `None` for any `jwt.PyJWTError`, or a `sub` that isn't a positive integer string. Passing `algorithms` explicitly blocks the `alg: none` and algorithm-confusion attacks.
- **Rationale**: JWT is the standard bearer-token format, and PyJWT is small, maintained and pure Python. A token the server doesn't store keeps the backend stateless, with no new table (D-23).
- **Alternatives considered**:
  - Signing with `hmac` by hand: about 30 lines of security code to get right, with the same result.
  - `itsdangerous`: not a standard token format.
  - `python-jose`: less maintained.
  - Server-side session table: needs a new table and cleanup.

## R3. Settings and the startup check

- **Decision**: `backend/app/auth.py` has a pure function `load_auth_settings(environ) -> AuthSettings` (a frozen dataclass with `secret` and `token_minutes`):
  - `AUTH_SECRET`, stripped: missing, blank or under 32 characters → `RuntimeError("AUTH_SECRET must be set to a random value of at least 32 characters")`.
  - `ACCESS_TOKEN_MINUTES`, stripped: unset or blank → `480`. Otherwise it must be a whole number from 1 to 1440 (24 h, so the token stays short-lived); anything else → `RuntimeError("ACCESS_TOKEN_MINUTES must be a whole number of minutes from 1 to 1440")`.
  - The messages are fixed text and never include the value (FR-009, AC6).
- `app/auth.py` calls `load_dotenv(backend/.env, override=False)` itself, exactly as `app/db.py` does, so it doesn't depend on import order. It then sets `SETTINGS = load_auth_settings(os.environ)` at import time. `app/main.py` imports `app.auth`, so a bad setting stops `uvicorn app.main:app` before it serves anything, the same way the TS-04 `*` CORS check does.
- **Generating a secret** (documented in the README): `python -c "import secrets; print(secrets.token_urlsafe(48))"` gives 64 characters.
- **Rationale**: the same pattern as `DATABASE_URL` and `CORS_ORIGINS`, with no settings library (D-23). A pure function can be tested directly, and one subprocess test proves the app really refuses to start (R7).
- **Alternatives considered**:
  - `pydantic-settings`: a new dependency for two values.
  - Checking in a FastAPI startup event: the app would import fine and fail later, which is harder to see and to test.

## R4. User lookup and the protection check

- **Decision**: in `app/auth.py`:
  - `class DbUserLookup` is **lazy**: it opens a SQLAlchemy `Session(get_engine())` only on its first lookup. It has two methods, `by_username(username) -> User | None` (exact match, `select(User).where(User.username == username)`) and `by_id(user_id) -> User | None` (`session.get(User, user_id)`). On first use, if `database_url()` is `None`, it raises 503. If a database error happens, it logs only the error type (as `check_database` does) and raises 503. Each 503 is a new `HTTPException(503, "Service unavailable")` from a small function, never one shared instance.
  - The FastAPI dependency `get_user_lookup()` **never raises and never connects**. It yields a `DbUserLookup()` and closes its session, if one was opened, afterwards. It reuses `app.db` (URL conversion, TLS, timeouts from TS-02).
  - **Why lazy (found by `/speckit-analyze`, I1)**: FastAPI resolves every dependency before `get_current_user` runs. If `get_user_lookup` raised 503 when there is no database, a missing or bad token would get 503 instead of the 401 that AC4 requires.
  - The reusable check is `get_current_user(credentials = Depends(HTTPBearer(auto_error=False)), users = Depends(get_user_lookup)) -> User`. If credentials are missing, the scheme isn't `bearer`, the token doesn't decode (R2) or `users.by_id(...)` is `None`, it raises `HTTPException(401, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})`. Later clinical endpoints add `user: User = Depends(get_current_user)` (FR-006, FR-014).
- **Why `auto_error=False`**: `HTTPBearer` already returns 401 in FastAPI 0.162.4 (checked), but older versions returned 403. Raising our own 401 gives one fixed body for every failure case.
- **Order of checks**: the token is checked first. A request with a missing or bad token gets 401 without touching the database, **even when no database is configured or it is down**. Only a valid token leads to `by_id`, which is the first point where a 503 can happen.
- **Tests** override `get_user_lookup` with a small in-memory fake (two users), so no API test needs a database (R7).
- **Alternatives considered**:
  - A FastAPI dependency yielding a raw `Session`: tests would need a fake session or SQLite.
  - Monkeypatching module functions: the user input asked for a dependency override.

## R5. Login endpoint, generic errors and timing

- **Decision**: `POST /auth/login` takes the body `LoginRequest(username: str = Field(min_length=1, max_length=50), password: str = Field(min_length=1, max_length=128))`. Lengths are checked exactly as typed: usernames are **not** trimmed or lower-cased (spec edge case).
  1. `user = users.by_username(body.username)`
  2. If `user` is `None`: `verify_password(body.password, DUMMY_HASH)` (result ignored), then the 401 below.
  3. If `verify_password(body.password, user.password_hash)` is `False`: the 401 below.
  4. Otherwise: `create_access_token(user.id)` → `{"access_token", "token_type": "bearer", "expires_in"}`.
- **The 401** is `{"detail": "Incorrect username or password"}` with `WWW-Authenticate: Bearer`, identical for both cases (FR-004, AC3).
- **`DUMMY_HASH`**: built once, the first time it's needed (`functools.cache`), from a random throwaway value with the default 600 000 iterations. An unknown username then costs the same PBKDF2 work as a wrong password, so timing doesn't reveal which usernames exist.
- **Database down**: `DbUserLookup` raises 503 `Service unavailable`, which is never the wrong-credentials 401 (spec edge case).
- **Rationale**: the simplest way to meet "identical answers and similar timing".
- **Alternatives considered**: OAuth2 password form (`OAuth2PasswordRequestForm`) was rejected: it needs `python-multipart` and form encoding, and JSON matches the rest of the API and the frontend client.

## R6. Validation errors never echo input

- **Finding (checked)**: FastAPI's default 422 body includes each error's `input` (and `ctx`). A password that is too long is **sent back in the response**: `{"type":"string_too_long",...,"input":"secret1"}`.
- **Decision**: in `app/main.py`, an exception handler for `RequestValidationError` returns 422 with `{"detail": [{"type", "loc", "msg"} ...]}`, dropping `input` and `ctx` from every error. It applies to the whole API, so later endpoints never echo submitted values either (constitution VIII, safe error messages).
- **Rationale**: about 8 lines. It keeps useful field-level messages for later stories and never returns a password or other submitted text.
- **Alternatives considered**: a generic `{"detail": "Invalid request"}` (loses the field names later forms will need); a handler only for `/auth/login` (later endpoints would still echo).

## R7. Test strategy (no database, no network)

- **Backend**:
  - `tests/conftest.py` sets these at the top, before `import app.main`:
    - `os.environ["AUTH_SECRET"] = "test-only-secret-not-for-real-use-0123456789"` (clearly fake, at least 32 characters);
    - `os.environ["ACCESS_TOKEN_MINUTES"] = ""` (the default, 480);
    - the same for `DEMO_DOCTOR_PASSWORD` / `DEMO_NURSE_PASSWORD` (`""`).

    python-dotenv (`override=False`) never replaces a variable that already exists, so a developer's `backend/.env` can't change the tests. This is the same approach as `CORS_ORIGINS` in TS-04.
  - The TS-04 subprocess test `test_wildcard_stops_startup` sets `env["AUTH_SECRET"]` to the same fake secret, so the subprocess still fails only because of `*` (FR-018).
  - A new subprocess test runs `import app.main` with `AUTH_SECRET=""` and checks a non-zero exit and the fixed message.
  - API tests override `get_user_lookup` with a `FakeUserLookup` holding a doctor and a nurse whose hashes are made with `hash_password(pw, iterations=1_000)` (fast; verification reads the count from the hash). One unit test uses the default 600 000 to prove the real format.
  - Expired tokens are made with `create_access_token(id, now=<2 days ago>)`. Wrong-secret tokens are made with `jwt.encode(..., "another-secret-...")`. A tampered token is a valid token with its payload part changed.
  - The demo-user command is tested with **in-memory SQLite** (`sqlite://`, standard library): `Base.metadata.create_all(engine, tables=[User.__table__])` works with the `users` model (checked: `Identity()` and the `now()` default work on SQLite). It is not the real database, and nothing is installed.
- **Frontend**:
  - `fetch` is mocked by URL: a helper returns the `/health`, `/auth/login` and `/me` answers per test.
  - `sessionStorage` is cleared after each test, and blocked storage is simulated with `vi.spyOn(Storage.prototype, 'getItem' | 'setItem')`, as in TS-05.
  - The existing `App.test.jsx` and `language.test.jsx` start from a stored session and a mocked `/me` (FR-018). Their `fetch` call-count checks count **`/health` calls only**, so "one `/health` call per load" is still checked exactly.

## R8. CORS

- **Decision**: in `app/main.py`, `allow_methods=["GET", "POST"]` and `allow_headers=["Authorization", "Content-Type"]`. `allow_origins` still comes from `parse_cors_origins` (unchanged, `*` still stops startup) and `allow_credentials=False` (FR-010).
- **Rationale**: `POST` with a JSON body and any request carrying `Authorization` make the browser send a preflight. These two headers are exactly what the frontend sends. The token travels in a header, never in a cookie, so credentials stay off.
- **Tests**: a preflight `OPTIONS /auth/login` from the allowed origin, asking for `POST` and `authorization, content-type`, is allowed. The same preflight from another origin is not. A preflight asking for `DELETE` is not allowed.

## R9. Frontend session: `sessionStorage` + client token

- **Decision**:
  - `frontend/src/auth/session.js` exports `getSession()`, `saveSession(session)` and `clearSession()`. The storage key is `pdm.session`, and the JSON value is `{ token, user: { username, full_name, role } }`.
    - `getSession()` reads `sessionStorage` inside `try/catch` and accepts only that exact shape (non-empty strings). Anything else, or a throwing storage, counts as signed out.
    - `saveSession()` also keeps an in-memory copy, so with blocked storage sign-in still works until the page is reloaded (spec edge case: no error shown).
  - `frontend/src/api/client.js` gets one shared `request(method, path, { body, token })`:
    - It keeps the 10 s timeout. The token is `token ?? getSession()?.token`. When there is a token it sends `Authorization: Bearer <token>`. A body is sent as JSON with `Content-Type: application/json`.
    - On a non-2xx status it throws `ApiError` with `status`, never with the response text.
    - If the status is 401 **and the token came from the stored session**, it calls `clearSession()` and the handler registered with `onUnauthorized(handler)` before throwing. A 401 from login (no token) only throws, so the login page can show "incorrect username or password".
    - `apiGet`, `apiPost`, `login(username, password)` and `getMe(token?)` are built on `request`. `getHealth()` is unchanged.
  - `frontend/src/auth/AuthContext.jsx`: `AuthProvider` + `useAuth()` → `{ user, signIn, signOut, sessionExpired }`.
    - `user` starts from `getSession()?.user`.
    - On mount with a stored session, it calls `getMe()` once to check the token and refresh the name and role. A 401 → signed out with `sessionExpired = true`. Network errors keep the stored user, so the start page still shows its own "cannot connect" state.
    - `signIn(username, password)` calls `login()`, then `getMe(token)`, saves the session, then sets `user` and clears `sessionExpired`. A `getMe` failure after a successful login, even a 401, is rethrown as a plain error, so the login page shows "cannot connect", never "incorrect username or password".
    - `signOut()` clears the session and sets `user = null`.
    - It registers the `onUnauthorized` handler in an effect and removes it on unmount.
  - `frontend/src/auth/RequireAuth.jsx`: `user ? children : <LoginPage />`. This is the guard every later clinical screen is wrapped in (FR-011, FR-014).
- **Rationale**: one place for the token (the client) means later screens never handle it. `sessionStorage` was confirmed in Clarifications. No router or state library is needed (D-33).
- **Alternatives considered**:
  - An httpOnly cookie: needs credentials in CORS, which the spec forbids.
  - `localStorage`: survives closing the tab, so it was rejected in Clarifications.
  - A React Router guard: there is no router yet (D-33).

## R10. Logout without server revocation

- **Decision**: logout only clears the browser session (R9). The token stays valid until `exp`, which is 8 hours by default.
- **Rationale**: accepted in the spec's Assumptions. A blocklist would need a table and checks on every request (D-23). The short lifetime and the fact that `sessionStorage` is limited to one tab reduce the risk. This is noted in D-35 and for TS-10.

## R11. Notes for later stories

- **TS-09/TS-10**: `AUTH_SECRET` becomes a GitHub secret (tests use the fake one from `conftest.py`, so CI needs none for tests) and an Azure App Service setting. It must never be the same value as locally.
- **TS-10**: rate limiting and lockout for `/auth/login` (out of scope here).
- **Clinical stories**: every clinical endpoint uses `Depends(get_current_user)`, and every clinical screen is rendered inside `<RequireAuth>`.
