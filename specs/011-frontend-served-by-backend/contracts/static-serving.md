# Contract: Static Serving and SPA Fallback (TS-11)

How the deployed FastAPI app responds to HTTP requests once it serves the React build. Verified by
`backend/tests/test_static_serving.py` and the post-deploy end-to-end check.

## 0. API path layout

All API routes live under `/api`, **except** `/health`:

- `/api/auth/login`, `/api/me`, and every future API route (e.g. `/api/patients`).
- `/health` stays at `/health` (deploy docs and checks use it).
- Browser pages stay at the root: `/login`, `/patients`, `/patients/:identifier` (TS-13).

The auth router is mounted with `prefix="/api"` in `main.py`; its route decorators (`/auth/login`,
`/me`) are unchanged, so the effective paths become `/api/auth/login` and `/api/me`.

## 1. Routing precedence

API routers are registered first; the static assets mount and the SPA catch-all are added after
them. A request resolves to the first match in this order:

1. API route — `/health` or any `/api/...` match → API response (an unknown `/api/...` path → JSON 404).
2. Existing static file under the assets directory → the file.
3. Other GET, no file match, not `/api/...` and not `/health` → `index.html`.
4. Anything else → default 404/405 (no shell).

## 2. Request → response table

| Request | Build present? | Response | Refs |
|---------|----------------|----------|------|
| `GET /` | yes | 200, `Content-Type: text/html`, body is `index.html` shell | FR-002, AC1 |
| `GET /patients/PAT-001` (no such file, not an API route) | yes | 200, `text/html`, `index.html` shell | FR-003, AC2 |
| `GET /assets/<hashed>.js` (exists) | yes | 200, JS content type, the asset bytes | FR-005, AC3 |
| `GET /assets/missing.js` (no such file) | yes | 404 (asset not found), **not** the shell | FR-005, edge case |
| `GET /health` | yes | 200, JSON `{status, version, database}` | FR-004, AC4 |
| `POST /api/auth/login` (valid body) | yes | 200, token JSON (API route under `/api`) | FR-004a, AC9 |
| `GET /api/me` (valid token) | yes | 200, user JSON (API route under `/api`) | FR-004a, AC9 |
| `GET /api/does-not-exist` (unknown path under `/api`) | yes | API JSON 404, **not** the shell | FR-004, AC4 |
| `GET /auth/login` or `GET /me` (old, unprefixed) | yes | SPA shell (it is a non-API GET), **not** the JSON API | FR-004a, AC9, edge case |
| `POST /anything-not-an-api-path` | yes | 404/405, **not** the shell | FR-006, edge case |
| `GET /` | no (local dev) | app still runs; minimal 404/placeholder, no crash | FR-010, edge case |
| `GET /health` | no | 200 JSON (API unaffected) | FR-010 |

## 3. Security headers / CSP (unchanged from TS-10, must still allow the app)

Every response — the shell, assets, API, errors — still carries the TS-10 headers:

```
content-security-policy: default-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'
x-content-type-options: nosniff
x-frame-options: DENY
```

The served build loads under `default-src 'self'` because its scripts/styles are same-origin and
external (no inline). `frame-ancestors`, `base-uri`, `object-src` are preserved. (FR-011, AC8, SC-006.)

## 4. Frontend API base contract

| Condition | `API_BASE_URL` | Effect |
|-----------|----------------|--------|
| `VITE_API_BASE_URL` undefined (local dev, test) | `http://localhost:8000` | cross-origin to local backend; CORS needed locally |
| `VITE_API_BASE_URL` set (any value, incl. empty) | that value, trimmed, no trailing slash | empty ⇒ `''` ⇒ same-origin relative requests in production |

`fetch(API_BASE_URL + path)` with `API_BASE_URL === ''` issues a same-origin request. (FR-007, FR-008, AC5, AC6, SC-004, SC-007.)

The client's API paths use the `/api` prefix: `/api/auth/login`, `/api/me`, future `/api/...`;
`/health` stays `/health`. So in production the calls resolve to `<origin>/api/...`, and locally to
`http://localhost:8000/api/...`. (FR-004a, FR-007, AC9.)
