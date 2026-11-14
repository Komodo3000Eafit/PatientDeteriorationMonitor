# Quickstart: Authentication (TS-06)

How to prove the story works: automated tests first, then a one-time manual check against Neon and in the browser. Record the results in the PR (D-27). The behaviours checked here are defined in [contracts/auth-api.md](contracts/auth-api.md) and [contracts/auth-ui.md](contracts/auth-ui.md).

Never paste `backend/.env`, a password, a token or `DATABASE_URL` in the PR or a chat.

## 0. One-time setup (each developer)

From `backend/` with the virtual environment active:

```powershell
python -m pip install -r requirements.txt          # adds PyJWT (pure Python)
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Add these lines to `backend/.env`, which is git-ignored (see `backend/.env.example`):

```text
AUTH_SECRET=<the printed value>
ACCESS_TOKEN_MINUTES=480
DEMO_DOCTOR_PASSWORD=<choose one, at least 8 characters>
DEMO_NURSE_PASSWORD=<choose another, at least 8 characters>
```

## 1. Automated tests (no database, no network)

```powershell
cd backend;  python -m pytest      # all pass, incl. TS-02/03/04 tests and the '*' subprocess test
cd ../frontend;  npm test          # all pass, incl. TS-04/TS-05 tests
```

Expected: no failures in either suite, and each runs in under 30 s (SC-007). Paste both summaries in the PR.

## 2. Manual check on Neon (once)

1. Run `python -m app.seed_demo_users` from `backend/`. Expected output: `created: demo.doctor` and `created: demo.nurse`.
2. Run it again. Expected: `updated: ...` for both, and still exactly 2 rows in `users`. Check with Neon **Tables** or the Neon MCP `run_sql` tool (`SELECT username, role, left(password_hash, 14) FROM users`). Each hash must start with `pbkdf2_sha256$`, and no plain password may appear anywhere.
3. Temporarily remove `DEMO_NURSE_PASSWORD` from `backend/.env` and run the command. Expected: `DEMO_NURSE_PASSWORD must be set to at least 8 characters`, exit code 1, and no change in the database. Then put it back.
4. Start the backend: `python -m uvicorn app.main:app --port 8000`. Then remove `AUTH_SECRET` from `.env` and start it again. Expected: it stops with the fixed message, and no value is shown. Then restore the secret.
5. Open `http://localhost:8000/docs` and run these:
   - `POST /auth/login` with the nurse's credentials → 200 with a token.
   - A wrong password, then an unknown username → the same 401 body for both.
   - `GET /me` with **Authorize** set to the token → 200 with `demo.nurse`, `Enf. Luis Demo`, `nurse`.
   - `GET /me` without a token → 401.
   - `GET /health` → unchanged.

## 3. Manual check in the browser (once)

With the backend running, start the frontend: `cd frontend; npm run dev`. Then open `http://localhost:5173`.

1. **Login page.** You see it with the banner and the ES/EN switch, all in Spanish, and no server status. DevTools → Network shows no `/health` request.
2. **Wrong password.** Expected: `Usuario o contraseña incorrectos.`, the username is kept and the password field is cleared. Switch to EN: the message becomes `Incorrect username or password.`
3. **Sign in as the doctor.** Within 2 s of clicking the button (SC-005), the start page shows the server status. The header shows `Dra. Ana Demo`, `Médico` (EN: `Doctor`) and a logout button.
4. **Reload.** You are still signed in. Network shows one `/me` and one `/health` request, both carrying `Authorization: Bearer …`. There are no cookies under DevTools → Application.
5. **Logout.** You are back on the login page, and `sessionStorage['pdm.session']` is gone. The language choice is kept.
6. **Sign in as the nurse.** The header shows `Enf. Luis Demo`, `Enfermero(a)` (EN: `Nurse`).
7. **Invalid token.** In DevTools → Application → Session Storage, change one character of the token in `pdm.session`, then reload. Expected: the login page with `Tu sesión ha terminado. Inicia sesión de nuevo.`
8. **Expired token** (optional). Set `ACCESS_TOKEN_MINUTES=1` and restart the backend. Sign in, wait 2 minutes and reload. Expected: the same "session ended" message. Then restore 480.
9. **Backend stopped.** On the login page, submitting shows `No se puede conectar con el servidor. Inténtalo de nuevo.`
10. **New tab.** Close the tab and open the app again. You see the login page (`sessionStorage` is per tab).

Record in the PR: steps 2.1–2.5 and 3.1–3.10 passed (or what failed), with no secrets in the text.
