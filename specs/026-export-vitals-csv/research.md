# Research: Export Vital Signs to CSV (US-10)

All unknowns from the Technical Context are resolved here. Each item: Decision, Rationale,
Alternatives considered.

## R1. How to get every stored reading (the 200 cap)

**Facts checked in the code (2026-11-22):**

- `GET /api/patients/{identifier}/readings` (`backend/app/readings_api.py`, US-03) accepts only
  `limit` (`Query(50, ge=1, le=200)`), orders `recorded_at desc, id desc` and has **no offset,
  cursor or `before` parameter**. Unknown query parameters are ignored.
- The simulator saves one reading every 5 minutes, so 200 readings is about 16.7 hours; a patient
  monitored for a day has about 288.

**Option (a): page the existing endpoint from the frontend.** Not possible without changing the
contract. With only `limit` there is no way to ask for "the 200 before this one"; every request
returns the same newest 200. Walking `recorded_at` needs a new `before` parameter, and an offset
needs a new `offset` parameter. Both change US-03's code and contract, which Principle III forbids
for a functional story (a shared need would have to become a technical story first). Raising the
`le=200` cap is the same kind of change. So option (a) can only satisfy "every stored reading" by
breaking independence.

**Option (b): a new read-only backend endpoint that returns all readings.** One new route in a new
module owned by US-10, registered with one `include_router` line. It reuses, by importing without
changes, `find_patient` (`app/patients.py`) and `to_response` (`app/readings_api.py`), so each
reading has exactly the shape of the readings contract and the stored score is read, never
recomputed. Cost: about 30 lines and one test file.

**Decision:** option (b). The endpoint `GET /api/patients/{identifier}/readings/export` returns
**JSON** `{"readings": [...]}` with **every** reading, **oldest first** (`recorded_at asc, id asc`),
and the frontend builds the CSV (R2).

**Rationale:** it is the only option that exports every reading without modifying another
functional story, and it is small. Ordering on the server with the `id` tie-break gives the
clarified "same time keeps saved order" for free, since `id` grows with the save order.

**Alternatives considered:** (a) frontend paging, rejected above. A `limit=all` or larger cap on
the existing endpoint, rejected because it changes US-03. A server-side cap (e.g. 5,000) on the new
endpoint, rejected: it would break "every reading" and the volume is small (see R6).

## R2. Where the CSV is built: server or browser

**Decision:** the browser builds the CSV with a pure function `buildReadingsCsv(readings)` in
`frontend/src/pages/export-readings/readingsCsv.js`. The endpoint returns JSON.

**Rationale:**

1. `frontend/src/api/client.js` (TS-04) always returns `response.json()`. A `text/csv` answer
   would need a new text or blob method in the shared client. Reusing `apiGet` as-is also keeps its
   Bearer token, 10 s timeout, `ApiError` and 401 session-expiry handling, with no change.
2. `backend/tests/test_scoring_interface.py::test_news2_confined` fails if any `.py` file in
   `app/` outside `app/scoring/` contains "news2" (case-insensitive). The CSV header has
   `news2_total`, so a server-built CSV would fail that guard or need a workaround. The new backend
   module must not contain that word anywhere, including docstrings and comments.
3. The filename uses the user's **local** export date, which only the browser knows.
4. The CSV rules (column order, formatting, quoting, injection guard) live in one pure function
   that a unit test calls directly.

**Alternatives considered:** the server returns `text/csv` with Python's `csv` module, rejected
for points 1 to 3. The browser generates CSV from the 200-capped list, rejected by R1.

## R3. CSV format details

**Decision:**

- Header `recorded_at,respiratory_rate,spo2,on_oxygen,systolic_bp,heart_rate,consciousness,temperature,news2_total,risk_band`
  (spec AC2), in that order.
- Values: `recorded_at` as the API string (UTC ISO 8601, unconverted); integers with `String(n)`;
  `on_oxygen` as `true` / `false`; `consciousness` and `risk_band` as the stored codes;
  `temperature` as the stored one-decimal string, written as received; `news2_total` from
  `score.total` and `risk_band` from `score.band`.
- Records end with **CRLF** (`\r\n`, RFC 4180), the last one included, so a header-only file is
  the header plus `\r\n`.
- **No BOM.** Every value is ASCII (codes, digits, ISO times), so Excel and other tools read it
  correctly without one, and the spec's byte-exact tests stay simple.
- Quoting: a field is wrapped in `"` only when it contains `,`, `"`, `\r` or `\n`; inner `"` is
  doubled.
- Rows are written in the order received (the server's oldest-first order). The util does not
  sort.

**Rationale:** RFC 4180 is the format spreadsheets expect, and CRLF is its record separator. The
values are typed, so a small hand-written function (about 30 lines) is enough. No CSV library is
needed (Principle XII, no new dependency).

**Alternatives considered:** `papaparse` or another CSV package, rejected as a new dependency for
10 typed columns. LF line endings also work in most tools, but CRLF is the RFC choice and costs
nothing.

## R4. CSV-injection guard

**Decision:** `csvField(value)` converts the value to a string. If it starts with `=`, `+`, `-`,
`@`, a tab (`\t`) or a carriage return (`\r`), it prefixes a single quote `'`. Then it applies the
quoting rule of R3. The guard runs on **every** field, header included.

**Rationale:** this is the OWASP "CSV Injection" recommendation: neutralize the formula trigger
characters, then quote as usual. Guard first, then quote, so a value like `=1,2` becomes
`"'=1,2"`. With today's validation no stored value triggers it (no negative numbers, and band
`low-medium` starts with `l`), so the guard is defense in depth and is tested with crafted input.

**Alternatives considered:** rejecting the export when a trigger character appears, rejected (it
breaks a legitimate export for a cosmetic risk). Prefixing a tab, less common and less visible.

## R5. Download mechanism

**Decision:** `downloadCsv(text, filename)` in `frontend/src/pages/export-readings/downloadCsv.js`:
`new Blob([text], { type: 'text/csv;charset=utf-8' })`, `URL.createObjectURL`, a temporary
`<a download={filename}>` that is clicked and then removed, and `URL.revokeObjectURL`. It is a
separate module so the component test can replace it with `vi.mock`, because jsdom does not
download files.

**Rationale:** these are standard browser APIs that need no dependency. An `<a href="/api/...">`
link cannot send the `Authorization: Bearer` header (TS-06 sends the token only in that header), so
the file must be fetched with `apiGet` and saved from memory.

**Alternatives considered:** `file-saver`, rejected as a new dependency. A token in the URL,
forbidden by TS-06 (the token never goes in a URL). A cookie session, not used by this app.

## R6. Volume and performance

**Decision:** no pagination and no cap.

**Rationale:** one reading is about 1 KB of JSON including the seven `entries` (which the CSV
ignores). A day of readings (288) is about 0.3 MB, and a week (2,016) is about 2 MB. One indexed
query on `vital_signs.patient_id` plus a join returns that well inside the client's 10 s timeout,
which meets SC-001 (about 300 readings in under 5 s). If the 10 s timeout ever fires, the user gets
the AC7 error message and no file.

**Alternatives considered:** a slimmer response model without `entries`, rejected because reusing
`to_response` keeps one reading shape and no new mapping code. Streaming, not needed at this size.

## R7. Filename

**Decision:** `exportFileName(identifier, date = new Date())` returns
`` `${identifier}-vital-signs-${YYYY}-${MM}-${DD}.csv` `` built from the local `getFullYear()`,
`getMonth() + 1` and `getDate()` (zero-padded). It returns `null` when `isPatientCode(identifier)`
(`utils/patientCode.js`, TS-13) is false, and the component then does not export.

**Rationale:** the patient-code format `^[A-Z0-9-]{1,20}$` can't hold a path separator, quote,
space or control character, so the name is safe by construction. No other patient field is used.
Taking `date` as a parameter makes the test deterministic.

## R8. Access and roles

**Decision:** the endpoint uses `Depends(get_current_user)` with no role check (clarified
2026-11-22: doctors and nurses). The control has no role check either. The detail route is already
inside `<RequireAuth>` (TS-13), so a signed-out visitor is redirected to `/login` and the control
never renders.

## R9. Mounting without touching US-05 logic

**Decision:** add `import ExportReadingsButton from "../export-readings/ExportReadingsButton.jsx";`
and `<ExportReadingsButton identifier={identifier} />` immediately after the existing
`<RecordReadingButton identifier={identifier} />` inside `.topRow` of `PatientDetailPage.jsx`.

**Rationale:** `.topRow` is already `display: flex; flex-wrap: wrap; gap`, so a third child lays
out with no CSS change in US-05. The control makes no request when it renders (only on click), so
the existing `PatientDetailPage` tests, which match buttons by name, keep passing. In `fakeBackend`
the path `/api/patients/<code>/readings/export` matches none of the existing patterns
(`READINGS_PATH` ends in `/readings$`) and falls back to the default 404, so shared test helpers are
unchanged.

## R10. Error handling and logging

**Decision:** while running, the control is disabled and shows the busy label. On any failure
(`ApiError` 404/503/other, network `TypeError`, timeout `AbortError`, or a body whose `readings` is
not an array) there is no download, and a translated `role="alert"` message
(`exportReadings.error`) appears under the control. On 401 the shared client already clears the
session and the registered handler sends the user to `/login`. Nothing is logged in the browser.
The backend logs only `type(exc).__name__` on a database error, as US-03 does.
