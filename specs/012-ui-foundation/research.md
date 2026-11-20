# Research: UI Foundation (TS-12)

Each item records what was decided, why, and what was rejected. Values checked on 2026-11-19.

## R1. CSS Modules and file reading work in Vitest

**Decision**: use CSS Modules (`*.module.css`) for component styles, and read the real source files in the two guard tests with `node:fs`.

**Checked** with a throwaway test (deleted afterwards): in this repo's Vitest 5 + jsdom setup, importing a `.module.css` works, the class name becomes a generated string such as `_foo_6c675b`, and `readdirSync(..., { recursive: true })` works inside a test.

**Consequence**: tests never hard-code a class name. They import the same `styles` object the component uses (`styles.stable`) or check behavior through roles, text and attributes.

**Rejected**: plain global CSS with BEM-like names (leaks styles between components; the frontend-dev rules ask for CSS Modules); CSS-in-JS (new dependency).

## R2. Where the old `App.css` goes

**Decision**: delete `App.css`; move each rule to the file that owns it (table in `plan.md`). `tokens.css` and `global.css` are imported once, in `main.jsx`, tokens first.

**Why**: the frontend-dev rules say each component keeps its own style file. A leftover `App.css` would be a second global file with no clear owner. FR-002 is satisfied because no raw color is left anywhere.

**Rejected**: keeping `App.css` with token values (works, but keeps the old naming and global scope); importing the CSS in `App.jsx` (tests render `App`, so main-only keeps tests unaffected, and the entry point is the usual place).

## R3. Token list

**Decision**: the spec's tokens, with these names, plus three extra color tokens and a few non-color tokens. Full table in [contracts/tokens.md](contracts/tokens.md).

| Added token | Value | Why it is needed |
|---|---|---|
| `--color-border` | `#CBD5E1` | Decorative lines: card edge, header edge, dividers. 1.48:1 on white, so it must never be the only boundary of a control. |
| `--color-border-strong` | `#64748B` | Boundary of form controls and secondary buttons (WCAG 1.4.11 needs 3:1: 4.76:1 on `bg`, 4.27:1 on `warning-soft`, 3.96:1 on `critical-soft`). Same value as `no_data` but a separate token, so changing the status color never changes input borders. |
| `--color-primary-hover` | `#1D4ED8` | Hover color for the primary button. White on it is 6.7:1. |

The other tokens (spacing `--space-1..6`, type `--font-size-base/lg/xl/2xl`, `--font-family`, `--line-height`, radius `--radius-sm/md/pill`, `--focus-ring`, `--focus-offset`, `--size-target`) are plain values.

**Type scale starts at 1rem.** The spec says all text is 16px or larger, so there is no "small" size token. Rem units keep text zoom working (the root size is never set in px).

**Rejected**: a full 9-step spacing and color scale (YAGNI); a dark theme.

## R4. Status badge look

**Decision** (from the clarifications): soft background tint of the status color, a **2px solid border in the solid status color**, icon and label both in `--color-text`.

- Contrast of `--color-text` on the four soft colors is 12.19:1 to 13.35:1, so label and icon pass 4.5:1 and 3:1 with room to spare.
- The solid status color is never text and never carries the meaning alone (its contrast against its own soft background is 2.24:1 for `stable` and 1.93:1 for `warning`).
- Four icon shapes differ by outline, not by color: check in a circle (`stable`), triangle with "!" (`warning`), octagon with "×" (`critical`), circle with a dash (`no_data`).
- Icons are `<svg aria-hidden="true" focusable="false">` drawn with `currentColor`, so they take the text color and follow forced-colors mode.
- In forced-colors (high-contrast) mode the browser replaces colors but keeps the border, icon and label, so the status stays readable.

**Rejected**: a colored dot only (violates "never color alone"); solid status color as the badge background with dark text (3.07:1 for `no_data`, 3.11:1 for `critical`: fails AA).

## R5. Login error message

**Decision** (given by the user): a box with `--color-critical-soft` background, 2px solid `--color-critical` border, `--color-text` text and `OctagonXIcon`. The element stays `<p role="alert">`; the icon is `aria-hidden`, so the element's text is still exactly the message and the TS-06 tests that read `textContent` keep passing.

**Why**: `critical` as text on white is 4.7:1 but only 4.49:1 on `bg-subtle`, so a text-color rule would break whenever the page background changes.

**Rejected**: `critical` as text color.

## R6. Button

**Decision**: one `Button` with `variant` `primary` (default) or `secondary`, native `disabled`, default `type="button"`, and extra props passed to the `<button>` (`onClick`, `aria-pressed`, `aria-label`, `type="submit"`). It sets `min-height` and `min-width` to `--size-target`. A button with `aria-pressed="true"` gets a selected look (`primary-soft` background, `primary` border, bold), which is what the language switch needs.

**Why**: the language switch, sign-out and sign-in are the three existing buttons; one component covers them. No `danger` or `ghost` variants until a story needs them.

**Rejected**: a separate `ToggleButton` component (the `aria-pressed` style is three lines); a `className` prop (lets stories bypass the look; a layout wrapper does that job).

## R7. Card

**Decision**: a `<div>` with surface styles and an optional title rendered as a heading (`h2` by default, `headingLevel` 2 to 4). Not a `<section>`: a list of many cards would otherwise create many landmarks for screen readers.

## R8. Triage level badge

**Decision**: text from `triageLevel.1` to `triageLevel.5` ("Triage I" to "Triage V", same in both languages), and `triageLevel.none` ("Sin nivel" / "No level") for anything that is not a whole number from 1 to 5. A numeric string such as `"3"` is invalid on purpose (spec edge case). Neutral look: `bg-subtle` background, `border-strong` border, `text` color, no icon, no status color.

**No extra "most urgent" in the accessible name.** The spec allowed it but nothing needs it, and it would add translated text with no test target. A later story can add it.

**Rejected**: a different color per level (a triage level is a clinician's classification, not a status; inventing five more colors also breaks "stable/warning/critical" meaning).

## R9. Helper design

**Decision**: `utils/monitoringStatus.js` exports `MONITORING_STATUSES`, `statusToToken(monitoringStatus)` and `statusToLabelKey(monitoringStatus)`. Both helpers accept any value; anything that is not exactly one of the four lowercase strings is treated as `no_data` (no trimming, no case folding: the backend contract is the four lowercase values).

`statusToToken` returns `{ name, color, soft }`, for example `{ name: 'no-data', color: '--color-no-data', soft: '--color-no-data-soft' }`. The badge uses `name` to pick its CSS Module class (`styles['no-data']`), because inline styles are not allowed. `color` and `soft` are for any later consumer that builds its own rule. The unit test checks that every returned token exists in `tokens.css`, so the helper and the CSS cannot drift apart.

**Naming**: the data field is `monitoring_status` (as the backend will return it); the JS prop and parameter are `monitoringStatus`; text keys are `monitoringStatus.*`. The plain word `status` is not used for it, because it already means `active` / `discharged` for a patient (glossary).

**Rejected**: one helper that returns everything (the spec asks for two); returning only a slug (hides the real variable names).

## R10. The two guard tests

### Raw-color scan (`styles/noRawColors.test.js`)

Reads every `.css`, `.js` and `.jsx` file under `src/` except `tokens.css`, `*.test.*` and `testing/`, and fails with the file and line when it finds:

1. **Hex colors**: `#` followed by 3, 4, 6 or 8 hex digits, as a whole word. Comments are removed first. In CSS the regex is applied only to declaration values (so an id selector never matches); in JS and JSX it is applied to the whole file.
2. **Color functions**: `rgb(`, `rgba(`, `hsl(`, `hsla(`, `hwb(`, `lab(`, `lch(`, `oklab(`, `oklch(`, `color(`, `color-mix(`.
3. **Named colors, without a color-name list**: in CSS, for properties that can hold a color (`color`, `background`, `background-color`, `background-image`, `border` and `border-*`, `outline`, `outline-color`, `fill`, `stroke`, `box-shadow`, `text-shadow`, `filter`, `text-decoration`, `caret-color`, `accent-color`), after removing `var(...)` the remaining words may only be line styles (`solid`, `dashed`, `dotted`, `double`, `none`), `transparent`, `currentColor`, `inherit`, `initial`, `unset`, numbers and lengths. Any other word (such as `red` or `white`) fails. This catches every named color without listing all 148. The allowed list is a constant in the test; a developer adds a keyword there if a new legitimate one appears.
4. **JSX color attributes**: `fill=`, `stroke=`, `color=` with a value other than `none` or `currentColor`.

Also fails on:

- an inline `style=` attribute in any `.jsx` file (frontend-dev rule);
- `font-size` in non-token CSS that is not `var(--font-size-*)` (keeps type at 16px and above);
- `color:` whose value is `var(--color-stable)`, `var(--color-warning)`, `var(--color-critical)` or `var(--color-no-data)` (FR-012: solid status colors are never text).

### Contrast test (`styles/contrast.test.js`)

Parses `tokens.css` into a map `--name → hex` (`testing/sourceFiles.js`), computes WCAG relative luminance and contrast ratio (`testing/contrast.js`, about 15 lines, checked against black/white = 21 and a known value), and asserts a named list of pairs. Pairs and thresholds are in [contracts/tokens.md](contracts/tokens.md). A pair that falls below its threshold fails with its name and the computed ratio.

**Static 44px check**: jsdom has no layout, so `Button.module.css` and `global.css` are read as text and must contain `min-height: var(--size-target)` (and `min-width` for buttons). This proves the rule is written, not how the browser renders it; the manual keyboard pass in the PR covers that (SC-004).

**Rejected**: a contrast or lint library (new dependency, for 15 lines of math); a stylelint rule set (new tool and config); browser-based accessibility tests such as axe or Playwright (new tools; heavier than the academic scope needs).

## R11. Page moves

**Decision**: `git mv src/StartPage.jsx src/pages/start/StartPage.jsx` and `git mv src/LoginPage.jsx src/pages/login/LoginPage.jsx`, so history follows. Fix their relative imports (`../../api/client.js`, `../../i18n/...`, `../../auth/...`). The only importers are `App.jsx` and `auth/RequireAuth.jsx`. The existing tests reach both pages only through `App`, so they need no edit. The order of work is: move, fix imports, run `npm test` (green), and only then restyle.

**Why the order matters**: a green run right after the move proves the move alone broke nothing; later failures then point at the styling.

**`hooks/`**: `.gitkeep` keeps the empty folder (git does not store empty folders). The first story that adds a hook deletes it.

## R12. Documentation and decisions

- **Glossary**: add `monitoring status` (`stable`, `warning`, `critical`, `no_data`; Spanish labels Estable, Vigilar, Crítico, Sin datos), and fill the UI column of `triage level` ("Triage I" to "Triage V"). Mark §1.1 mismatch 1 (display name) as resolved by TS-12.
- **DECISIONS D-42** (orchestrator): design tokens in one file, CSS Modules, status color never as text, the two guard tests, `App.css` removed.
- **Constitution**: no amendment needed.
