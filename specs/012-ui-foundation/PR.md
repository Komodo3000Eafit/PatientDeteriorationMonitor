# Pull request record — TS-12 UI foundation

**Story:** [specs/012-ui-foundation/](./) (spec, plan, tasks, research, contracts, quickstart)
**Branch:** `012-ui-foundation`
**Status:** implementation complete; T031 manual pass done (with noted deferrals). **Not yet merged** — pending commit, pull request and CI.

## What the story delivers

Design tokens in one file (`frontend/src/styles/tokens.css`) and base styles in `styles/global.css`; `App.css` removed with every rule rehomed; the `frontend/src/` folder structure (`pages/`, `hooks/`, `utils/`, `styles/`) with `StartPage` and `LoginPage` moved into `pages/`; four shared components the baseline stories reuse — `StatusBadge`, `TriageLevelBadge`, `Card`, `Button` — plus the `monitoringStatus` presentation helpers and the `Icons` set. Two guard tests (raw-color scan and contrast) keep the color and contrast rules true. No new dependency (`package.json` and lock file unchanged, FR-018). See DECISIONS **D-42**.

## Which agent did what (from `agent-log.csv`)

- **qa-tester** — recorded the T001 baseline; wrote the test helpers (`testing/sourceFiles.js`, `testing/contrast.js`); wrote every automated test and the two guard tests (`monitoringStatus`, `tokens`, `contrast`, `noRawColors`, `Button`, `Card`, `StatusBadge`, `TriageLevelBadge`, `LoginPage`); ran the full suite and the guard-failure checks (T030). Reported the real `noRawColors` violation on `Button` and the caller-`style` leak, which sent T011 back to frontend-dev twice.
- **frontend-dev** — moved the two pages and fixed imports; created the tokens, global styles and `main.jsx` imports; added the ten text keys; wrote the helpers, icons and the four components; migrated `AppShell` and the login page to the shared `Button` and CSS Modules; removed `App.css`; fixed the two issues qa-tester found; updated `frontend/README.md` and `docs/GLOSSARY.md`.
- **security-reviewer** — read-only review of `frontend/src` (T032): inline styles, `dangerouslySetInnerHTML`, new dependencies, raw colors, hard-coded text, `Button` ignoring caller `className`/`style`, static icon markup, no clinical logic, `RequireAuth` intact, no new storage/logging. Clean review, no findings.
- **orchestrator** — assigned each task, verified each result against the acceptance criteria, routed the two reworks back to frontend-dev, logged the security-reviewer's review and finding, and wrote the Phase 4 polish (D-42, status/backlog updates, this record).

## Test counts

- **T001 baseline:** 63 tests passing (5 files); `npm run build` succeeded; no files edited.
- **T030 final:** 221 tests passing; `npm run build` succeeds; `git diff --stat frontend/package.json frontend/package-lock.json` empty; no `App.css` reference under `frontend/src`. The three guards were each shown to fail when a raw color, a bad contrast or a changed status color was introduced, then reverted clean.

## Security review findings (T032)

Clean review, no findings. The single finding row logged by the orchestrator on the security-reviewer's behalf:

> Clean review: no security issue found. No inline style/dangerouslySetInnerHTML, no new dependency, no raw color outside tokens.css, no hard-coded text, Button ignores caller className/style, static icons, no clinical logic, RequireAuth intact, no new storage or logging in TS-12 code

No code-fix resolutions to record (the review found nothing to fix).

## T031 manual browser pass — DONE (partial, with noted deferrals)

**Completed by the human on 2026-11-19** against `npm run dev` with the backend running (login E2E worked with the seeded demo nurse; `/health` showed API running and database available).

Verified in the browser and confirmed working:

- **Keyboard and visible focus:** Tab reaches every interactive element on both the login and the authenticated start page (ES/EN toggle, username/password inputs, Sign in, Sign out), each showing a visible focus ring.
- **Keyboard activation:** the focused Sign in button activates with Enter.
- **44px targets:** inputs and buttons measure at least 44px high (and buttons at least 44px wide) in the inspector.
- **200% text zoom:** text and controls scale without clipping or overlap.
- **Wrong-credentials error box:** shows the soft `critical-soft` box with the `OctagonXIcon` and dark text ("Incorrect username or password.").
- **Unchanged behavior:** sign in, sign out, ES/EN language switch, the always-visible disclaimer chip, and the `/health` result all behave as before the story. Two rounds of visual refinement (centered Sign in, de-boxed ES/EN toggle, disclaimer chip with warning icon, login wrapped in the shared Card) were also eyeballed and look correct.

Deferred on purpose (not done, and why):

- **Grayscale / forced-colors badge check and the temporary badge line (SC-003):** the `StatusBadge` and `TriageLevelBadge` are not shown by any page yet (that is US-02 / US-05). Their color-independent distinguishability is covered by the automated tests (`StatusBadge.test.jsx`, `contrast.test.js`); the in-browser grayscale check is deferred to the first story that renders them, to avoid adding temporary, uncommitted code to the shared repo.
- **Guard-failure demo in the browser:** the three guards were already proven to fail-then-revert during T030 (automated); not repeated by hand.
- **SC-005 README walkthrough timing:** to be run with a teammate when the team joins (this is currently a solo dry run).


