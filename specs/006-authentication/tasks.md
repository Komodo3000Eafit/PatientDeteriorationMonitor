---

description: "Task list for TS-06 authentication"
---

# Tasks: Authentication

**Input**: Design documents from `specs/006-authentication/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/auth-api.md](contracts/auth-api.md), [contracts/auth-ui.md](contracts/auth-ui.md), [quickstart.md](quickstart.md)

**Tests**: MANDATORY. These are API endpoints and security controls (constitution VII), and the spec lists the tests (AC11, FR-015, FR-018). AC12 is checked by review, and the Neon and browser parts by the manual checks (quickstart 2–3).

**Organization**: This feature has one story (TS-06), so all story tasks carry the `[TS-06]` label.

## Format: `[ID] [P?] [Story] Description (agent)`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **(agent)**: Owner agent, at the end of the line
- All paths are relative to the repository root. Backend commands run from `backend/` with `.\.venv\Scripts\Activate.ps1`; frontend commands run from `frontend/`.
- Edit files with Edit/Write, not PowerShell (non-ASCII Spanish text, CLAUDE.md).
- **No agent may print, read aloud or copy the contents of `backend/.env`, or the value of `DATABASE_URL`, `AUTH_SECRET` or any `DEMO_*_PASSWORD`.** Tests use only the fake values defined below. Never log or return a password, hash, token or secret.

---

## Phase 1: Setup

- [ ] T001 [TS-06] Edit `backend/requirements.txt`: add the line `PyJWT==2.15.1` after `python-dotenv==1.2.4`. Do not add `cryptography` or any extra. Then run `python -m pip install -r requirements.txt` in `backend/.venv` and confirm `python -c "import jwt; print(jwt.__version__)"` prints `2.15.1` (pure-Python wheel `py3-none-any`; research R2, FR-017, D-31) (backend-dev)
- [ ] T002 [P] [TS-06] Create `backend/.env.example` with **placeholders only**. Add a comment line at the top: `# Copy to backend/.env (git-ignored) and fill in real values. Never commit backend/.env.` Then add one commented explanation line before each of these lines:
  - `DATABASE_URL=postgresql://<user>:<password>@<host>/neondb?sslmode=require`
  - `CORS_ORIGINS=http://localhost:5173`
  - `AUTH_SECRET=<generate: python -c "import secrets; print(secrets.token_urlsafe(48))">`
  - `ACCESS_TOKEN_MINUTES=480`
  - `DEMO_DOCTOR_PASSWORD=<at least 8 characters>`
  - `DEMO_NURSE_PASSWORD=<at least 8 characters>`

  Confirm `.gitignore` keeps `!.env.example` (already present) and that `git status` shows `.env.example` but not `.env` (data-model "Settings", FR-016, SC-004) (backend-dev)

---

## Phase 2: Foundational

None. TS-03 (the `users` table and models), TS-04 (CORS, `client.js`) and TS-05 (`AppShell`, `translations.js`) are merged. **No migration**: `backend/migrations/` and `backend/app/models.py` must not change (data-model).

---

## Phase 3: TS-06 Authentication 🎯 MVP

**Goal**: demo accounts exist with hashed passwords, `POST /auth/login` returns a short-lived token, `GET /me` and every later endpoint are protected by `get_current_user`, and the frontend shows a login page inside `AppShell` until the user signs in, then the start page with name, role and logout.

**Independent Test**: `python -m pytest` in `backend/` and `npm test` in `frontend/` pass with no database and no network (new tests plus existing ones), and quickstart steps 2–3 pass on Neon and in a browser.

### Backend implementation

- [ ] T003 [P] [TS-06] Create `backend/app/passwords.py`. Module docstring: "Password hashing (TS-06): PBKDF2-HMAC-SHA256 from the standard library; see specs/006-authentication/research.md R1." It contains:
  - `SCHEME = "pbkdf2_sha256"` and `DEFAULT_ITERATIONS = 600_000`.
  - `hash_password(password: str, *, iterations: int = DEFAULT_ITERATIONS) -> str`: `salt = secrets.token_bytes(16)`, `dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)`. Returns `f"{SCHEME}${iterations}${b64(salt)}${b64(dk)}"`, using `base64.b64encode(...).decode("ascii")`.
  - `verify_password(password: str, stored: str) -> bool`: returns `False`, without raising, when any of these fail:
    - `stored` is a `str`;
    - `stored.split("$")` gives exactly 4 parts;
    - `parts[0] == SCHEME`;
    - the iterations part is an integer from 1 to 10_000_000;
    - both base64 parts decode with `base64.b64decode(..., validate=True)` (catch `ValueError`/`binascii.Error`).

    Otherwise it recomputes the hash with the stored salt and iterations and returns `hmac.compare_digest(computed, expected)`.

  No logging and no printing in this module (FR-001, data-model "Password hash") (backend-dev)
- [ ] T004 [TS-06] Create `backend/app/auth.py`, which depends on T001 and T003. Module docstring: "Authentication (TS-06): settings, access tokens, user lookup, the reusable get_current_user dependency and the /auth/login and /me routes. Contract: specs/006-authentication/contracts/auth-api.md." Contents, in this order:
  1. **Load `.env`**: `load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)` (as in `app/db.py`), then `logger = logging.getLogger(__name__)`.
  2. **Settings**: `@dataclass(frozen=True) class AuthSettings: secret: str; token_minutes: int` and `def load_auth_settings(environ) -> AuthSettings`.
     - `secret = (environ.get("AUTH_SECRET") or "").strip()`. If `len(secret) < 32` → `raise RuntimeError("AUTH_SECRET must be set to a random value of at least 32 characters")`.
     - `raw = (environ.get("ACCESS_TOKEN_MINUTES") or "").strip()`. Blank → 480. Otherwise it must match `^\d+$` and be from 1 to 1440, else `raise RuntimeError("ACCESS_TOKEN_MINUTES must be a whole number of minutes from 1 to 1440")`.
     - The messages are fixed and never include a value. Then `SETTINGS = load_auth_settings(os.environ)` at module level (research R3, FR-009).
  3. **Tokens**:
     - `create_access_token(user_id: int, *, now: datetime | None = None) -> tuple[str, int]`: `now = now or datetime.now(timezone.utc)`, `exp = now + timedelta(minutes=SETTINGS.token_minutes)`, `jwt.encode({"sub": str(user_id), "iat": now, "exp": exp}, SETTINGS.secret, algorithm="HS256")`. Returns `(token, SETTINGS.token_minutes * 60)`.
     - `decode_access_token(token: str) -> int | None`: `jwt.decode(token, SETTINGS.secret, algorithms=["HS256"], options={"require": ["exp", "iat", "sub"]})`. Returns `None` on any `jwt.PyJWTError`, or when `sub` doesn't match `^[1-9]\d*$`; otherwise `int(sub)` (research R2, data-model "Access token").
  4. **Errors**:
     - `SERVICE_UNAVAILABLE = HTTPException(503, "Service unavailable")`.
     - `def _unauthorized(detail)` → `HTTPException(401, detail, headers={"WWW-Authenticate": "Bearer"})`.
     - Use `"Incorrect username or password"` for login and `"Not authenticated"` for the token check.
  5. **User lookup**:
     - `class DbUserLookup` takes `__init__(self, session)`, plus `by_username(self, username) -> User | None` (`self.session.scalars(select(User).where(User.username == username)).first()`) and `by_id(self, user_id) -> User | None` (`self.session.get(User, user_id)`).
     - Both catch `SQLAlchemyError` as `exc`, `logger.warning("User lookup failed (%s)", type(exc).__name__)` and `raise SERVICE_UNAVAILABLE`.
     - `def get_user_lookup()` is a generator dependency: if `database_url() is None`, `raise SERVICE_UNAVAILABLE`; then `with Session(get_engine()) as session: yield DbUserLookup(session)`. Import `database_url`, `get_engine` from `app.db` and `User` from `app.models` (research R4).
  6. **Protection check**: `bearer = HTTPBearer(auto_error=False)` and `def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), users: DbUserLookup = Depends(get_user_lookup)) -> User`.
     - If `credentials is None`, or `credentials.scheme.lower() != "bearer"`, or `decode_access_token(credentials.credentials)` is `None` → `raise _unauthorized("Not authenticated")`.
     - Decode **before** calling `users.by_id(user_id)`. If that returns `None`, raise the same 401.
     - Docstring: "Use `Depends(get_current_user)` on every clinical endpoint." (FR-006, FR-014)
  7. **Models**:
     - `class LoginRequest(BaseModel): username: str = Field(min_length=1, max_length=50); password: str = Field(min_length=1, max_length=128)`. No trimming and no lower-casing.
     - `class TokenResponse(BaseModel): access_token: str; token_type: str = "bearer"; expires_in: int`.
     - `class MeResponse(BaseModel): username: str; full_name: str; role: str`.
  8. **Dummy hash**: `@functools.cache def _dummy_hash() -> str: return hash_password(secrets.token_urlsafe(32))` (default iterations).
  9. **Routes**: `router = APIRouter()`.
     - `@router.post("/auth/login", response_model=TokenResponse) def login(body: LoginRequest, users: DbUserLookup = Depends(get_user_lookup))`. If `user = users.by_username(body.username)` is `None`: call `verify_password(body.password, _dummy_hash())`, then raise the login 401. If `not verify_password(body.password, user.password_hash)`: the same 401. Otherwise: `token, expires_in = create_access_token(user.id)` and return `TokenResponse(access_token=token, expires_in=expires_in)`.
     - `@router.get("/me", response_model=MeResponse) def me(user: User = Depends(get_current_user))` returns `MeResponse(username=user.username, full_name=user.full_name, role=user.role)`.

  Never log the username, password, token or secret (FR-003–FR-007, research R5) (backend-dev)
- [ ] T005 [TS-06] Edit `backend/app/main.py`, which depends on T004:
  - Add `from fastapi.exceptions import RequestValidationError`, `from fastapi.responses import JSONResponse` and `from app import auth`. The import of `app.auth` runs the startup check.
  - After `app = FastAPI(...)`, add `app.include_router(auth.router)`.
  - Add `@app.exception_handler(RequestValidationError) async def validation_error(request, exc)` returning `JSONResponse(status_code=422, content={"detail": [{"type": e["type"], "loc": list(e["loc"]), "msg": e["msg"]} for e in exc.errors()]})`. Docstring: "Validation errors never echo submitted values (TS-06 research R6)."
  - In `CORSMiddleware`, set `allow_methods=["GET", "POST"]` and add `allow_headers=["Authorization", "Content-Type"]`. Keep `allow_origins=parse_cors_origins(...)` and `allow_credentials=False` unchanged.
  - Leave `/health` and `parse_cors_origins` unchanged (FR-008, FR-010, research R6, R8).
- [ ] T006 [P] [TS-06] Create `backend/app/seed_demo_users.py`, which depends on T003. Module docstring: "Create or update the demo accounts (TS-06). Run from backend/: python -m app.seed_demo_users. Passwords come only from DEMO_DOCTOR_PASSWORD / DEMO_NURSE_PASSWORD (environment or backend/.env)."
  - It uses `from app.db import database_url, get_engine` (importing `app.db` loads `backend/.env`; module-level names let tests monkeypatch them), `from app.models import User` and `from app.passwords import hash_password`. It does **not** import `app.auth` or `app.main`, so no `AUTH_SECRET` is needed.
  - `DEMO_USERS = [("demo.doctor", "Dra. Ana Demo", "doctor", "DEMO_DOCTOR_PASSWORD"), ("demo.nurse", "Enf. Luis Demo", "nurse", "DEMO_NURSE_PASSWORD")]` (data-model "Demo accounts").
  - `read_demo_passwords(environ) -> tuple[dict[str, str], list[str]]`: for each entry, `value = (environ.get(var) or "").strip()`. If `len(value) < 8`, add the error `f"{var} must be set to at least 8 characters"`; otherwise store `passwords[username] = value`.
  - `upsert_demo_users(session, passwords) -> list[tuple[str, str]]`: for each demo user, `existing = session.scalars(select(User).where(User.username == username)).first()`.
    - Absent → `session.add(User(username=..., password_hash=hash_password(pw), full_name=..., role=...))` and record `("created", username)`.
    - Present → set `password_hash`, `full_name` and `role`, and record `("updated", username)`.
    - It doesn't commit and never deletes.
  - `main(environ=os.environ) -> int`:
    - Errors from `read_demo_passwords` → print each to `sys.stderr` and return 1, before any database access.
    - `database_url() is None` → print `DATABASE_URL is not set` to stderr and return 1.
    - Otherwise: `with Session(get_engine()) as session:` call upsert, then `session.commit()`, and print `f"{action}: {username}"` per account to stdout; return 0.
    - On `SQLAlchemyError as exc` → `session.rollback()` (handled by the context manager), print `f"Could not update the demo users ({type(exc).__name__})"` to stderr and return 1.
  - Under `if __name__ == "__main__":` → `raise SystemExit(main())`.
  - It never prints passwords, hashes or the URL (FR-002, AC1, contracts/auth-api.md "Demo-user command") (backend-dev)
- [ ] T007 [P] [TS-06] Edit `backend/README.md`: add a section `## Authentication` after "Allowed frontend origins (CORS)". It covers:
  1. The settings table (`AUTH_SECRET` required, at least 32 characters; `ACCESS_TOKEN_MINUTES` default 480, range 1–1440; `DEMO_DOCTOR_PASSWORD` / `DEMO_NURSE_PASSWORD`, at least 8 characters, used only by the command). They go in `backend/.env` (copy `backend/.env.example`), never committed and never pasted in a chat.
  2. How to generate the secret: `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
  3. The app refuses to start without a valid secret, and the message names the setting only.
  4. `python -m app.seed_demo_users` creates or updates `demo.doctor` (Dra. Ana Demo, doctor) and `demo.nurse` (Enf. Luis Demo, nurse). It is safe to run again (it updates passwords, no duplicates). Run it after `alembic upgrade head`.
  5. The endpoints `POST /auth/login` and `GET /me` (link [contracts/auth-api.md](../specs/006-authentication/contracts/auth-api.md)), and how to try them in `/docs` with **Authorize**.
  6. Protecting a new endpoint: `user: User = Depends(get_current_user)` (code snippet from the contract).
  7. Notes: logout is client-side only and tokens expire after `ACCESS_TOKEN_MINUTES`. In CI and Azure, `AUTH_SECRET` will be a GitHub/Azure secret (TS-09/TS-10). Rate limiting is not done yet (TS-10).

  In "Setup", mention copying `.env.example` to `.env`. In "Test", add that tests use a fake built-in secret and need no `.env` (FR-016, AC12) (backend-dev)

### Frontend implementation

- [ ] T008 [P] [TS-06] Edit `frontend/src/i18n/translations.js`: add these 12 keys to **both** `es` and `en`, exactly as the [contracts/auth-ui.md](contracts/auth-ui.md) "Texts" table, keeping the existing ten keys unchanged. Use the real `…` (U+2026) in `login.submitting`.

  | Key | es | en |
  |---|---|---|
  | `login.title` | `Iniciar sesión` | `Sign in` |
  | `login.username` | `Usuario` | `Username` |
  | `login.password` | `Contraseña` | `Password` |
  | `login.submit` | `Entrar` | `Sign in` |
  | `login.submitting` | `Entrando…` | `Signing in…` |
  | `login.invalidCredentials` | `Usuario o contraseña incorrectos.` | `Incorrect username or password.` |
  | `login.unreachable` | `No se puede conectar con el servidor. Inténtalo de nuevo.` | `Cannot connect to the server. Please try again.` |
  | `login.sessionExpired` | `Tu sesión ha terminado. Inicia sesión de nuevo.` | `Your session has ended. Please sign in again.` |
  | `auth.signedInAs` | `Sesión iniciada` | `Signed in` |
  | `auth.logout` | `Cerrar sesión` | `Sign out` |
  | `role.doctor` | `Médico` | `Doctor` |
  | `role.nurse` | `Enfermero(a)` | `Nurse` |

  (FR-011, SC-006) (frontend-dev)
- [ ] T009 [P] [TS-06] Create `frontend/src/auth/session.js`. Top comment: "Browser session (TS-06): token + user in sessionStorage['pdm.session'] (one tab), with an in-memory copy for blocked storage." It contains:
  - `export const SESSION_KEY = 'pdm.session'` and `let memory = null`.
  - `function isValid(s)`: `s` is an object, `s.token` is a non-empty string, and `s.user` is an object whose `username`, `full_name` and `role` are non-empty strings.
  - `export function getSession()`:
    - Inside `try`, read `window.sessionStorage.getItem(SESSION_KEY)`. If it is non-null, `JSON.parse` it; if valid, return it. If invalid or unparsable, remove the item (inside `try`) and set `memory = null`.
    - Storage that throws is ignored.
    - Finally return `isValid(memory) ? memory : null`. It never throws.
  - `export function saveSession(s)`: sets `memory = s`, then `try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)) } catch {}`.
  - `export function clearSession()`: sets `memory = null`, then `try { sessionStorage.removeItem(SESSION_KEY) } catch {}`.

  No visible text (data-model "Browser session", research R9) (frontend-dev)
- [ ] T010 [TS-06] Edit `frontend/src/api/client.js`, which depends on T009. Keep `API_BASE_URL`, `REQUEST_TIMEOUT_MS` and `getHealth()` exactly as they are. Add:
  - `export class ApiError extends Error { constructor(status) { super(\`HTTP ${status}\`); this.name = 'ApiError'; this.status = status } }`.
  - `let unauthorizedHandler = null` and `export function onUnauthorized(handler) { unauthorizedHandler = handler; return () => { if (unauthorizedHandler === handler) unauthorizedHandler = null } }`.
  - `async function request(method, path, { body, token } = {})`:
    - `const stored = getSession()?.token`, `const usedStoredToken = !token && !!stored`, `const bearer = token ?? stored`.
    - Build `headers`: add `Authorization: \`Bearer ${bearer}\`` only if `bearer`, and `'Content-Type': 'application/json'` only if `body !== undefined`.
    - Set up the `AbortController` + `setTimeout(REQUEST_TIMEOUT_MS)` as in the current `apiGet`, then call `fetch(API_BASE_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal })`.
    - If `response.status === 401 && usedStoredToken`, call `clearSession()` and `unauthorizedHandler?.()`.
    - If `!response.ok`, `throw new ApiError(response.status)`.
    - Return `await response.json()`, then `clearTimeout` in `finally`.
  - Rewrite `export async function apiGet(path, options)` as `request('GET', path, options)`.
  - `export async function apiPost(path, body, options)` → `request('POST', path, { ...options, body })`.
  - `export async function login(username, password)` → `apiPost('/auth/login', { username, password })`.
  - `export async function getMe(token)` → `apiGet('/me', token ? { token } : undefined)`.
  - The token never goes in the URL. Update the top comment to mention TS-06 (contracts/auth-ui.md "API client", research R9) (frontend-dev)
- [ ] T011 [TS-06] Create `frontend/src/auth/AuthContext.jsx`, which depends on T009 and T010. Top comment: "Signed-in user (TS-06): React Context with { user, signIn, signOut, sessionExpired }." It contains:
  - `const AuthContext = createContext(null)`.
  - `export function AuthProvider({ children })` with `const [user, setUser] = useState(() => getSession()?.user ?? null)` and `const [sessionExpired, setSessionExpired] = useState(false)`.
  - `useEffect(() => onUnauthorized(() => { setUser(null); setSessionExpired(true) }), [])`.
  - A second `useEffect(..., [])` that runs once:
    - If `getSession()` exists, call `getMe()`.
    - On success, update the stored session with the fresh user (`saveSession({ ...getSession(), user: me })`, only if a session still exists) and `setUser(me)`.
    - On error, do nothing: a 401 is already handled by the handler, and network errors keep the stored user. Use a `cancelled` flag as in `StartPage`.
  - `const signIn = useCallback(async (username, password) => { const { access_token } = await login(username, password); const me = await getMe(access_token); saveSession({ token: access_token, user: me }); setUser(me); setSessionExpired(false) }, [])`. Errors propagate.
  - `const signOut = useCallback(() => { clearSession(); setUser(null); setSessionExpired(false) }, [])`.
  - Provide `useMemo(() => ({ user, signIn, signOut, sessionExpired }), [...])`.
  - `export function useAuth()` throws `new Error('useAuth must be used inside AuthProvider')` when the context is `null`.

  No visible text (FR-012, FR-013, contracts/auth-ui.md "AuthContext") (frontend-dev)
- [ ] T012 [TS-06] Create `frontend/src/LoginPage.jsx`, which depends on T008 and T011. Top comment: "Login page (TS-06), shown inside AppShell while signed out. All texts from src/i18n/translations.js." It contains:
  - State: `username`, `password`, `submitting` (false) and `errorKey` (null).
  - `const { signIn, sessionExpired } = useAuth()` and `const { t } = useLanguage()`.
  - `shownKey = errorKey ?? (sessionExpired ? 'login.sessionExpired' : null)`.
  - `async function onSubmit(event)`:
    - Call `event.preventDefault()`, and return early if `submitting`.
    - Set `setSubmitting(true)` and `setErrorKey(null)`, then `try { await signIn(username, password) }`.
    - `catch (err)`: if `err instanceof ApiError && err.status === 401`, set `setErrorKey('login.invalidCredentials')` and `setPassword('')`; otherwise set `setErrorKey('login.unreachable')`.
    - `finally`: set `setSubmitting(false)`. Guard the state updates after unmount: on success the component unmounts, so use a mounted ref.
  - Markup:
    - `<main>` with `<h1>{t('app.title')}</h1>` and `<h2>{t('login.title')}</h2>`.
    - `<form className="login-form" onSubmit={onSubmit} noValidate={false}>` containing:
      - `<label htmlFor="login-username">{t('login.username')}</label>` and `<input id="login-username" name="username" autoComplete="username" maxLength={50} required value={username} onChange=...>`;
      - the same for the password, with `type="password"`, `autoComplete="current-password"` and `maxLength={128}`;
      - `{shownKey && <p role="alert">{t(shownKey)}</p>}`;
      - `<button type="submit" disabled={submitting}>{t(submitting ? 'login.submitting' : 'login.submit')}</button>`.
  - No visible text written directly (FR-011, AC7, AC8, contracts/auth-ui.md "LoginPage") (frontend-dev)
- [ ] T013 [TS-06] Create `frontend/src/auth/RequireAuth.jsx`, which depends on T011 and T012. Top comment: "Guard for protected screens (TS-06): wrap every clinical screen in <RequireAuth>; signed out shows the login page." It exports `export default function RequireAuth({ children }) { const { user } = useAuth(); return user ? children : <LoginPage /> }` (FR-011, FR-014) (frontend-dev)
- [ ] T014 [TS-06] Edit `frontend/src/components/AppShell.jsx`, which depends on T008 and T011. Use `const { user, signOut } = useAuth()`. Inside `<header className="app-header">`, between the disclaimer `<p>` and the language-switch `<div>`, render `{user && (...)}` as `<div className="user-block" role="group" aria-label={t('auth.signedInAs')}>` containing:
  - `<span className="user-name">{user.full_name}</span>`
  - `<span className="user-role">{t('role.' + user.role)}</span>`
  - `<button type="button" onClick={signOut}>{t('auth.logout')}</button>`

  Keep the disclaimer and the switch exactly as in TS-05, still with no close/hide control (FR-012, AC8, contracts/auth-ui.md "Screen structure") (frontend-dev)
- [ ] T015 [TS-06] Edit `frontend/src/App.jsx`, which depends on T011, T013 and T014. Return `<LanguageProvider><AuthProvider><AppShell><RequireAuth><StartPage /></RequireAuth></AppShell></AuthProvider></LanguageProvider>`, and update the top comment to mention TS-06. Keep the default export `App` and `import './App.css'`. `StartPage.jsx` is unchanged, so `/health` is called only when signed in (FR-011, AC7) (frontend-dev)
- [ ] T016 [P] [TS-06] Edit `frontend/src/App.css`, keeping all existing rules. Add:
  - `.user-block { display: flex; gap: 0.5rem; align-items: center; }`
  - `.user-name { font-weight: 600; }`
  - `.user-block button, .login-form button { font: inherit; padding: 0.25rem 0.6rem; cursor: pointer; }`
  - `.login-form { display: grid; gap: 0.5rem; max-width: 20rem; }`
  - `.login-form input { font: inherit; padding: 0.3rem; }`
  - `.login-form [role="alert"] { margin: 0; color: #a40000; }`

  (plan "Design notes") (frontend-dev)
- [ ] T017 [P] [TS-06] Edit `frontend/README.md`: add a section `## Sign-in` after "How to add or change texts". It covers:
  - Signed out, the app shows the login page inside `AppShell`. The demo users come from the backend command (link `backend/README.md#authentication`).
  - The session is kept in `sessionStorage['pdm.session']` (one tab; a reload keeps it, closing the tab signs out; no cookies). Logout clears it, and a 401 from the backend signs out with "session ended".
  - `src/api/client.js` adds `Authorization: Bearer <token>` automatically. Screens never handle the token and must call the backend only through the client.
  - To add a protected screen, render it inside `<RequireAuth>` (from `src/auth/RequireAuth.jsx`), and get the user with `useAuth()`.
  - Roles are shown with the `role.*` texts.
  - In "What the start page shows", add one sentence: it is shown only after signing in, with the name, role and logout in the header (FR-016, AC12) (frontend-dev)

### Tests

- [ ] T018 [TS-06] Edit `backend/tests/conftest.py` and `backend/tests/test_cors.py`, which depend on T005.
  - **In `conftest.py`**, next to the existing `os.environ["CORS_ORIGINS"] = ""` and **before** `import app.main`, add:
    - `os.environ["AUTH_SECRET"] = "test-only-secret-not-for-real-use-0123456789"`
    - `os.environ["ACCESS_TOKEN_MINUTES"] = ""`
    - `os.environ["DEMO_DOCTOR_PASSWORD"] = ""`
    - `os.environ["DEMO_NURSE_PASSWORD"] = ""`

    Add a comment explaining that python-dotenv (`override=False`) can't replace these, so a developer's `.env` never changes the tests (TS-06 FR-018, research R7). Export the value as `TEST_AUTH_SECRET` (a module constant).
  - **In `test_cors.py`**:
    - In `test_wildcard_stops_startup`, set `env["AUTH_SECRET"] = "test-only-secret-not-for-real-use-0123456789"` and `env["ACCESS_TOKEN_MINUTES"] = ""` before `subprocess.run`. Add a docstring line: the subprocess still fails only because of `*` (FR-018).
    - Add `test_preflight_post_with_authorization_allowed`: `client.options("/auth/login", headers={"Origin": DEFAULT_ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization, content-type"})` → 200. `access-control-allow-origin` equals `DEFAULT_ORIGIN`, `access-control-allow-headers` (lower-cased) contains `authorization` and `content-type`, and `access-control-allow-credentials` is not `true`.
    - Add `test_preflight_other_origin_not_allowed`: the same request from `http://evil.example` → no `access-control-allow-origin`.
    - Add `test_preflight_delete_not_allowed`: from the default origin with `Access-Control-Request-Method: DELETE` → status 400, and `DELETE` is not in `access-control-allow-methods`.

    Each test docstring cites TS-06 AC10/FR-010. Keep every existing test unchanged otherwise. (qa-tester)
- [ ] T019 [P] [TS-06] Create `backend/tests/test_passwords.py`, which depends on T003. Top docstring cites TS-06 FR-001 and research R1. Tests:
  - `test_hash_format`: `hash_password("correct horse")` splits into 4 parts, `parts[0] == "pbkdf2_sha256"` and `parts[1] == "600000"`. Salt decodes to 16 bytes, hash to 32 bytes, and `len(stored) <= 255`.
  - `test_verify_correct_and_wrong`: with `iterations=1000`, `True` for the right password and `False` for a wrong one and for `""`.
  - `test_unique_salts`: two hashes of the same password differ.
  - `test_plain_password_not_in_hash`.
  - `test_verify_uses_stored_iterations`: a hash made with `iterations=1000` verifies.
  - `@pytest.mark.parametrize` `test_malformed_hash_is_false` over `""`, `"plain"`, `"md5$1$a$b"`, `"pbkdf2_sha256$x$a$b"`, `"pbkdf2_sha256$0$AA==$AA=="`, `"pbkdf2_sha256$1000$!!$AA=="`, `"pbkdf2_sha256$1000$AA=="` → `verify_password("pw", value) is False` with no exception.

  (qa-tester)
- [ ] T020 [P] [TS-06] Create `backend/tests/test_auth.py`, which depends on T004, T005 and T018. Top docstring cites TS-06 AC2–AC6, AC11, FR-003–FR-009 and [contracts/auth-api.md](../../specs/006-authentication/contracts/auth-api.md). Synthetic data only.

  **Helpers**:
  - `FakeUserLookup` holds `User(id=1, username="demo.doctor", full_name="Dra. Ana Demo", role="doctor", password_hash=hash_password("doctor-pass-1", iterations=1000))` and `User(id=2, username="demo.nurse", full_name="Enf. Luis Demo", role="nurse", password_hash=hash_password("nurse-pass-1", iterations=1000))`, with `by_username` / `by_id` over a dict.
  - A fixture `fake_users` sets `app.main.app.dependency_overrides[app.auth.get_user_lookup] = lambda: lookup` and returns it.
  - `client = TestClient(app.main.app)`.

  **Settings** (unit tests on `load_auth_settings`):
  - Missing, `""`, `"   "` and a 31-character secret raise `RuntimeError` with exactly the fixed message, and the message doesn't contain the given value.
  - A 32-character secret is accepted, and the default minutes are 480.
  - `"60"` gives 60.
  - `"0"`, `"1441"`, `"-5"`, `"abc"` and `"1.5"` raise the fixed minutes message.

  **Startup** (subprocess, as in `test_cors.py`):
  - `test_missing_secret_stops_startup`: `env["AUTH_SECRET"] = ""`, `CORS_ORIGINS=""`, no `DATABASE_URL` → `import app.main` exits non-zero, and stderr contains the fixed message.
  - `test_short_secret_value_not_printed`: `AUTH_SECRET="short-secret-value"` → non-zero, and `"short-secret-value"` is not in stderr or stdout (AC6).

  **Login**:
  - `test_login_success`: 200, the keys are exactly `access_token`, `token_type`, `expires_in`, with `token_type == "bearer"` and `expires_in == 28800`. Decoding with `jwt.decode(..., TEST_AUTH_SECRET, algorithms=["HS256"])` gives `sub == "1"`, `exp - iat == 28800` (AC2).
  - `test_unknown_user_and_wrong_password_identical`: both are 401. `response.content` is byte-identical and equals `{"detail":"Incorrect username or password"}`, and `www-authenticate == "Bearer"` (AC3, SC-003).
  - `test_unknown_user_checks_dummy_hash`: monkeypatch `app.auth.verify_password` with a spy and check it is called once for an unknown username (FR-004).
  - `test_username_exact_match`: `"Demo.Doctor"` and `" demo.doctor"` → 401.
  - `@pytest.mark.parametrize` `test_login_invalid_input_422` over: a missing password, `username=""`, `password=""`, a 51-character username, a 129-character password, `password=123` and a non-JSON body. Each gives 422, and the response text contains neither the submitted password value nor `"input"` (AC3, research R6).
  - `test_login_without_database_503`: no override and no `DATABASE_URL` (conftest) → 503 `{"detail":"Service unavailable"}`.
  - `test_db_error_gives_503`: `DbUserLookup(session)` with a fake session whose `scalars` raises `OperationalError("x", {}, Exception())` → `by_username` raises an `HTTPException` with status 503.

  **/me** (AC4, SC-002):
  - `test_me_valid_token`: 200, exactly `{"username": "demo.nurse", "full_name": "Enf. Luis Demo", "role": "nurse"}`.
  - `@pytest.mark.parametrize` `test_me_rejected` over these headers. Each gives 401 `{"detail":"Not authenticated"}` with `www-authenticate == "Bearer"`:
    - none;
    - `Authorization: Basic abc`;
    - `Authorization: Bearer`;
    - `Bearer not-a-jwt`;
    - a token signed with `"another-secret-for-tests-only-0123456789"`;
    - a tampered token (valid token with the payload segment replaced by base64url of `{"sub":"2",...}`);
    - an expired token from `create_access_token(1, now=datetime.now(timezone.utc) - timedelta(days=2))`;
    - a token without `exp` (`jwt.encode({"sub": "1", "iat": ...}, TEST_AUTH_SECRET)`);
    - `sub: "abc"`;
    - an `alg: none` token.
  - `test_me_deleted_account`: a valid token for id 99 → 401.
  - `test_me_bad_token_does_not_touch_database`: the override's `by_id` spy is not called for a bad token.
  - `test_me_valid_token_without_database_503`: no override → 503.

  **Health and leaks**:
  - `test_health_still_public`: override `check_database` → 200 `{"status": "ok", ...}` without a token (AC5).
  - `test_no_secret_in_responses`: `TEST_AUTH_SECRET` doesn't appear in any response body from the tests above (sample login ok/401 and `/me` 401).

  (qa-tester)
- [ ] T021 [P] [TS-06] Create `backend/tests/test_seed_demo_users.py`, which depends on T006. Top docstring cites TS-06 AC1, FR-002 and contracts "Demo-user command". Use an in-memory SQLite engine fixture: `create_engine("sqlite://")`, then `Base.metadata.create_all(engine, tables=[User.__table__])`. Tests:
  - `test_read_passwords_ok`.
  - `test_read_passwords_missing_and_short`: `{"DEMO_DOCTOR_PASSWORD": "short"}` gives two errors that name the variables and don't contain `"short"`.
  - `test_upsert_creates_then_updates`:
    - The first run gives `[("created", "demo.doctor"), ("created", "demo.nurse")]` and 2 rows.
    - Each `password_hash` starts with `pbkdf2_sha256$`, verifies with the given password, and doesn't contain it.
    - The second run with new passwords gives `updated` for both, still 2 rows, and the new passwords verify.
  - `test_upsert_resets_name_and_role`.
  - `test_main_missing_password_touches_nothing`: monkeypatch `app.seed_demo_users.get_engine` to raise `AssertionError` → `main({...})` returns 1, and stderr names the variable.
  - `test_main_without_database_url`: valid passwords and no `DATABASE_URL` → 1 and `DATABASE_URL is not set`.
  - `test_main_success_output`: monkeypatch `database_url` to return `"sqlite://"` and `get_engine` to return the SQLite engine. `main` returns 0, and stdout is exactly `created: demo.doctor\ncreated: demo.nurse\n`. Neither password and no `pbkdf2` text appears in stdout or stderr.
  - `test_main_db_error`: `get_engine` returns an engine whose connect fails → 1 and `Could not update the demo users (`.

  Use `capsys` for the output (qa-tester)
- [ ] T022 [P] [TS-06] Create `frontend/src/testing/fakeBackend.js`, which depends on T009. Top comment: "Test helpers (TS-06): fetch mock routed by URL, and a signed-in session. Synthetic data only." It exports:
  - `jsonResponse(body, status = 200)`, the same shape as the TS-04 tests.
  - `DOCTOR = { username: 'demo.doctor', full_name: 'Dra. Ana Demo', role: 'doctor' }` and `NURSE = { username: 'demo.nurse', full_name: 'Enf. Luis Demo', role: 'nurse' }`.
  - `signInForTest(user = DOCTOR, token = 'test-token')`, which calls `saveSession({ token, user })`. This also sets the in-memory copy, so blocked storage still works.
  - `resetSession()`, which calls `clearSession()` and `sessionStorage.clear()` inside `try`.
  - `stubBackend({ health, me, login } = {})`:
    - It creates `vi.fn(async (url, options) => ...)` and routes by `new URL(url).pathname`: `/health` → `health ?? (async () => jsonResponse({ status: 'ok', version: '0.1.0', database: 'ok' }))`, `/me` → `me ?? (async () => jsonResponse(DOCTOR))`, `/auth/login` → `login ?? (async () => jsonResponse({ access_token: 'test-token', token_type: 'bearer', expires_in: 28800 }))`. Each is called with `(url, options)`; any other path → `jsonResponse({}, 404)`.
    - It calls `vi.stubGlobal('fetch', mock)` and returns the mock.
  - `callsTo(mock, path)` returns the calls whose pathname equals `path`.

  (qa-tester)
- [ ] T023 [TS-06] Update `frontend/src/App.test.jsx` and `frontend/src/i18n/language.test.jsx`, which depend on T015 and T022. They are changed **only** so they start signed in (FR-018):
  - Add `beforeEach(() => signInForTest())` and `afterEach(resetSession)`.
  - Replace each `vi.stubGlobal('fetch', vi.fn(impl))` with `stubBackend({ health: impl })`; the `/me` answer is the default doctor.
  - Replace each `expect(fetchMock).toHaveBeenCalledTimes(1)` with `expect(callsTo(fetchMock, '/health')).toHaveLength(1)`.
  - Keep every test name, rendered-text check and timing check as it is.
  - **Only one expectation changes**, in `AC6 banner cannot be dismissed`. The buttons are now `Cerrar sesión`, `Español` and `English` (logout is not a close control for the banner). Assert the accessible names, using `aria-label ?? textContent`, equal `['Cerrar sesión', 'Español', 'English']`, and add a comment citing TS-06.
  - In `AC4 blocked storage still works`, keep the `Storage.prototype` spies. `signInForTest` runs before the spies, so the in-memory copy keeps the user signed in.

  Run `npm test` after editing: every test in both files passes (qa-tester)
- [ ] T024 [P] [TS-06] Edit `frontend/src/api/client.test.js`, which depends on T010 and T022. Keep the existing five tests and add `afterEach(resetSession)`. Each new test name cites TS-06. Tests:
  - `FR-012 no Authorization header without a session`: `getHealth()` → the fetch options have no `Authorization` header.
  - `FR-012 apiGet adds the stored token`: `signInForTest()` → `headers.Authorization === 'Bearer test-token'`, and the URL has no token.
  - `apiPost sends JSON`: method `POST`, `Content-Type: application/json`, and the body equals `JSON.stringify({ a: 1 })`.
  - `login sends credentials without Authorization`: `/auth/login` POST with `{ username, password }` and no `Authorization`.
  - `getMe(token) uses the given token`.
  - `AC9 401 with the stored token clears the session and calls the handler`: register `onUnauthorized(spy)`, `signInForTest()`, `/me` → 401. It rejects with `ApiError`, `status === 401`, `getSession() === null` and the spy is called once.
  - `login 401 does not call the handler`: no session, login → 401. It rejects with an `ApiError` of status 401, and the spy is not called.
  - `ApiError message has no response text`: `message === 'HTTP 500'`.
  - `onUnauthorized returns an unsubscribe function`.

  (qa-tester)
- [ ] T025 [P] [TS-06] Create `frontend/src/auth/auth.test.jsx`, which depends on T008–T016 and T022. Top comment cites TS-06 AC7–AC9, FR-011–FR-014 and [contracts/auth-ui.md](../../../specs/006-authentication/contracts/auth-ui.md).
  - Render `<App />`. Use `fireEvent.change` on `getByLabelText('Usuario')` / `getByLabelText('Contraseña')` and `fireEvent.click` on the submit button (no new dependency).
  - `beforeEach`: `resetSession()` and `localStorage.clear()`. `afterEach`: `resetSession()`, `localStorage.clear()`, `vi.restoreAllMocks()`, `vi.unstubAllGlobals()` and `document.documentElement.lang = 'es'`.

  Tests:
  - `AC7 signed out shows the login page and no clinical content`: `stubBackend()`. The headings `Iniciar sesión` and `Monitor de Deterioro del Paciente` are shown, along with the Spanish banner and the ES/EN switch. There is no `Cerrar sesión` button and no `API: funcionando`, and `fetch` is not called at all.
  - `AC7 login page in English`: click EN → `Sign in` heading, `Username` / `Password` labels and the `Sign in` button.
  - `AC8 successful sign-in as the doctor`:
    - Fill in and submit. The login call is POST `/auth/login` with body `{"username":"demo.doctor","password":"pw-123456"}` and no `Authorization`.
    - Then `/me` is called with `Authorization: Bearer test-token`.
    - Then `Dra. Ana Demo`, `Médico`, a `Cerrar sesión` button and `API: funcionando` are shown, and `/health` is called once.
    - `JSON.parse(sessionStorage.getItem('pdm.session'))` equals `{ token: 'test-token', user: DOCTOR }`.
    - Click EN → `Doctor` and `Sign out`.
  - `AC8 nurse role is translated`: `me` returns `NURSE` → `Enfermero(a)`, and EN → `Nurse`.
  - `AC8 wrong credentials`: `login` returns 401 → the alert is `Usuario o contraseña incorrectos.`, the username input keeps its value and the password input is `''`. Click EN → `Incorrect username or password.`, and the username is still kept.
  - `AC8 server unreachable`: `login` rejects with `TypeError` → `No se puede conectar con el servidor. Inténtalo de nuevo.`, and EN → `Cannot connect to the server. Please try again.` A 503 gives the same message.
  - `edge case: double submit sends one request`: `login` returns a pending promise. Click submit twice → the button is disabled with `Entrando…`, and `callsTo(mock, '/auth/login')` has length 1.
  - `AC9 logout`: `signInForTest()`, render, click `Cerrar sesión` → the login page is shown, `sessionStorage.getItem('pdm.session') === null` and there is no `login.sessionExpired` text. If English was selected before, it stays English.
  - `AC9 reload keeps the session`: `signInForTest()` → render shows `Dra. Ana Demo` without the login page, and `/me` is called once with `Bearer test-token`.
  - `AC9 stored session rejected shows session expired`: `signInForTest()`, and `me` returns 401 → the login page with `Tu sesión ha terminado. Inicia sesión de nuevo.`, and the session is cleared. EN → `Your session has ended. Please sign in again.`
  - `edge case: corrupted stored session is signed out`: `sessionStorage.setItem('pdm.session', '{bad')` → the login page with no error and no expired message.
  - `edge case: blocked storage still signs in`: `Storage.prototype` `getItem` / `setItem` / `removeItem` throw → render shows the login page with no error. Signing in shows `Dra. Ana Demo`.
  - `edge case: network error on the /me check keeps the user`: `signInForTest()`, and `me` rejects → `Dra. Ana Demo` is still shown.

  (qa-tester)

### Checks and review

- [ ] T026 [TS-06] Run the checks, which depend on T001–T025. In `backend/`, run `python -m pytest`: everything passes, including the unchanged `test_health.py`, `test_db.py`, `test_models.py`, `test_migrations.py` and the updated `test_cors.py`, in under 30 s (SC-007). In `frontend/`, run `npm test` (everything passes, under 30 s) and `npm run build` (no errors). Keep all three outputs for the PR (D-27). Also confirm:
  - `git diff --stat main -- backend/migrations backend/app/models.py frontend/package.json frontend/package-lock.json frontend/src/StartPage.jsx` is empty (no migration, no new frontend dependency, `StartPage` unchanged).
  - `git diff main -- backend/requirements.txt` adds only `PyJWT==2.15.1`.
  - A Grep search of the repository (excluding `.venv`, `node_modules`, `dist`) finds no real-looking secret: `AUTH_SECRET=` only with a placeholder in `.env.example` and docs, and the only test secret is `test-only-secret-not-for-real-use-0123456789` and `another-secret-for-tests-only-0123456789` (SC-004).
  - A Grep of `frontend/src` `.jsx` files (excluding tests and `translations.js`) for `>[^<{}\s][^<{}]*<` finds no visible text (TS-05 SC-003).

  If a check fails, fix it in the owning task (qa-tester)
- [ ] T027 [TS-06] Review these files read-only: `backend/app/passwords.py`, `backend/app/auth.py`, `backend/app/seed_demo_users.py`, `backend/app/main.py`, `backend/.env.example`, `backend/requirements.txt`, `frontend/src/auth/*`, `frontend/src/api/client.js`, `frontend/src/LoginPage.jsx`, `frontend/src/components/AppShell.jsx`, and both READMEs. Check:
  - PBKDF2 parameters, and the constant-time compare;
  - the dummy-hash path for unknown users;
  - identical 401 bodies;
  - the JWT algorithm pinned on decode, required claims and no leeway;
  - the secret length check, and no value in messages or logs;
  - no password, hash, token or secret is logged, printed or returned;
  - the 422 handler drops `input`/`ctx`;
  - CORS: explicit origins, `GET`/`POST` only, two headers, no credentials;
  - the token goes only in the `Authorization` header (never the URL or a cookie), and `sessionStorage` is guarded;
  - React text rendering only (no `dangerouslySetInnerHTML`);
  - PyJWT is pinned and pure Python;
  - the seed command touches nothing on bad input.

  Record accepted risks: stateless logout, no rate limiting (TS-10), and tokens readable by page scripts in `sessionStorage`. Report findings; don't change code (constitution VI, VIII) (security-reviewer)
- [ ] T028 [TS-06] Run the manual checks in [quickstart.md](quickstart.md), steps 2 (Neon) and 3 (browser), after T026. They need a human with a browser and a real `backend/.env`. If the agent can't do a step, report it as **pending for the user** with the exact commands, and don't mark it done. Record one line per step (2.1–2.5, 3.1–3.10) for the PR, without any secret, password, token or connection string (AC1, AC6–AC10, SC-001, FR-016) (orchestrator)

**Checkpoint**: TS-06 is complete. Every later clinical endpoint uses `Depends(get_current_user)`, and every clinical screen is rendered inside `<RequireAuth>`.

---

## Phase 4: Polish

- [ ] T029 [P] Edit `DEVELOPMENT.md` "Run the app locally". Before "Terminal 1", add a one-time step: copy `backend/.env.example` to `backend/.env`, then set `AUTH_SECRET` (generation command), `DEMO_DOCTOR_PASSWORD` and `DEMO_NURSE_PASSWORD`, and run `python -m app.seed_demo_users` after `alembic upgrade head`. After "Then open http://localhost:5173", add: sign in as `demo.doctor` or `demo.nurse` with the password from your `.env`. Add one bullet linking `backend/README.md#authentication`. In "Never commit", make sure `backend/.env` is listed (orchestrator)
- [ ] T030 Edit the project docs, after T026–T029:
  - **`docs/PROJECT_STATUS.md`**:
    - Set "Last updated" to the current date. In step 11's notes, mark TS-06 ✅ and set "Next: TS-07 (scoring module)"; set "Next step" to match.
    - Rewrite the "Where we left off" note: TS-06 is done (`/auth/login`, `/me`, `get_current_user`, `RequireAuth`, `sessionStorage['pdm.session']`, demo users created with `python -m app.seed_demo_users`), plus the local `pytest`/`npm test` results and the manual check results (or that they are pending for the user).
    - Say that teammates must run `pip install -r requirements.txt` (PyJWT) and add `AUTH_SECRET` and the demo passwords to `backend/.env`.
    - Replace the TS-06 note in "Notes for later stories" with: clinical endpoints use `Depends(get_current_user)` and screens use `<RequireAuth>`; TS-09/TS-10 set `AUTH_SECRET` as a GitHub/Azure secret; TS-10 adds login rate limiting.
  - **`docs/BACKLOG.md`**: link `specs/006-authentication` in TS-06's Spec column. Set Status ✅ only when the PR is merged.
  - **`docs/DECISIONS.md`**: add **D-35** after D-34 (today's date, Status "Active"), with the decision, reasons and rejected options as written in [plan.md](plan.md) "Decision to record (D-35)".

  (orchestrator)

---

## Dependencies & Execution Order

- **Setup**: T001 (PyJWT) is needed before T004. T002 has no dependencies.
- **Backend**: T003 has no dependencies. T004 depends on T001 and T003. T005 depends on T004. T006 depends on T003 (it can run in parallel with T004/T005). T007 has no code dependency.
- **Frontend**: T008 and T009 have no dependencies. T010 depends on T009. T011 depends on T009 and T010. T012 depends on T008 and T011. T013 depends on T011 and T012. T014 depends on T008 and T011. T015 depends on T011, T013 and T014. T016 and T017 have no dependencies.
- **Tests**:
  - T018 depends on T005. T019 depends on T003. T020 depends on T004, T005 and T018. T021 depends on T006.
  - T022 depends on T009. T023 depends on T015 and T022. T024 depends on T010 and T022. T025 depends on T008–T016 and T022.
- **Checks**: T026 depends on all of T001–T025. T027 depends on T026. T028 depends on T026 (human).
- **Polish**: T029 can run any time after T006. T030 runs last.
- **Story dependencies**: TS-03 and TS-04 (merged), plus the TS-05 frame (merged), per `docs/BACKLOG.md`.

## Parallel Example

```text
# Round 1:
backend-dev:  T001 (PyJWT), T002 (.env.example), T003 (passwords.py), T007 (backend README)
frontend-dev: T008 (texts), T009 (session.js), T016 (CSS), T017 (frontend README)

# Round 2:
backend-dev:  T004 (auth.py) → T005 (main.py); T006 (seed) in parallel
frontend-dev: T010 (client.js) → T011 (AuthContext) → T012 (LoginPage), T014 (AppShell) → T013 → T015

# Round 3 (qa-tester), in parallel after their dependencies:
T018 → T020; T019; T021; T022 → T023, T024, T025

# Round 4: T026 → T027 (security-reviewer) and T028 (human) → T029, T030 (orchestrator)
```

## Implementation Strategy

TS-06 is the whole MVP:

1. The backend first: T001–T007. These tasks can be checked on their own with `/docs` and pytest.
2. Then the frontend: T008–T017.
3. Then the tests (T018–T025), the checks (T026), the review (T027) and the manual checks (T028).
4. Then the docs (T029–T030).

After T030, commit (`TS-06: authentication`), push and open the PR. Until TS-09 adds CI, paste the local `python -m pytest`, `npm test` and `npm run build` output and the manual check results into the PR description (D-27). The PR also includes the agent activity log (`specs/006-authentication/agent-log.csv`, written through `scripts/log-agent.ps1`).

## Notes

- The orchestrator assigns each task to its agent and logs `assigned` / `started` / `done` rows (see `docs/agents.md`).
- Testing runs after implementation, as the project template orders it (qa-tester, then security-reviewer). It doesn't use test-first order.
- Do not add anything not listed here (Principle XII): no registration, password reset, roles-based permissions, lockout, rate limiting, refresh tokens, cookies, router, state library, settings library, new migration or new frontend dependency.
