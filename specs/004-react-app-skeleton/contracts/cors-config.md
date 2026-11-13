# Contract: Backend CORS (TS-04)

## Setting

`CORS_ORIGINS`: comma-separated list of allowed origins (scheme + host + port, no path). Read once when the app starts, from the environment or `backend/.env` (terminal value wins, as with `DATABASE_URL`). Parsing in [data-model.md](../data-model.md#settings).

| `CORS_ORIGINS` value | Allowed origins |
|---|---|
| unset, `""`, `" "`, `","` | `http://localhost:5173` |
| `http://localhost:5173/` | `http://localhost:5173` |
| ` http://a.example , http://b.example ` | `http://a.example`, `http://b.example` (default **not** included) |
| `*` or `http://a.example,*` | **startup fails** |

## Behaviour

- Middleware: `CORSMiddleware(allow_origins=<list>, allow_credentials=False, allow_methods=["GET"])`; no custom allowed headers.
- Request with `Origin` in the list → response includes `access-control-allow-origin: <that origin>`.
- Request with any other `Origin` → no `access-control-allow-origin` header (the browser blocks the page from reading it; the server still answers).
- Requests without `Origin` (curl, `Invoke-RestMethod`, health probes) are unaffected.
- The response header is never `*`.

## Startup error

With a `*` entry, importing `app.main` raises:

```text
ValueError: CORS_ORIGINS must not contain '*'; list the allowed origins explicitly
```

`uvicorn app.main:app` exits with a non-zero code. The message is fixed text: it contains no other configured value.
