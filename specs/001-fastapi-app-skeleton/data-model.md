# Data Model: FastAPI App Skeleton (TS-01)

This story has no stored data. The only data shape is the health check response.

## HealthStatus (response body of `GET /health`)

| Field | Type | Rules |
|---|---|---|
| `status` | string | Always `"ok"` when the app answers |
| `version` | string | Equal to `app.__version__` (initially `"0.1.0"`) |

- There are no other fields: no environment, host, paths or timestamps (spec edge case: no internal details).
- Later stories (e.g. TS-02, database status) may **add** fields, but MUST keep `status` and `version`.
- It has no state transitions and no relationships.
