---

description: "Task list for TS-12 UI foundation"
---

# Tasks: UI Foundation

**Input**: Design documents from `specs/012-ui-foundation/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/tokens.md](contracts/tokens.md), [contracts/components.md](contracts/components.md), [contracts/helpers-and-guards.md](contracts/helpers-and-guards.md), [quickstart.md](quickstart.md)

**Tests**: Tests are written for every acceptance criterion (spec FR-017), by qa-tester after the implementation, as the project template orders it. This story touches no scoring, prediction, API or security control, so constitution Principle VII does not make them mandatory; they still run in CI. Two guard tests (raw colors, contrast) keep the rules true after this story. The 44px size, focus look, grayscale and forced-colors checks need a real browser and are the manual task T031.

**Organization**: This feature has one story (TS-12), so all story tasks carry the `[TS-12]` label.

## Format: `[ID] [P?] [Story] Description (agent)`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **(agent)**: Owner agent, at the end of the line: frontend-dev, qa-tester, security-reviewer or orchestrator. **(human)** = a manual step for the person running the story (needs a browser).
- All paths are relative to the repository root. Frontend commands run from `frontend/`.
- Edit files with the file tools, not PowerShell (non-ASCII Spanish text, `AGENTS.md`). Keep files UTF-8.
- **Only these paths change**: `frontend/src/**`, `frontend/README.md`, `docs/GLOSSARY.md`, `docs/DECISIONS.md`, `docs/PROJECT_STATUS.md`, `docs/BACKLOG.md` and this story's `agent-log.csv`. Do not touch `backend/`, `.specify/`, `frontend/package.json` or `frontend/package-lock.json` (no new dependency, FR-018).
- Agents log each step with `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/log-agent.ps1 -Agent <agent> -Task <Txxx> -Action <action> -Details "<text>"` (`pwsh` on macOS).
- Rules for every frontend task: no raw color, no inline `style`, no hard-coded visible text, no font size below `1rem`, only `var(--token)` in styles; components use `export default`, helpers and icons use named exports; never commit a failing `npm test`.

---

## Phase 1: Setup

- [X] T001 [TS-12] Baseline before any change: in `frontend/` run `npm ci`, `npm test` and `npm run build`. Note the number of passing tests and that the build succeeds, for the PR description. Do not edit files (spec AC14) (qa-tester)

---

## Phase 2: Foundational

None. TS-05 (`LanguageContext`, `translations.js`, `AppShell`) and TS-06 (`AuthContext`, `RequireAuth`, login) are merged and are reused.

---

## Phase 3: TS-12 UI foundation 🎯 MVP

**Goal**: baseline stories get one set of tokens, base styles and four shared components (status badge, triage level badge, card, button) that meet WCAG AA, and the two existing pages and the page frame already use them.

**Independent Test**: `npm test` and `npm run build` pass in `frontend/` with no `package.json` change; the quickstart §2 guards fail when a raw color, a bad contrast or a changed status color is introduced; the manual browser pass (T031) shows tokens, 44px targets, visible focus and status badges that are told apart without color.

### Move the pages first (a green run proves the move alone broke nothing)

- [X] T002 [P] [TS-12] Move the start page: `mkdir -p frontend/src/pages/start`, then `git mv frontend/src/StartPage.jsx frontend/src/pages/start/StartPage.jsx`. Fix its imports to `../../api/client.js` and `../../i18n/LanguageContext.jsx`. Keep markup and behavior exactly as they are. Edit `frontend/src/App.jsx`: import `./pages/start/StartPage.jsx` (AC4, FR-004, plan R11) (frontend-dev)
- [X] T003 [P] [TS-12] Move the login page: `mkdir -p frontend/src/pages/login`, then `git mv frontend/src/LoginPage.jsx frontend/src/pages/login/LoginPage.jsx`. Fix its imports to `../../api/client.js`, `../../auth/AuthContext.jsx` and `../../i18n/LanguageContext.jsx`. Keep markup and behavior exactly as they are. Edit `frontend/src/auth/RequireAuth.jsx`: import `../pages/login/LoginPage.jsx` (AC4, FR-004, plan R11) (frontend-dev)
- [X] T004 [TS-12] Create the empty placeholder `frontend/src/hooks/.gitkeep` (git does not keep empty folders; the first story that adds a hook deletes it). Then run `npm test` and `npm run build` in `frontend/`: both must pass with **no test edited**. Stop and fix the imports if not. Depends on T002 and T003 (AC4, FR-004) (frontend-dev)

### Tokens and base styles

- [X] T005 [TS-12] Create `frontend/src/styles/tokens.css` with one `:root { … }` block and a top comment: "Design tokens (TS-12). The only file with color values. Use var(--name) everywhere else; see specs/012-ui-foundation/contracts/tokens.md". Define exactly the names and values in [contracts/tokens.md](contracts/tokens.md):
  - Colors: `--color-stable: #10B981`, `--color-stable-soft: #D1FAE5`, `--color-warning: #F59E0B`, `--color-warning-soft: #FEF3C7`, `--color-critical: #E11D48`, `--color-critical-soft: #FFE4E6`, `--color-no-data: #64748B`, `--color-no-data-soft: #F1F5F9`, `--color-bg: #FFFFFF`, `--color-bg-subtle: #F8FAFC`, `--color-primary: #2563EB`, `--color-primary-soft: #EFF6FF`, `--color-text: #1E293B`, plus the three added tokens `--color-primary-hover: #1D4ED8`, `--color-border: #CBD5E1`, `--color-border-strong: #64748B`.
  - Spacing `--space-1` to `--space-6` = `0.25rem`, `0.5rem`, `0.75rem`, `1rem`, `1.5rem`, `2rem`.
  - Type: `--font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`; `--font-size-base: 1rem` (the smallest size; **no token below `1rem`**); `--font-size-lg: 1.125rem`; `--font-size-xl: 1.375rem`; `--font-size-2xl: 1.75rem`; `--line-height: 1.5`.
  - Radius: `--radius-sm: 0.25rem`, `--radius-md: 0.5rem`, `--radius-pill: 999px`.
  - Focus: `--focus-ring: 3px solid var(--color-primary)`, `--focus-offset: 2px`.
  - Target: `--size-target: 2.75rem` (44px).
  - Add a comment next to each status color: "border and icon tint only, never text color". (AC1, FR-001) (frontend-dev)
- [X] T006 [TS-12] Create `frontend/src/styles/global.css`, using only tokens, depends on T005:
  - `body`: `margin: 0`, `font-family: var(--font-family)`, `font-size: var(--font-size-base)`, `line-height: var(--line-height)`, `color: var(--color-text)`, `background: var(--color-bg)`.
  - `h1`, `h2`, `h3`: `--font-size-2xl`, `--font-size-xl`, `--font-size-lg`.
  - `main`: the old rule from `App.css` with tokens (`max-width: 40rem; margin: 0 auto; padding: var(--space-6) var(--space-4)`).
  - `input, select, textarea`: `font: inherit`, `color: var(--color-text)`, `background: var(--color-bg)`, `border: 1px solid var(--color-border-strong)`, `border-radius: var(--radius-sm)`, `padding: var(--space-2) var(--space-3)`, `min-height: var(--size-target)`.
  - `:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-offset); }`.
  - No `px` font size anywhere. (AC3, FR-003, FR-015) (frontend-dev)
- [X] T007 [TS-12] Edit `frontend/src/main.jsx`: import `./styles/tokens.css` then `./styles/global.css` before `App`. Keep the existing comment about StrictMode. Depends on T005 and T006 (AC3, plan R2) (frontend-dev)

### Texts, helpers and icons

- [X] T008 [P] [TS-12] Edit `frontend/src/i18n/translations.js`: add the ten keys of [contracts/helpers-and-guards.md](contracts/helpers-and-guards.md) to **both** `es` and `en`: `monitoringStatus.stable` (Estable / Stable), `monitoringStatus.warning` (Vigilar / Watch), `monitoringStatus.critical` (Crítico / Critical), `monitoringStatus.no_data` (Sin datos / No data), `triageLevel.1` to `triageLevel.5` ("Triage I" to "Triage V" in both languages), `triageLevel.none` (Sin nivel / No level). Add no other text (AC12, FR-016) (frontend-dev)
- [X] T009 [P] [TS-12] Create `frontend/src/utils/monitoringStatus.js` per [contracts/helpers-and-guards.md](contracts/helpers-and-guards.md), named exports only, with a top comment "Presentation helpers (TS-12): no clinical logic; the backend computes the monitoring status":
  - `MONITORING_STATUSES = ['stable', 'warning', 'critical', 'no_data']`.
  - `normalizeMonitoringStatus(value)`: returns `value` when it is exactly one of the four lowercase strings, otherwise `'no_data'` (no trimming, no case folding, non-strings included).
  - `statusToToken(monitoringStatus)`: returns `{ name, color, soft }`, e.g. `{ name: 'no-data', color: '--color-no-data', soft: '--color-no-data-soft' }`; `name` is the status with `_` replaced by `-`.
  - `statusToLabelKey(monitoringStatus)`: returns `'monitoringStatus.' + normalized value`.
  - Never compare scores, thresholds or triage levels (AC9, FR-010, FR-006) (frontend-dev)
- [X] T010 [P] [TS-12] Create `frontend/src/components/Icons.jsx` with **named exports** `CheckCircleIcon`, `TriangleAlertIcon`, `OctagonXIcon`, `CircleDashIcon`. Each renders `<svg viewBox="0 0 24 24" width="1.25em" height="1.25em" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">` with plain paths: check inside a circle; triangle with "!"; octagon with "×"; circle with a horizontal dash. No title, no text, no props. No icon library (AC5, FR-005, plan R4) (frontend-dev)

### Shared components

- [X] T011 [P] [TS-12] Create `frontend/src/components/Button.jsx` and `Button.module.css` per [contracts/components.md](contracts/components.md) "Button". Props: `variant` (`'primary'` default or `'secondary'`; any other value uses `primary`), `type` (default `'button'`), `disabled`, `children`; all other props go to the `<button>`; `className` and `style` from the caller are ignored (place `{...rest}` first, then the component's `className`). CSS: `min-height: var(--size-target)` and `min-width: var(--size-target)`; `border-radius: var(--radius-md)`; `font: inherit`; `padding: var(--space-2) var(--space-4)`; primary = `--color-primary` background, `--color-bg` text, `--color-primary-hover` on hover; secondary = `--color-bg` background, `--color-text`, `1px solid var(--color-border-strong)`, `--color-primary-soft` on hover; `[aria-pressed="true"]` = `--color-primary-soft` background, `1px solid var(--color-primary)` border, `font-weight: 700`; disabled = `--color-bg-subtle` background, `--color-no-data` text, `--color-border` border, `cursor: not-allowed`; `:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-offset); }`. Depends on T005 (AC8, FR-009) (frontend-dev)
- [X] T012 [P] [TS-12] Create `frontend/src/components/Card.jsx` and `Card.module.css` per [contracts/components.md](contracts/components.md) "Card". Props `title`, `headingLevel` (`2` default; only 2, 3 or 4 accepted, else `2`), `children`. Render a `<div>` (not a `<section>`), with the heading element `h{level}` only when `title` is given. CSS: `--color-bg` background, `1px solid var(--color-border)`, `--radius-md`, `padding: var(--space-4)`; heading `margin: 0 0 var(--space-3)`. Depends on T005 (AC8, FR-008) (frontend-dev)
- [X] T013 [TS-12] Create `frontend/src/components/StatusBadge.jsx` and `StatusBadge.module.css` per [contracts/components.md](contracts/components.md) "StatusBadge". Prop `monitoringStatus` only. Use `statusToToken(...).name` to pick the CSS Module class (`styles['no-data']`, `styles.stable`, …), `statusToLabelKey(...)` with `t` from `useLanguage()` for the text, and the icon table in the contract (stable → `CheckCircleIcon`, warning → `TriangleAlertIcon`, critical → `OctagonXIcon`, no_data → `CircleDashIcon`). Markup: `<span class="badge status"><Icon /><span>{label}</span></span>`, no role. CSS: `display: inline-flex; align-items: center; gap: var(--space-2)`; `padding: var(--space-1) var(--space-3)`; `border-radius: var(--radius-pill)`; `color: var(--color-text)`; `border: 2px solid var(--color-<name>)`; `background: var(--color-<name>-soft)` for each of the four names; `font-weight: 600`. **Never set `color` to a status color.** Depends on T005, T008, T009, T010 (AC5, AC6, FR-005, FR-006, FR-011) (frontend-dev)
- [X] T014 [P] [TS-12] Create `frontend/src/components/TriageLevelBadge.jsx` and `TriageLevelBadge.module.css` per [contracts/components.md](contracts/components.md) "TriageLevelBadge". Prop `level`. Valid only when `Number.isInteger(level)` and `1 <= level <= 5` (so `"3"`, `2.5`, `0`, `6`, `null`, `undefined` are invalid); valid shows `t('triageLevel.' + level)`, otherwise `t('triageLevel.none')`. No icon, no status class. CSS: `--color-bg-subtle` background, `1px solid var(--color-border-strong)`, `--color-text`, `font-weight: 700`, `--radius-pill`, `padding: var(--space-1) var(--space-3)`. Comment: "Displays a level; never computes or changes it." Depends on T005, T008 (AC7, FR-007) (frontend-dev)

### Migrate the page frame and the login page, remove `App.css`

- [X] T015 [TS-12] Create `frontend/src/components/AppShell.module.css` from the header rules of `frontend/src/App.css`, tokens only: header `position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); align-items: center; justify-content: space-between; padding: var(--space-2) var(--space-4); background: var(--color-warning-soft); border-bottom: 2px solid var(--color-warning)`; `.disclaimer { margin: 0; font-weight: 600 }`; `.userBlock { display: flex; gap: var(--space-2); align-items: center }`; `.userName { font-weight: 600 }`; `.languageSwitch { display: flex; gap: var(--space-1) }`. Edit `frontend/src/components/AppShell.jsx`: use `styles.*` instead of the old class names, import `Button`, render sign-out as `<Button variant="secondary" onClick={signOut}>` and each language option as `<Button variant="secondary" aria-label={name} aria-pressed={lang === code} onClick={() => setLang(code)}>`. Keep every role, `aria-label`, text and the always-visible, non-closable banner exactly as they are (TS-05 AC6, TS-06 AC8). Depends on T005, T011 (AC2, AC8, AC11, FR-002, FR-009) (frontend-dev)
- [X] T016 [TS-12] Create `frontend/src/pages/login/LoginPage.module.css`: `.form { display: grid; gap: var(--space-2); max-width: 20rem }` and `.error { display: flex; align-items: flex-start; gap: var(--space-2); margin: 0; padding: var(--space-3); background: var(--color-critical-soft); border: 2px solid var(--color-critical); border-radius: var(--radius-md); color: var(--color-text) }`. Edit `frontend/src/pages/login/LoginPage.jsx`: `className={styles.form}` on the form; the submit becomes `<Button type="submit" disabled={submitting}>` with the same text keys; the message becomes `<p role="alert" className={styles.error}><OctagonXIcon /><span>{t(shownKey)}</span></p>` so the element's `textContent` is still exactly the message. Keep all logic, labels, `maxLength`, `required`, `autoComplete` and the double-submit guard unchanged. Depends on T004, T010, T011 (AC2, AC8, plan R5) (frontend-dev)
- [X] T017 [TS-12] Remove `frontend/src/App.css` (`git rm`) and its `import './App.css'` from `frontend/src/App.jsx`; confirm every old rule has a new home (plan "Where each old App.css rule goes") and `grep -rn "App.css" frontend/src` finds nothing. Then run `npm test` and `npm run build`: both pass. Depends on T006, T007, T015, T016 (AC2, FR-002) (frontend-dev)

### Docs by frontend-dev

- [X] T018 [P] [TS-12] Edit `frontend/README.md`: add a section "UI foundation" (after "How to add or change texts") with: the folder structure of `frontend/src/` (as in plan.md, including `pages/`, `hooks/`, `utils/`, `styles/`); the token rule ("write colors only in `src/styles/tokens.css`; everywhere else use `var(--token)`; the scan test fails otherwise"); the status color rule (solid status colors only as borders, never as text); how to use `Button`, `Card`, `StatusBadge` and `TriageLevelBadge` with one short example each (from [contracts/components.md](contracts/components.md)); how to add a token (contract "How to add a token") and how to add a monitoring status (token pair in `tokens.css`, icon in `Icons.jsx`, class in `StatusBadge.module.css`, entry in `monitoringStatus.js`, two texts, one contrast pair); that `npm test` includes the contrast and raw-color guards. Also fix the intro line, which still says the app is only the TS-04 skeleton (AC13, FR-019) (frontend-dev)
- [X] T019 [P] [TS-12] Edit `docs/GLOSSARY.md` in this PR (constitution workflow step 2, D-40): in §1 add a row **monitoring status** = `monitoring_status` (API/data field; JS prop and parameter `monitoringStatus`; text keys `monitoringStatus.*`) (`stable`, `warning`, `critical`, `no_data`; computed by the backend; UI texts Estable, Vigilar, Crítico, Sin datos; avoid "status" alone, which is `active` / `discharged`); in the `status` (patient) row add "Not the monitoring status"; fill the UI column of **triage level** with "Triage I … Triage V" (keys `triageLevel.1` to `5`, same in both languages); in §1.1 mismatch 1 (display name) state that TS-12 resolved it with "Triage I" to "Triage V". Keep existing wording otherwise (AC13, FR-019) (frontend-dev)

### Tests

- [X] T020 [P] [TS-12] (Write after T021.) Create `frontend/src/utils/monitoringStatus.test.js` per [contracts/helpers-and-guards.md](contracts/helpers-and-guards.md): the four rows of the table for both helpers; the fallback for `undefined`, `null`, `''`, `'STABLE'`, `' stable'`, `'unknown'`, `3`, `{}`; `normalizeMonitoringStatus` returns each valid value unchanged; every `color` and `soft` the helper returns is defined in `tokens.css` (use the token reader from T021); every label key exists in `translations.es` and `translations.en` with the texts in the contract. Header comment cites TS-12 AC9, AC6 and AC12 (qa-tester)
- [X] T021 [P] [TS-12] Create the test helpers `frontend/src/testing/sourceFiles.js` (named exports `listSourceFiles()`: every `.css`, `.js`, `.jsx` under `frontend/src/` as `{ path, text }` using `node:fs` and a path built from `import.meta.url`; `readTokens()`: `Map` of `--name` to value from `tokens.css`; `cssDeclarations(text)`: removes comments and returns `{ property, value, line }` for each declaration) and `frontend/src/testing/contrast.js` (`contrastRatio(hexA, hexB)`, WCAG 2.1 relative luminance, about 15 lines; `contrastRatio('#000000', '#FFFFFF')` is 21). No library (plan R10) (qa-tester)
- [X] T022 [TS-12] Create `frontend/src/styles/tokens.test.js` (AC1): the 13 spec colors have exactly the values in the spec (stable `#10B981`/`#D1FAE5`, warning `#F59E0B`/`#FEF3C7`, critical `#E11D48`/`#FFE4E6`, no-data `#64748B`/`#F1F5F9`, bg `#FFFFFF`, bg-subtle `#F8FAFC`, primary `#2563EB`, primary-soft `#EFF6FF`, text `#1E293B`); spacing, radius, focus and size tokens exist; every `--font-size-*` is at least `1rem`; `--size-target` is at least `2.75rem`; every `var(--x)` used in any `.css` file under `src/` is defined in `tokens.css` (fails with the file and the name). Depends on T021 (qa-tester)
- [X] T023 [TS-12] Create `frontend/src/styles/contrast.test.js` (AC10, FR-013): `contrastRatio` known values (black/white = 21, a mid-gray pair) and a self-test that `contrastRatio('#94A3B8', '#FFFFFF')` is below 4.5, so a bad text pair would be reported; every text pair at least 4.5 and every non-text pair at least 3, **exactly the pairs in [contracts/tokens.md](contracts/tokens.md)** (give each a name so a failure reads "text on critical-soft: 3.9 < 4.5"). Also assert statically, with whitespace-tolerant regexes such as `/min-height:\s*var\(--size-target\)/`, that `global.css` has `min-height` from `--size-target` and a `:focus-visible` rule using `var(--focus-ring)`, and that `Button.module.css` has `min-height` and `min-width` from `--size-target` and a `:focus-visible` rule (AC11, FR-015). Depends on T006, T011 and T021 (qa-tester)
- [X] T024 [TS-12] Create `frontend/src/styles/noRawColors.test.js` (AC2, FR-014) with the rules of plan research R10 and the self-test from [contracts/helpers-and-guards.md](contracts/helpers-and-guards.md): scan every `.css`, `.js`, `.jsx` under `src/` except `tokens.css`, `*.test.*` and `testing/`; fail on hex colors (3, 4, 6 or 8 digits, comments removed, CSS values only), color functions (`rgb(`, `rgba(`, `hsl(`, `hsla(`, `hwb(`, `lab(`, `lch(`, `oklab(`, `oklch(`, `color(`, `color-mix(`), named colors (in color-bearing CSS properties, including `background-image`, `text-shadow` and `filter`, after removing `var(...)` only line styles, `transparent`, `currentColor`, `inherit`, `initial`, `unset`, numbers and lengths are allowed), JSX `fill=`, `stroke=`, `color=` values other than `none` or `currentColor`, an inline `style=` in any `.jsx`, `font-size` not from `var(--font-size-*)`, and the exact property `color` (not `background-color`) set to `var(--color-stable)`, `var(--color-warning)`, `var(--color-critical)` or `var(--color-no-data)`. Failures name the file, line and text. The self-test runs the checker on one good and several bad strings (`#fff`, `rgb(0,0,0)`, `border: 1px solid red`, `fill="red"`, `style={{}}`) and expects each bad one to be reported. Also assert that only `src/main.jsx` imports `styles/tokens.css` and `styles/global.css` (FR-003). Depends on T021 and T017 (qa-tester)
- [X] T025 [P] [TS-12] Create `frontend/src/components/Button.test.jsx` (AC8): default `type` is `button`; `type="submit"` is respected; primary is the default variant and an unknown variant falls back to primary; `onClick` runs on `fireEvent.click`, and the element is a native `<button>` that can take focus (`button.focus()` makes it the `document.activeElement`; Enter and Space activation is the browser's own behavior for native buttons and is covered by the manual pass T031); a disabled button does not run `onClick` and is `disabled`; `aria-pressed` and `aria-label` are passed through; a caller `className` and `style` are ignored. Depends on T011 (qa-tester)
- [X] T026 [P] [TS-12] Create `frontend/src/components/Card.test.jsx` (AC8): with a title, the heading has role `heading` at level 2 by default and the content is inside the card; `headingLevel={3}` gives level 3; an invalid level (`1`, `7`, `'x'`) gives level 2; without a title no heading is rendered. Depends on T012 (qa-tester)
- [X] T027 [P] [TS-12] Create `frontend/src/components/StatusBadge.test.jsx` (AC5, AC6, AC12): render inside `LanguageProvider`. For each of the four statuses, the Spanish label (Estable, Vigilar, Crítico, Sin datos) is visible text, the badge contains one `svg` with `aria-hidden="true"`, and the four icons are different (compare their markup); after switching to English (use the `LanguageProvider` with `localStorage` set to `en`) the labels are Stable, Watch, Critical, No data. For `undefined`, `null`, `''`, `'STABLE'`, `'unknown'` the text is "Sin datos" and never "Estable". Depends on T013 (qa-tester)
- [X] T028 [P] [TS-12] Create `frontend/src/components/TriageLevelBadge.test.jsx` (AC7, AC12): levels 1 to 5 show "Triage I" to "Triage V" in Spanish and English; `0`, `6`, `2.5`, `'3'`, `null`, `undefined`, `NaN` show "Sin nivel" (Spanish) and "No level" (English); the badge has no `svg`. Depends on T014 (qa-tester)
- [X] T029 [P] [TS-12] Create `frontend/src/pages/login/LoginPage.test.jsx` (AC8, AC11, plan R5): with `stubBackend` and `resetSession` from `src/testing/fakeBackend.js`, render `App` signed out, submit wrong credentials (login answers 401) and check that the `alert` element's text is exactly "Usuario o contraseña incorrectos.", that it contains one `svg` with `aria-hidden="true"`, and that the submit button is a native button of `type="submit"` that is disabled while the request is in flight. Do not edit `auth.test.jsx`. Depends on T016 (qa-tester)

### Checks and review

- [X] T030 [TS-12] Run the automated checks from [quickstart.md](quickstart.md) §1 in `frontend/`: `npm test` (all pass, no backend, no network), `npm run build`, `git diff --stat frontend/package.json frontend/package-lock.json` (empty), `grep -rn "App.css" frontend/src` (empty). Do not edit source files: the "prove the guards can fail" edits are step 0 of T031 (qa-tester may edit test files only). Report the passing-test count next to the T001 baseline. If a check fails, fix it in the owning task. Depends on T001–T029 (qa-tester)
- [X] T031 [TS-12] **Manual checks (human).** **Step 0, prove the guards can fail** ([quickstart.md](quickstart.md) §2): put `#ff0000` in `Card.module.css`, then change `--color-text` to `#94A3B8`, then change `--color-stable` to `#00FF00`; each edit must make its named test fail (`noRawColors`, `contrast`, `tokens`); revert each edit (`git diff` shows nothing from them). Then follow [quickstart.md](quickstart.md) §4 with the backend and `npm run dev` running: keyboard pass and visible focus on both pages (SC-004); inspector check that every button and input is at least 44px high and buttons at least 44px wide; wrong-credentials error box; text zoom 200%; the temporary badge line, grayscale (achromatopsia emulation) and forced-colors emulation (SC-003, edge cases); sign in, sign out, language switch, banner and `/health` unchanged (SC-007). Remove the temporary line. Also have a teammate who has not seen the code follow only `frontend/README.md` to show a status badge, a triage level badge, a card and a button on a page, and record the time (SC-005). Record the results and the grayscale screenshot in the PR description. Depends on T030 (human)
- [X] T032 [TS-12] Review the story (read-only, change no code). Check: no `style=` attribute and no `dangerouslySetInnerHTML` in `frontend/src`; no new dependency (`package.json` and lock file unchanged); no raw color outside `tokens.css`; no hard-coded visible text in the new components; `Button` ignores caller `className` and `style`; icons are static markup with no user data; no clinical logic in `utils/monitoringStatus.js` or `TriageLevelBadge.jsx`; `RequireAuth` still wraps the start page and the login page still shows no clinical content; nothing logged or stored (no `localStorage`, `sessionStorage`, `console`). Return the findings as a report; the orchestrator logs them (constitution VI, VIII) (security-reviewer)

---

## Phase 4: Polish

- [X] T033 [P] Edit `docs/DECISIONS.md`: add **D-42** after D-41 (today's date, Status "Active"): design tokens in one file (`frontend/src/styles/tokens.css`) with no raw colors anywhere else; component styles in CSS Modules; solid status colors only as borders and icon tints, never text; badge icon and label in the dark `text` color on the soft variant; two guard tests (raw-color scan, contrast); `App.css` removed; `monitoring status` as the term. Reasons and rejected options as in [research.md](research.md) R2, R4, R10. State that TS-12 changes no earlier decision (orchestrator)
- [X] T034 [P] Edit `docs/PROJECT_STATUS.md` and `docs/BACKLOG.md`: mark TS-12 done and link `specs/012-ui-foundation/spec.md` in the backlog's Spec column; update "Last updated", "Current step" (add TS-12 ✅) and "Next step" (TS-10 backend deployment, or as the team decides); add a short "Notes for later stories" bullet: US-02, US-04 and US-05 reuse `StatusBadge`, `TriageLevelBadge`, `Card` and `Button`, pass `monitoring_status` and `triage_level` from the API unchanged, and add the time of the last reading beside a `no_data` badge themselves (AC13, FR-019) (orchestrator)
- [X] T035 Check this story's `specs/012-ui-foundation/agent-log.csv`: every task has `assigned`, `started` and `done` rows from its agent, and log each T032 finding with `-Action finding` on the security-reviewer's behalf (that agent has no shell). Prepare the PR record: link to `specs/012-ui-foundation/`, which agent did what, the T001 and T030 test counts, the manual results from T031 and the security-reviewer's findings with how each was resolved (constitution workflow step 6) (orchestrator)

---

## Dependencies & Execution Order

- **Setup**: T001 has no dependencies and must run before any edit.
- **Page moves**: T002 and T003 depend on T001 and run in parallel. T004 depends on both and ends with a green `npm test` and `npm run build`; do not start styling before it.
- **Tokens and styles**: T005 has no dependencies after T004. T006 depends on T005. T007 depends on T005 and T006.
- **Texts, helpers, icons**: T008, T009 and T010 have no code dependency on each other and can run in parallel with T005–T007.
- **Components**: T011, T012 and T014 depend on T005 (T014 also on T008) and run in parallel. T013 depends on T005, T008, T009 and T010.
- **Migration**: T015 depends on T005 and T011. T016 depends on T004, T010 and T011. T017 depends on T006, T007, T015 and T016.
- **Docs by frontend-dev**: T018 depends on T011–T014; T019 has no code dependency. Both can run in parallel with the tests.
- **Tests**: T021 first. T020 depends on T009, T008, T005 and T021. T022 and T023 depend on T021 (T023 also on T011 for the Button CSS). T024 depends on T021 and T017. T025 depends on T011, T026 on T012, T027 on T013, T028 on T014, T029 on T016.
- **Checks and review**: T030 depends on T001–T029. T031 (human) depends on T030. T032 depends on T030 and can run while T031 is done by hand.
- **Polish**: T033 and T034 can run after T017; T034 runs last of the two if it records the final result. T035 runs last.
- **Story dependencies**: TS-05 and TS-06 (merged), per `docs/BACKLOG.md`. No other story is touched.

## Parallel Example

```text
# Round 1: T001 (qa-tester baseline)
# Round 2 (frontend-dev):  T002 + T003 in parallel → T004 (green checkpoint)
# Round 3 (frontend-dev):  T005 → T006 → T007; in parallel: T008, T009, T010
# Round 4 (frontend-dev):  T011, T012, T014 in parallel; then T013
# Round 5 (frontend-dev):  T015, T016 in parallel → T017; T018, T019 in parallel
# Round 6 (qa-tester):     T021 → T020, T022, T023, T024; T025–T029 in parallel after their components
# Round 7:                 T030 (qa-tester) → T031 (human) and T032 (security-reviewer) → T033, T034 → T035 (orchestrator)
```

## Implementation Strategy

TS-12 is the whole MVP, built so each step stays green:

1. Baseline (T001), then move the two pages and prove nothing broke (T002–T004).
2. Tokens and base styles (T005–T007), texts, helpers and icons (T008–T010).
3. The four components (T011–T014), then migrate the frame and the login page and remove `App.css` (T015–T017).
4. README and glossary (T018–T019), then the tests (T020–T029), the checks (T030), the manual browser pass (T031) and the review (T032).
5. Decision, status and PR record (T033–T035).

After T035, commit (`TS-12: UI foundation`), push and open the PR. CI (TS-09) runs the tests, build and dependency check; the PR also includes the agent activity log (`specs/012-ui-foundation/agent-log.csv`) and the T031 manual results.

## Notes

- The orchestrator assigns each task to its agent and logs `assigned` / `started` / `done` rows (see `docs/agents.md`).
- Testing runs after implementation, as the project template orders it (qa-tester, then security-reviewer). It does not use test-first order.
- Do not add anything not listed here (Principle XII): no component gallery, no `danger` or `ghost` button variant, no card variants, no dark mode, no icon or CSS library, no table, loader, dialog or form-field component, no router, and no change to `package.json`.
