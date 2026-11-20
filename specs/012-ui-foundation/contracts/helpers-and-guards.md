# Contract: helpers, text keys and guard tests (TS-12)

## `utils/monitoringStatus.js` (named exports)

```js
export const MONITORING_STATUSES = ['stable', 'warning', 'critical', 'no_data']

// Returns the status itself when it is exactly one of the four values, otherwise 'no_data'.
export function normalizeMonitoringStatus(value) {}

// → { name: 'stable' | 'warning' | 'critical' | 'no-data',
//     color: '--color-stable' …,  soft: '--color-stable-soft' … }
export function statusToToken(monitoringStatus) {}

// → 'monitoringStatus.stable' | '.warning' | '.critical' | '.no_data'
export function statusToLabelKey(monitoringStatus) {}
```

| Input | `statusToToken(...)` | `statusToLabelKey(...)` |
|---|---|---|
| `'stable'` | `{ name: 'stable', color: '--color-stable', soft: '--color-stable-soft' }` | `'monitoringStatus.stable'` |
| `'warning'` | `{ name: 'warning', color: '--color-warning', soft: '--color-warning-soft' }` | `'monitoringStatus.warning'` |
| `'critical'` | `{ name: 'critical', color: '--color-critical', soft: '--color-critical-soft' }` | `'monitoringStatus.critical'` |
| `'no_data'` | `{ name: 'no-data', color: '--color-no-data', soft: '--color-no-data-soft' }` | `'monitoringStatus.no_data'` |
| `undefined`, `null`, `''`, `'STABLE'`, `' stable'`, `'unknown'`, `3`, `{}` | the `no_data` row | the `no_data` row |

`normalizeMonitoringStatus` is exported for the badge and for later stories, so the fallback exists in one place. The helpers hold no clinical logic: they map one name to other names.

`utils/monitoringStatus.test.js` covers: the four rows above; every fallback input; that `color` and `soft` exist as variables in `tokens.css`; that each label key exists in `translations.es` and `translations.en` with the texts in the table below.

## Text keys added to `src/i18n/translations.js`

| Key | Spanish | English |
|---|---|---|
| `monitoringStatus.stable` | Estable | Stable |
| `monitoringStatus.warning` | Vigilar | Watch |
| `monitoringStatus.critical` | Crítico | Critical |
| `monitoringStatus.no_data` | Sin datos | No data |
| `triageLevel.1` | Triage I | Triage I |
| `triageLevel.2` | Triage II | Triage II |
| `triageLevel.3` | Triage III | Triage III |
| `triageLevel.4` | Triage IV | Triage IV |
| `triageLevel.5` | Triage V | Triage V |
| `triageLevel.none` | Sin nivel | No level |

No other text is added. The existing `translations.test.js` rules (English keys exist in Spanish, Spanish texts are non-empty) keep applying.

## `testing/sourceFiles.js` and `testing/contrast.js` (test helpers, not shipped)

```js
// sourceFiles.js
export function listSourceFiles()        // every .css/.js/.jsx under src/, as { path, text }
export function readTokens()             // tokens.css → Map('--color-text' → '#1E293B', …)
export function cssDeclarations(text)    // comments removed → [{ property, value, line }]
// contrast.js
export function contrastRatio(hexA, hexB) // WCAG 2.1, e.g. contrastRatio('#000000', '#FFFFFF') === 21
```

## Guard tests

| File | Asserts | Fails with |
|---|---|---|
| `styles/tokens.test.js` | the 13 spec colors have exactly the values in AC1; every `--font-size-*` is at least `1rem`; `--size-target` is at least `2.75rem`; every `var(--x)` used in any CSS file is defined in `tokens.css` | the token or file and the wrong value |
| `styles/contrast.test.js` | every pair in [tokens.md](tokens.md) meets its threshold; `contrastRatio` is correct on known values; `Button.module.css` and `global.css` contain the `--size-target` min sizes and `:focus-visible` with `--focus-ring` | the pair name and its ratio |
| `styles/noRawColors.test.js` | the rules in research R10 (hex, color functions, named colors, JSX color attributes, inline `style`, `font-size` not from tokens, solid status color as text) | file, line and the offending text |

To keep the scan honest, it has a self-test: it runs its checker on a few small strings (one good, several bad: `#fff`, `rgb(0,0,0)`, `border: 1px solid red`, `fill="red"`, `style={{}}`) and expects each bad one to be reported.
