// TS-12 contrast + target/focus guard: AC10, FR-013 (text 4.5:1, non-text 3:1), AC11, FR-015 (static 44px target and visible focus checks).
//
// Pairs are EXACTLY those listed in specs/012-ui-foundation/contracts/tokens.md
// ("Contrast pairs checked by contrast.test.js"). Ratios are recomputed from
// tokens.css via readTokens() rather than hard-coded, matching the contract note.
import { describe, it, expect } from 'vitest'
import { contrastRatio } from '../testing/contrast.js'
import { readTokens, listSourceFiles } from '../testing/sourceFiles.js'

const tokens = readTokens()

// Resolve a token name (without the leading '--color-' prefix) to its hex value.
function color(shortName) {
  const key = `--color-${shortName}`
  const value = tokens.get(key)
  if (!value) throw new Error(`token ${key} not found in tokens.css`)
  return value
}

describe('contrastRatio known values (self-test)', () => {
  it('pure black on white is 21 exactly', () => {
    // AC10/FR-013: the helper used for every assertion below must be correct.
    expect(contrastRatio('#000000', '#FFFFFF')).toBe(21)
  })

  it('mid-gray on white lands in a sensible mid range', () => {
    const ratio = contrastRatio('#777777', '#FFFFFF')
    expect(ratio).toBeGreaterThan(4)
    expect(ratio).toBeLessThan(5)
    expect(ratio).toBeCloseTo(4.48, 1)
  })

  it('a known-bad text pair is below 4.5 (so a failure WOULD be caught)', () => {
    // If the threshold check were broken, this would silently pass; it must not.
    expect(contrastRatio('#94A3B8', '#FFFFFF')).toBeLessThan(4.5)
  })
})

describe('text contrast >= 4.5:1 (AC10 / FR-013)', () => {
  // { name, fg, bg } using the short token names (prefixed with --color- in color()).
  const textPairs = [
    { name: 'text on bg', fg: 'text', bg: 'bg' },
    { name: 'text on bg-subtle', fg: 'text', bg: 'bg-subtle' },
    { name: 'text on primary-soft', fg: 'text', bg: 'primary-soft' },
    { name: 'text on stable-soft', fg: 'text', bg: 'stable-soft' },
    { name: 'text on warning-soft', fg: 'text', bg: 'warning-soft' },
    { name: 'text on critical-soft', fg: 'text', bg: 'critical-soft' },
    { name: 'text on no-data-soft', fg: 'text', bg: 'no-data-soft' },
    { name: 'bg on primary', fg: 'bg', bg: 'primary' },
    { name: 'bg on primary-hover', fg: 'bg', bg: 'primary-hover' },
    { name: 'no-data on bg-subtle', fg: 'no-data', bg: 'bg-subtle' },
  ]

  it.each(textPairs)('$name is at least 4.5:1', ({ name, fg, bg }) => {
    const ratio = contrastRatio(color(fg), color(bg))
    expect(ratio, `text/${name}: ${ratio.toFixed(2)} < 4.5`).toBeGreaterThanOrEqual(4.5)
  })
})

describe('meaningful non-text contrast >= 3:1 (AC10 / FR-013)', () => {
  const nonTextPairs = [
    { name: 'border-strong on bg', fg: 'border-strong', bg: 'bg' },
    { name: 'border-strong on bg-subtle', fg: 'border-strong', bg: 'bg-subtle' },
    { name: 'border-strong on warning-soft', fg: 'border-strong', bg: 'warning-soft' },
    { name: 'primary on bg', fg: 'primary', bg: 'bg' },
    { name: 'primary on bg-subtle', fg: 'primary', bg: 'bg-subtle' },
    { name: 'primary on warning-soft', fg: 'primary', bg: 'warning-soft' },
    { name: 'primary on primary-soft', fg: 'primary', bg: 'primary-soft' },
  ]

  it.each(nonTextPairs)('$name is at least 3:1', ({ name, fg, bg }) => {
    const ratio = contrastRatio(color(fg), color(bg))
    expect(ratio, `non-text/${name}: ${ratio.toFixed(2)} < 3`).toBeGreaterThanOrEqual(3)
  })
})

describe('static target-size and focus guards (AC11 / FR-015)', () => {
  const files = listSourceFiles()
  function fileText(relPath) {
    const entry = files.find((f) => f.path === relPath)
    if (!entry) throw new Error(`source file ${relPath} not found`)
    return entry.text
  }

  it('global.css sets a 44px min-height on form controls', () => {
    const text = fileText('styles/global.css')
    expect(text).toMatch(/min-height:\s*var\(\s*--size-target\s*\)/)
  })

  it('global.css has a :focus-visible rule using the focus ring', () => {
    const text = fileText('styles/global.css')
    expect(text).toMatch(/:focus-visible[^}]*var\(\s*--focus-ring\s*\)/s)
  })

  it('Button.module.css sets 44px min-height and min-width', () => {
    const text = fileText('components/Button.module.css')
    expect(text).toMatch(/min-height:\s*var\(\s*--size-target\s*\)/)
    expect(text).toMatch(/min-width:\s*var\(\s*--size-target\s*\)/)
  })

  it('Button.module.css has a :focus-visible rule using the focus ring', () => {
    const text = fileText('components/Button.module.css')
    expect(text).toMatch(/:focus-visible/)
    expect(text).toMatch(/:focus-visible[^}]*var\(\s*--focus-ring\s*\)/s)
  })
})
