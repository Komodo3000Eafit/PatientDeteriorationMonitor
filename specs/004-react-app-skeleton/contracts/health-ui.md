# Contract: Start Page and API Client (TS-04)

## What the frontend calls

`GET {VITE_API_BASE_URL}/health`, unchanged from TS-01/TS-02 (D-30, FR-007):

```json
{ "status": "ok", "version": "0.1.0", "database": "ok" }
```

`database` is `"ok"` or `"unavailable"`; the response is HTTP 200 in both cases.

## API client (`frontend/src/api/client.js`)

| Export | Behaviour |
|---|---|
| `API_BASE_URL` | `VITE_API_BASE_URL` trimmed without trailing `/`, or `http://localhost:8000` |
| `REQUEST_TIMEOUT_MS` | `10000` |
| `apiGet(path)` | `fetch(API_BASE_URL + path, { signal })`; aborts after `REQUEST_TIMEOUT_MS`; non-2xx → throws; returns parsed JSON (invalid JSON → throws) |
| `getHealth()` | `apiGet('/health')`; throws unless `status` and `version` are non-empty strings; returns `{ status, version, database }` |

Rules: no component builds a URL or calls `fetch` directly; later screens add functions here or call `apiGet`. Errors thrown are plain `Error`s; the page shows its own Spanish text, never the error message.

## Start page texts (Spanish, hard-coded until TS-05)

| Element / state | Text |
|---|---|
| Page title (`<h1>`, `<title>`) | `Monitor de Deterioro del Paciente` |
| checking | `Comprobando la conexión con el servidor…` |
| ok | `API: funcionando` · `Versión: {version}` · `Base de datos: disponible` |
| databaseUnavailable | `API: funcionando` · `Versión: {version}` · `Base de datos: no disponible` · `Recarga la página para volver a comprobar.` |
| unreachable | `No se puede conectar con el servidor.` · `Recarga la página para volver a comprobar.` |

`<html lang="es">`. Tests find elements by these texts, so a wording change updates this table and the tests together.
