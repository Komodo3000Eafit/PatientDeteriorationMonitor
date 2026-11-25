// Chart colors read from design tokens at run time (US-06, research R5, FR-012). A canvas cannot
// use var(--…), so the computed value of each token is read once per render and passed to Chart.js.
// tokens.css stays the single source of color; no raw color literal appears here. An empty value
// (jsdom in tests, where no stylesheet is applied) is left undefined so Chart.js uses its defaults.

// Trim a computed custom-property value; return undefined when it is empty.
function tokenValue(styles, name) {
  const value = styles.getPropertyValue(name).trim()
  return value === '' ? undefined : value
}

// { line, text, grid } from --color-primary (line/points), --color-text (ticks/titles),
// --color-border (grid).
export function readChartColors() {
  const styles = getComputedStyle(document.documentElement)
  return {
    line: tokenValue(styles, '--color-primary'),
    text: tokenValue(styles, '--color-text'),
    grid: tokenValue(styles, '--color-border'),
  }
}
