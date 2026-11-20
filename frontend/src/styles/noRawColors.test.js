// TS-12 raw-color guard: AC2, FR-014 (no raw colors / inline styles / non-token font-size outside tokens.css); FR-003 (only main.jsx imports the global styles).
// Scans every .css/.js/.jsx under src/ (except styles/tokens.css, *.test.* and testing/) via
// listSourceFiles(); CSS values are read with cssDeclarations() (comments already removed).
// See specs/012-ui-foundation/research.md R10 and contracts/helpers-and-guards.md.
import { describe, it, expect } from 'vitest'
import { listSourceFiles, cssDeclarations } from '../testing/sourceFiles.js'

// --- Detection patterns --------------------------------------------------

// Rule a: hex colors — '#' followed by 8, 6, 4 or 3 hex digits as a whole word.
const HEX_RE = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g

// Rule b: CSS color functions — function name immediately followed by '(' (case-insensitive).
// color-mix is listed before color so the longer name wins when both could match.
const COLOR_FN_RE =
  /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\s*\(/gi

// Rule c: CSS properties that can carry a color value.
const COLOR_PROPERTIES = new Set([
  'color',
  'background',
  'background-color',
  'background-image',
  'border',
  'border-color',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-block-color',
  'border-inline-color',
  'outline',
  'outline-color',
  'fill',
  'stroke',
  'box-shadow',
  'text-shadow',
  'filter',
  'caret-color',
  'text-decoration',
  'text-decoration-color',
  'column-rule',
  'column-rule-color',
  'accent-color',
])

function isColorProperty(property) {
  const p = property.toLowerCase()
  if (COLOR_PROPERTIES.has(p)) return true
  // any border-*-color (e.g. border-block-start-color)
  return /^border-[\w-]+-color$/.test(p)
}

// Rule c: a reasonably complete set of CSS named colors. A bare alphabetic word is flagged only
// when it is in this set, so keywords such as solid, inherit, none, flex never trip the guard.
const NAMED_COLORS = new Set(
  [
    'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige',
    'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown',
    'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral',
    'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan',
    'darkgoldenrod', 'darkgray', 'darkgrey', 'darkgreen', 'darkkhaki',
    'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred',
    'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray',
    'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue',
    'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite',
    'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod',
    'gray', 'grey', 'green', 'greenyellow', 'honeydew', 'hotpink', 'indianred',
    'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen',
    'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan',
    'lightgoldenrodyellow', 'lightgray', 'lightgrey', 'lightgreen', 'lightpink',
    'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray',
    'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen',
    'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue',
    'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue',
    'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue',
    'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace',
    'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod',
    'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff',
    'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red',
    'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown',
    'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue',
    'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan',
    'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white',
    'whitesmoke', 'yellow', 'yellowgreen',
  ].map((c) => c.toLowerCase())
)

// Rule e: solid status tokens that must never be used as a text color.
const SOLID_STATUS_COLORS = new Set([
  'var(--color-stable)',
  'var(--color-warning)',
  'var(--color-critical)',
  'var(--color-no-data)',
])

// Rule d: a valid font-size value is exactly a --font-size-* token.
const FONT_SIZE_TOKEN_RE = /^var\(--font-size-[\w-]+\)$/

// Rule g: JSX color attributes with a literal string value.
const JSX_COLOR_ATTR_RE = /\b(fill|stroke|color)="([^"]*)"/g

// Remove every var(...) occurrence so only the remaining literal words are tokenized.
function stripVar(value) {
  return value.replace(/var\([^)]*\)/gi, ' ')
}

// --- The reusable checker ------------------------------------------------

// Returns an array of { file, line, text, reason } for the given file name and text.
// Branches on the file extension: .css uses cssDeclarations(); .jsx scans raw text line by line
// (plus the hex/color-function checks); .js applies only the hex/color-function checks.
export function findViolations(fileName, text) {
  const violations = []
  const name = fileName.toLowerCase()

  const scanHexAndFunctions = (lineText, lineNumber) => {
    for (const m of lineText.matchAll(HEX_RE)) {
      violations.push({
        file: fileName,
        line: lineNumber,
        text: m[0],
        reason: 'hex color',
      })
    }
    for (const m of lineText.matchAll(COLOR_FN_RE)) {
      violations.push({
        file: fileName,
        line: lineNumber,
        text: m[0],
        reason: 'color function',
      })
    }
  }

  if (name.endsWith('.css')) {
    for (const { property, value, line } of cssDeclarations(text)) {
      // a. hex colors in the value
      for (const m of value.matchAll(HEX_RE)) {
        violations.push({ file: fileName, line, text: m[0], reason: 'hex color' })
      }
      // b. color functions in the value
      for (const m of value.matchAll(COLOR_FN_RE)) {
        violations.push({ file: fileName, line, text: m[0], reason: 'color function' })
      }
      // c. named colors in color-bearing properties
      if (isColorProperty(property)) {
        const words = stripVar(value).match(/[a-zA-Z][a-zA-Z-]*/g) || []
        for (const word of words) {
          if (NAMED_COLORS.has(word.toLowerCase())) {
            violations.push({
              file: fileName,
              line,
              text: `${property}: ${value}`,
              reason: `named color '${word}'`,
            })
          }
        }
      }
      // d. font-size not from a --font-size-* token
      if (property.toLowerCase() === 'font-size' && !FONT_SIZE_TOKEN_RE.test(value.trim())) {
        violations.push({
          file: fileName,
          line,
          text: `font-size: ${value}`,
          reason: 'font-size not from a --font-size-* token',
        })
      }
      // e. the exact property `color` set to a solid status token
      if (property.toLowerCase() === 'color' && SOLID_STATUS_COLORS.has(value.trim())) {
        violations.push({
          file: fileName,
          line,
          text: `color: ${value}`,
          reason: 'solid status color used as text color',
        })
      }
    }
    return violations
  }

  if (name.endsWith('.jsx')) {
    const lines = text.split('\n')
    lines.forEach((lineText, index) => {
      const lineNumber = index + 1
      // f. inline style attribute
      if (/\bstyle=/.test(lineText)) {
        violations.push({
          file: fileName,
          line: lineNumber,
          text: lineText.trim(),
          reason: 'inline style',
        })
      }
      // g. JSX color attributes with a literal value other than none / currentColor
      for (const m of lineText.matchAll(JSX_COLOR_ATTR_RE)) {
        const attrValue = m[2]
        if (attrValue !== 'none' && attrValue !== 'currentColor') {
          violations.push({
            file: fileName,
            line: lineNumber,
            text: m[0],
            reason: `JSX ${m[1]} color attribute`,
          })
        }
      }
      // h. hex colors and color functions anywhere in the raw text
      scanHexAndFunctions(lineText, lineNumber)
    })
    return violations
  }

  if (name.endsWith('.js')) {
    text.split('\n').forEach((lineText, index) => {
      scanHexAndFunctions(lineText, index + 1)
    })
    return violations
  }

  return violations
}

// --- Scope of the real scan ----------------------------------------------

function isInScope(path) {
  if (path === 'styles/tokens.css') return false
  if (path.includes('.test.')) return false
  if (path.startsWith('testing/')) return false
  return path.endsWith('.css') || path.endsWith('.js') || path.endsWith('.jsx')
}

// --- Tests ---------------------------------------------------------------

describe('TS-12 raw-color guard (AC2, FR-014)', () => {
  it('finds no raw colors, inline styles or non-token font-size in shipped source', () => {
    const files = listSourceFiles().filter((f) => isInScope(f.path))
    const violations = files.flatMap((f) => findViolations(f.path, f.text))
    const report = violations.map((v) => `${v.file}:${v.line} ${v.reason}: ${v.text}`)
    expect(report, report.join('\n')).toEqual([])
  })

  describe('self-test: the checker reports bad strings and clears the good one', () => {
    it('does not flag a token-based CSS color', () => {
      expect(findViolations('self.css', '.x { color: var(--color-text); }')).toHaveLength(0)
    })

    it('flags a hex color in a CSS value', () => {
      expect(
        findViolations('self.css', '.x { color: #fff; }').length
      ).toBeGreaterThanOrEqual(1)
    })

    it('flags a color function in a CSS value', () => {
      expect(
        findViolations('self.css', '.x { color: rgb(0,0,0); }').length
      ).toBeGreaterThanOrEqual(1)
    })

    it('flags a named color in a color-bearing property', () => {
      expect(
        findViolations('self.css', '.x { border: 1px solid red; }').length
      ).toBeGreaterThanOrEqual(1)
    })

    it('flags a JSX color attribute literal', () => {
      expect(findViolations('self.jsx', 'fill="red"').length).toBeGreaterThanOrEqual(1)
    })

    it('flags an inline style in JSX', () => {
      expect(findViolations('self.jsx', 'style={{}}').length).toBeGreaterThanOrEqual(1)
    })

    it('allows the icon attributes fill="none" and stroke="currentColor"', () => {
      expect(findViolations('self.jsx', 'fill="none"')).toHaveLength(0)
      expect(findViolations('self.jsx', 'stroke="currentColor"')).toHaveLength(0)
    })
  })

  // FR-003: only src/main.jsx may import the global stylesheets.
  describe('FR-003: only main.jsx imports the global stylesheets', () => {
    const importers = (stylesheet) => {
      const re = new RegExp(`import\\s+['"][^'"]*styles/${stylesheet}['"]`)
      return listSourceFiles()
        .filter((f) => re.test(f.text))
        .map((f) => f.path)
        .sort()
    }

    it('only main.jsx imports styles/tokens.css', () => {
      expect(importers('tokens\\.css')).toEqual(['main.jsx'])
    })

    it('only main.jsx imports styles/global.css', () => {
      expect(importers('global\\.css')).toEqual(['main.jsx'])
    })
  })
})
