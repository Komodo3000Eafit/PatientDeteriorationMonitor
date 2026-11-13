# Contract: Health check (TS-02, extends TS-01)

## `GET /health`

- **Auth**: none (public)
- **Request**: no parameters, no body
- **Side effect**: runs one `SELECT 1` against the database per call (no caching). Frequent automatic callers keep Neon awake; see spec Clarifications.

### Response `200 OK` — database reachable

`Content-Type: application/json`

```json
{
  "status": "ok",
  "version": "0.1.0",
  "database": "ok"
}
```

### Response `200 OK` — database unavailable or not configured

```json
{
  "status": "ok",
  "version": "0.1.0",
  "database": "unavailable"
}
```

- The status code is **200 in both cases**: `status` describes the app, `database` the database.
- The body contains exactly these three keys. No connection string, host, user, password, error message or stack trace ever appears.
- `version` is always `app.__version__` (unchanged from TS-01).
- Responds within 6 s even when the database is unreachable (SC-002).

### Other responses (unchanged from TS-01, framework defaults)

| Request | Response |
|---|---|
| `POST`/`PUT`/`DELETE /health` | `405 Method Not Allowed`, body `{"detail": "Method Not Allowed"}` |
| `GET /does-not-exist` | `404 Not Found`, body `{"detail": "Not Found"}` |

### Verified by

- `backend/tests/test_health.py`: AC2 and AC3 at the endpoint (database check overridden to `"ok"` / `"unavailable"`), exact key set, 404/405 edge cases, version.
- `backend/tests/test_db.py`: AC4 (missing URL), AC3/AC5 (connection error → `"unavailable"`, log has no credentials), URL scheme conversion.
