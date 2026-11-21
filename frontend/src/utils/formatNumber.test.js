// US-03 change request 2026-11-20: formatDecimal shows decimals with a comma in Spanish and a dot
// in English; whole numbers and other text unchanged (AC23, FR-025). Synthetic values only.
import { describe, it, expect } from 'vitest'
import { formatDecimal } from './formatNumber.js'

describe('US-03 AC23 formatDecimal (FR-025)', () => {
  it('AC23 "36.8" is "36,8" in Spanish and "36.8" in English', () => {
    expect(formatDecimal('36.8', 'es')).toBe('36,8')
    expect(formatDecimal('36.8', 'en')).toBe('36.8')
  })

  it('AC23 a numeric decimal 38.4 follows the language too', () => {
    expect(formatDecimal(38.4, 'es')).toBe('38,4')
    expect(formatDecimal(38.4, 'en')).toBe('38.4')
  })

  it('AC23 temperature limits "25.0" / "45.0" become "25,0" / "45,0" in Spanish', () => {
    expect(formatDecimal('25.0', 'es')).toBe('25,0')
    expect(formatDecimal('45.0', 'es')).toBe('45,0')
    expect(formatDecimal('45.0', 'en')).toBe('45.0')
  })

  it('AC23 whole numbers are unchanged in both languages', () => {
    expect(formatDecimal(25, 'es')).toBe('25')
    expect(formatDecimal(25, 'en')).toBe('25')
    expect(formatDecimal(0, 'es')).toBe('0')
    expect(formatDecimal('100', 'es')).toBe('100')
  })

  it('AC23 a negative decimal keeps its sign', () => {
    expect(formatDecimal('-1.5', 'es')).toBe('-1,5')
  })

  it('AC23 non-numeric text is unchanged ("A", "1.2.3", "1e2")', () => {
    expect(formatDecimal('A', 'es')).toBe('A')
    expect(formatDecimal('1.2.3', 'es')).toBe('1.2.3')
    expect(formatDecimal('1e2', 'es')).toBe('1e2')
    expect(formatDecimal('.5', 'es')).toBe('.5')
  })

  it('AC23 null and undefined give an empty text', () => {
    expect(formatDecimal(null, 'es')).toBe('')
    expect(formatDecimal(undefined, 'en')).toBe('')
  })

  it('AC23 an unknown or missing language keeps the dot', () => {
    expect(formatDecimal('36.8')).toBe('36.8')
    expect(formatDecimal('36.8', 'fr')).toBe('36.8')
  })
})
