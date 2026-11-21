// TS-12 token guard: AC1 — the design tokens have exactly the spec values and no font below 1rem.
// Verifies specs/012-ui-foundation/contracts/tokens.md: the 13 spec colors hold their exact
// values, the spacing/radius/focus/size/type tokens exist, every --font-size-* is at least
// 1rem, --size-target is at least 2.75rem, and every var(--x) used in any CSS file under src/
// is defined in tokens.css.
import { describe, it, expect } from 'vitest'
import { listSourceFiles, readTokens } from '../testing/sourceFiles.js'

// The 13 colors required by AC1, compared case-sensitively to the upper-case hex in tokens.css.
const SPEC_COLORS = {
  '--color-stable': '#10B981',
  '--color-stable-soft': '#D1FAE5',
  '--color-warning': '#F59E0B',
  '--color-warning-soft': '#FEF3C7',
  '--color-critical': '#E11D48',
  '--color-critical-soft': '#FFE4E6',
  '--color-no-data': '#64748B',
  '--color-no-data-soft': '#F1F5F9',
  '--color-bg': '#FFFFFF',
  '--color-bg-subtle': '#F8FAFC',
  '--color-primary': '#2563EB',
  '--color-primary-soft': '#EFF6FF',
  '--color-text': '#1E293B',
}

// Non-color tokens that MUST exist (value checked elsewhere or only required to be present).
const REQUIRED_TOKENS = [
  '--space-1',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-5',
  '--space-6',
  '--radius-sm',
  '--radius-md',
  '--radius-pill',
  '--focus-ring',
  '--focus-offset',
  '--size-target',
  '--font-family',
  '--line-height',
]

// US-01 (FR-018): the ten triage tile colors added by specs/015-register-patient, exact values.
const TRIAGE_COLORS = {
  '--color-triage-1': '#DC2626',
  '--color-triage-1-soft': '#FEE2E2',
  '--color-triage-2': '#C2410C',
  '--color-triage-2-soft': '#FFEDD5',
  '--color-triage-3': '#A16207',
  '--color-triage-3-soft': '#FEF9C3',
  '--color-triage-4': '#15803D',
  '--color-triage-4-soft': '#DCFCE7',
  '--color-triage-5': '#1D4ED8',
  '--color-triage-5-soft': '#DBEAFE',
}

describe('US-01 triage tile tokens (FR-018)', () => {
  const tokens = readTokens()
  for (const [name, value] of Object.entries(TRIAGE_COLORS)) {
    it(`${name} is ${value}`, () => {
      expect(tokens.get(name)).toBe(value)
    })
  }
})

// US-03 change request 2026-11-20 (AC21, FR-023): the two medium risk band tokens, exact values.
const BAND_MEDIUM_COLORS = {
  '--color-band-medium': '#EA580C',
  '--color-band-medium-soft': '#FFEDD5',
}

describe('US-03 risk band medium tokens (AC21 / FR-023)', () => {
  const tokens = readTokens()
  for (const [name, value] of Object.entries(BAND_MEDIUM_COLORS)) {
    it(`AC21 ${name} is ${value}`, () => {
      expect(tokens.get(name)).toBe(value)
    })
  }
})

describe('TS-12 token guard (AC1)', () => {
  // AC1: the 13 spec colors have exactly the values listed in tokens.md.
  describe('the 13 spec colors have exactly their spec values', () => {
    const tokens = readTokens()
    for (const [name, value] of Object.entries(SPEC_COLORS)) {
      it(`${name} is ${value}`, () => {
        expect(tokens.get(name)).toBe(value)
      })
    }
  })

  // AC1: spacing, radius, focus, size and type tokens exist.
  it('defines every required spacing/radius/focus/size/type token', () => {
    const tokens = readTokens()
    const missing = REQUIRED_TOKENS.filter((name) => !tokens.has(name))
    expect(missing, `tokens.css is missing: ${missing.join(', ')}`).toEqual([])
  })

  // AC1: every --font-size-* token is at least 1rem (tokens are in rem).
  it('keeps every --font-size-* at 1rem or larger', () => {
    const tokens = readTokens()
    const fontSizes = [...tokens.entries()].filter(([name]) =>
      name.startsWith('--font-size-'),
    )
    // Guard against a renamed/removed scale that would make the check vacuous.
    expect(fontSizes.length, 'no --font-size-* tokens found in tokens.css').toBeGreaterThan(0)
    for (const [name, raw] of fontSizes) {
      const rem = Number.parseFloat(String(raw).replace('rem', '').trim())
      expect(
        Number.isNaN(rem),
        `${name}: value '${raw}' is not a rem number`,
      ).toBe(false)
      expect(rem, `${name} is ${raw}, below the 1rem minimum`).toBeGreaterThanOrEqual(1)
    }
  })

  // AC1: --size-target (the minimum touch target) is at least 2.75rem.
  it('keeps --size-target at 2.75rem or larger', () => {
    const tokens = readTokens()
    const raw = tokens.get('--size-target')
    expect(raw, '--size-target is missing from tokens.css').toBeDefined()
    const rem = Number.parseFloat(String(raw).replace('rem', '').trim())
    expect(
      Number.isNaN(rem),
      `--size-target: value '${raw}' is not a rem number`,
    ).toBe(false)
    expect(rem, `--size-target is ${raw}, below the 2.75rem minimum`).toBeGreaterThanOrEqual(
      2.75,
    )
  })

  // AC1: every var(--x) used in any CSS file under src/ is defined in tokens.css.
  it('defines every var(--x) referenced in any src/ CSS file', () => {
    const tokens = readTokens()
    const varRe = /var\(\s*(--[\w-]+)/g
    const offenders = []
    for (const file of listSourceFiles()) {
      if (!file.path.endsWith('.css')) continue
      if (file.path === 'styles/tokens.css') continue
      let match
      while ((match = varRe.exec(file.text)) !== null) {
        const name = match[1]
        if (!tokens.has(name)) offenders.push([file.path, name])
      }
    }
    const report = offenders.map(([path, name]) => `${path}: ${name}`).join('\n')
    expect(offenders, `undefined tokens referenced:\n${report}`).toEqual([])
  })
})
