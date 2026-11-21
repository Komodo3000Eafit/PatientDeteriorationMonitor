// US-03 change request 2026-11-20: bandStatus maps a stored risk band to a badge style
// (AC21, FR-023), following specs/017-vital-signs-scoring/contracts/ui.md "Risk band badge".
// Presentation only: no clinical logic. Synthetic band values only.
import { describe, it, expect } from 'vitest'
import { RISK_BANDS, bandStatus } from './bandStatus.js'

const EXPECTED = {
  low: { tone: 'stable', icon: 'CheckCircle', labelKey: 'riskBand.low' },
  'low-medium': { tone: 'warning', icon: 'TriangleAlert', labelKey: 'riskBand.low-medium' },
  medium: { tone: 'band-medium', icon: 'CircleAlert', labelKey: 'riskBand.medium' },
  high: { tone: 'critical', icon: 'OctagonX', labelKey: 'riskBand.high' },
}
const UNKNOWN = { tone: 'no-data', icon: 'CircleDashed', labelKey: 'riskBand.unknown' }

describe('US-03 AC21 bandStatus (FR-023)', () => {
  it('AC21 RISK_BANDS lists the four stored bands in order', () => {
    expect(RISK_BANDS).toEqual(['low', 'low-medium', 'medium', 'high'])
  })

  it.each(Object.entries(EXPECTED))('AC21 band "%s" gives its tone, icon and label key', (band, style) => {
    expect(bandStatus(band)).toEqual(style)
  })

  it('AC21 the four bands use four distinct tones and four distinct icons (color is not the only cue)', () => {
    const styles = RISK_BANDS.map((band) => bandStatus(band))
    expect(new Set(styles.map((s) => s.tone)).size).toBe(4)
    expect(new Set(styles.map((s) => s.icon)).size).toBe(4)
    expect(styles.map((s) => s.tone)).toEqual(['stable', 'warning', 'band-medium', 'critical'])
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['"x"', 'x'],
    ['empty text', ''],
    ['upper-case "HIGH"', 'HIGH'],
    ['an inherited key "toString"', 'toString'],
    ['"__proto__"', '__proto__'],
  ])('AC21 unknown band %s gives the no-data style with riskBand.unknown', (_label, band) => {
    expect(bandStatus(band)).toEqual(UNKNOWN)
  })

  it('AC21 the unknown icon differs from every band icon', () => {
    const icons = RISK_BANDS.map((band) => bandStatus(band).icon)
    expect(icons).not.toContain(UNKNOWN.icon)
  })
})
