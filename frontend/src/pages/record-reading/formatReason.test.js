// US-03 formatReason / formatValue tests: AC14 (the reason for each point) and AC20 (both
// languages), following specs/017-vital-signs-scoring/contracts/ui.md "Result view". The helpers
// only turn the stored range or category into text; they never compute points. Synthetic entries.
//
// Exact texts copied from frontend/src/i18n/translations.js:
//   yesNo.true / yesNo.false   es 'Sí' / 'No'      en 'Yes' / 'No'
//   consciousness.A            es 'Alerta'         en 'Alert'
//   consciousness.U            es 'No responde'    en 'Unresponsive'
import { describe, it, expect } from 'vitest'
import { translate } from '../../i18n/translations.js'
import { formatReason, formatValue } from './formatReason.js'

const tEs = (key) => translate('es', key)
const tEn = (key) => translate('en', key)

function entry(parameter, { value = 0, points = 0, low = null, high = null, category = [] } = {}) {
  return { parameter, value, points, low, high, category }
}

describe('US-03 AC14 formatReason ranges', () => {
  it('AC14 low and high give "21–24" (en dash)', () => {
    expect(formatReason(entry('respiratory_rate', { value: 22, points: 2, low: 21, high: 24 }), tEs)).toBe(
      '21–24',
    )
  })

  it('AC14 only high gives "≤ 8"', () => {
    expect(formatReason(entry('respiratory_rate', { value: 6, points: 3, high: 8 }), tEs)).toBe('≤ 8')
  })

  it('AC14 only low gives "≥ 25"', () => {
    expect(formatReason(entry('respiratory_rate', { value: 30, points: 3, low: 25 }), tEs)).toBe('≥ 25')
  })

  it('AC14 a stored decimal range for temperature is shown as given ("38.1–39.0")', () => {
    expect(
      formatReason(entry('temperature', { value: '38.4', points: 1, low: '38.1', high: '39.0' }), tEs),
    ).toBe('38.1–39.0')
  })

  it('AC14 a zero low bound still counts as a bound ("0–91")', () => {
    expect(formatReason(entry('spo2', { value: 0, points: 3, low: 0, high: 91 }), tEs)).toBe('0–91')
  })
})

describe('US-03 AC14/AC20 formatReason categories', () => {
  it('AC14 consciousness letters are joined with ", " ("C, V, P, U")', () => {
    const e = entry('consciousness', { value: 'V', points: 3, category: ['C', 'V', 'P', 'U'] })
    expect(formatReason(e, tEs)).toBe('C, V, P, U')
    expect(formatReason(e, tEn)).toBe('C, V, P, U')
  })

  it('AC14 consciousness single category "A"', () => {
    expect(formatReason(entry('consciousness', { value: 'A', category: ['A'] }), tEs)).toBe('A')
  })

  it('AC20 on oxygen [true] gives "Sí" in Spanish and "Yes" in English', () => {
    const e = entry('on_oxygen', { value: true, points: 2, category: [true] })
    expect(formatReason(e, tEs)).toBe('Sí')
    expect(formatReason(e, tEn)).toBe('Yes')
  })

  it('AC20 on oxygen [false] gives "No" in both languages', () => {
    const e = entry('on_oxygen', { value: false, points: 0, category: [false] })
    expect(formatReason(e, tEs)).toBe('No')
    expect(formatReason(e, tEn)).toBe('No')
  })
})

describe('US-03 AC14/AC20 formatValue', () => {
  it('AC14 on oxygen value shows "Sí"/"No" (es) and "Yes"/"No" (en)', () => {
    expect(formatValue(entry('on_oxygen', { value: true }), tEs)).toBe('Sí')
    expect(formatValue(entry('on_oxygen', { value: false }), tEs)).toBe('No')
    expect(formatValue(entry('on_oxygen', { value: true }), tEn)).toBe('Yes')
    expect(formatValue(entry('on_oxygen', { value: false }), tEn)).toBe('No')
  })

  it('AC14 consciousness value shows the letter and its meaning text', () => {
    expect(formatValue(entry('consciousness', { value: 'A' }), tEs)).toBe('A — Alerta')
    expect(formatValue(entry('consciousness', { value: 'U' }), tEs)).toBe('U — No responde')
    expect(formatValue(entry('consciousness', { value: 'A' }), tEn)).toBe('A — Alert')
    expect(formatValue(entry('consciousness', { value: 'U' }), tEn)).toBe('U — Unresponsive')
  })

  it('AC14 temperature is shown as given ("38.4"), integers as numbers', () => {
    expect(formatValue(entry('temperature', { value: '38.4' }), tEs)).toBe('38.4')
    expect(formatValue(entry('temperature', { value: '37.0' }), tEs)).toBe('37.0')
    expect(formatValue(entry('heart_rate', { value: 96 }), tEs)).toBe('96')
  })
})

// Change request 2026-11-20: numbers follow the decimal separator of the UI language.
describe('US-03 AC23 formatReason / formatValue number format by language (FR-025)', () => {
  const temperature = entry('temperature', { value: '38.4', points: 1, low: '38.1', high: '39.0' })

  it('AC23 temperature reason is "38,1–39,0" in Spanish and "38.1–39.0" in English', () => {
    expect(formatReason(temperature, tEs, 'es')).toBe('38,1–39,0')
    expect(formatReason(temperature, tEn, 'en')).toBe('38.1–39.0')
  })

  it('AC23 temperature value is "38,4" in Spanish and "38.4" in English', () => {
    expect(formatValue(temperature, tEs, 'es')).toBe('38,4')
    expect(formatValue(temperature, tEn, 'en')).toBe('38.4')
  })

  it('AC23 one-sided decimal ranges use the language separator ("≤ 35,0", "≥ 39,1")', () => {
    expect(formatReason(entry('temperature', { value: '34.0', points: 3, high: '35.0' }), tEs, 'es')).toBe('≤ 35,0')
    expect(formatReason(entry('temperature', { value: '39.5', points: 2, low: '39.1' }), tEs, 'es')).toBe('≥ 39,1')
    expect(formatReason(entry('temperature', { value: '34.0', points: 3, high: '35.0' }), tEn, 'en')).toBe('≤ 35.0')
  })

  it('AC23 whole-number ranges and values are unchanged in Spanish', () => {
    expect(formatReason(entry('respiratory_rate', { value: 22, points: 2, low: 21, high: 24 }), tEs, 'es')).toBe('21–24')
    expect(formatValue(entry('heart_rate', { value: 96 }), tEs, 'es')).toBe('96')
  })

  it('AC23 categories are not changed by the language separator', () => {
    const e = entry('consciousness', { value: 'V', points: 3, category: ['C', 'V', 'P', 'U'] })
    expect(formatReason(e, tEs, 'es')).toBe('C, V, P, U')
    expect(formatValue(entry('consciousness', { value: 'A' }), tEs, 'es')).toBe('A — Alerta')
  })
})
