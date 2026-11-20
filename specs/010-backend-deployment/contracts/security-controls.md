# Contract: Security controls (TS-10)

The three application-code controls added by TS-10. All are testable in the existing CI (FR-014). No input value is ever echoed in an error.

## 1. Login rate limiting — `POST /auth/login`

| Aspect | Rule |
|---|---|
| Key | per client identity (source address), per worker process (in-memory, research R6) |
| Window | fixed window, default 60 s, setting `LOGIN_RATE_WINDOW_SECONDS` |
| Limit | default 10 attempts per window, setting `LOGIN_RATE_LIMIT` |
| Over the limit | HTTP **429** with a fixed message (e.g. `{"detail": "Too many login attempts"}`), no input echoed |
| Within the limit | unchanged TS-06 behaviour: 200 with a token on correct credentials, 401 generic on wrong ones |
| Reset | the counter resets once the window elapses |
| Setting validation | `LOGIN_RATE_LIMIT` and `LOGIN_RATE_WINDOW_SECONDS` are whole numbers ≥ 1; invalid values fail startup with a fixed message (like the other auth settings) |

Behaviour notes:
- The limit counts attempts (both wrong and right) from the same client; a spike of failures from one client is what trips it (AC7, FR-008).
- The limit MUST be per client so one attacker cannot block logins for everyone.
- A `429` MUST NOT reveal whether the username exists.

Tests (qa-tester):
- within the limit, a valid login succeeds and a wrong one returns 401;
- the (limit + 1)-th attempt in the window returns 429;
- after the window passes, a valid login succeeds again;
- two different client identities have independent counters.

## 2. `CORS_ORIGINS` parsing — reject null/malformed entries

Extends `parse_cors_origins` in `app/main.py` (TS-04/D-33).

| Input | Result |
|---|---|
| unset / blank (`""`) | default `["http://localhost:5173"]` |
| `a,,b` (blank between commas) | blanks dropped, `["a","b"]` (after validation) |
| contains `*` | startup fails (existing) |
| `null` | startup fails (new) |
| `http://` (no host), `example.com` (no scheme), other non-`scheme://host[:port]` | startup fails (new) |
| value made only of invalid entries | startup fails (new; no silent fallback) |

Rules:
- A valid origin is `scheme://host` with optional `:port`, scheme `http` or `https`, matching the shape a browser sends in the `Origin` header; a trailing `/` is still stripped (existing).
- The `ValueError` message MUST be fixed text and MUST NOT include the configured value (AC8, FR-009).

Tests (qa-tester): each invalid case above raises `ValueError`; valid single and comma lists parse; the default applies only when unset/blank.

## 3. HTTP security headers — every response

Middleware in `app/security_headers.py`, mounted in `app/main.py`.

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |

Rules:
- Headers MUST be present on every response, including error responses (422, 401, 429, 503) (AC9, FR-010).
- `frame-ancestors 'none'` forbids framing; `X-Frame-Options: DENY` covers older agents.
- The CSP allows same-origin (`'self'`) assets so TS-11's React build is not blocked; a `# TS-11` comment marks where to revisit the policy. This story does NOT serve static files (research R8).

Tests (qa-tester): a normal response (`/health`) and at least one error response (e.g. 401 from `/me` without a token) both carry all three headers with the exact values.
