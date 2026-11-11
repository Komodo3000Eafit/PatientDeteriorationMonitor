# Contract: Health check

## `GET /health`

- **Auth**: none (public)
- **Request**: no parameters, no body

### Response `200 OK`

`Content-Type: application/json`

```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

`version` is always the value of `app.__version__` (see [data-model.md](../data-model.md)).

### Other responses (framework defaults)

| Request | Response |
|---|---|
| `POST`/`PUT`/`DELETE /health` | `405 Method Not Allowed`, body `{"detail": "Method Not Allowed"}` |
| `GET /does-not-exist` | `404 Not Found`, body `{"detail": "Not Found"}` |

Error bodies contain only `detail`: no stack traces or internal information.

### Verified by

`backend/tests/test_health.py`: AC1 (status and body), AC4 (version equals `app.__version__`), and the 404/405 edge cases.
