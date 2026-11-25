// US-06 vital signs chart: unit tests for the chart parameter definitions and point builder
// (chartParameters.js). Pure functions, no React, no network, synthetic data only.
// Covers AC2 (data order oldest -> newest), AC3 (stored NEWS2 score.total, never recomputed) and
// AC4 (exactly six parameters in order, no oxygen/consciousness). Contract:
// specs/022-vital-signs-chart/contracts/ui.md and spec.md FR-003, FR-004.
import { describe, it, expect } from 'vitest'
import {
  CHART_PARAMETERS,
  DEFAULT_PARAMETER,
  toPoints,
} from './chartParameters.js'

// A synthetic reading whose raw vitals, if NEWS2 were recomputed here, would not sum to the stored
// total: the stored score.total is a deliberately impossible 99 so any accessor that read the
// vitals instead of the stored total would produce a different number. This proves score reads
// score.total as stored (AC3, FR-003: "never recomputed").
const READING_STORED_SCORE = {
  recorded_at: '2026-11-20T15:04:05.000Z',
  respiratory_rate: 12,
  spo2: 98,
  on_oxygen: false,
  systolic_bp: 120,
  heart_rate: 70,
  consciousness: 'A',
  temperature: '36.8',
  // Healthy vitals would score 0 under NEWS2; the stored total is 99 on purpose.
  score: { system: 'NEWS2', total: 99, band: 'high', entries: [] },
}

describe('US-06 AC4 CHART_PARAMETERS shape and order', () => {
  it('AC4 has exactly six parameters in the contract order', () => {
    expect(CHART_PARAMETERS.map((p) => p.key)).toEqual([
      'score',
      'respiratory_rate',
      'spo2',
      'systolic_bp',
      'heart_rate',
      'temperature',
    ])
  })

  it('AC4 offers no on_oxygen and no consciousness parameter', () => {
    const keys = CHART_PARAMETERS.map((p) => p.key)
    expect(keys).not.toContain('on_oxygen')
    expect(keys).not.toContain('consciousness')
  })

  it('AC4 maps each parameter to its translation key', () => {
    const byKey = Object.fromEntries(CHART_PARAMETERS.map((p) => [p.key, p.labelKey]))
    expect(byKey.score).toBe('recordReading.score')
    expect(byKey.respiratory_rate).toBe('parameter.respiratory_rate')
    expect(byKey.spo2).toBe('parameter.spo2')
    expect(byKey.systolic_bp).toBe('parameter.systolic_bp')
    expect(byKey.heart_rate).toBe('parameter.heart_rate')
    expect(byKey.temperature).toBe('parameter.temperature')
  })
})

describe('US-06 AC3 default parameter and stored score', () => {
  it('AC3 DEFAULT_PARAMETER is the NEWS2 score', () => {
    expect(DEFAULT_PARAMETER).toBe('score')
  })

  it('AC3 the score accessor reads the stored score.total, never recomputed from vitals', () => {
    const score = CHART_PARAMETERS.find((p) => p.key === 'score')
    // Healthy vitals would score 0 if recomputed; the accessor must return the stored 99.
    expect(score.value(READING_STORED_SCORE)).toBe(99)
  })
})

describe('US-06 AC4 vital-sign accessors read the raw reading fields', () => {
  it('AC4 each vital sign accessor returns its stored field value', () => {
    const by = Object.fromEntries(CHART_PARAMETERS.map((p) => [p.key, p.value]))
    expect(by.respiratory_rate(READING_STORED_SCORE)).toBe(12)
    expect(by.spo2(READING_STORED_SCORE)).toBe(98)
    expect(by.systolic_bp(READING_STORED_SCORE)).toBe(120)
    expect(by.heart_rate(READING_STORED_SCORE)).toBe(70)
  })

  it('AC4 temperature "38.4" is converted to the number 38.4', () => {
    const temperature = CHART_PARAMETERS.find((p) => p.key === 'temperature')
    const value = temperature.value({ ...READING_STORED_SCORE, temperature: '38.4' })
    expect(value).toBe(38.4)
    expect(typeof value).toBe('number')
  })
})

describe('US-06 AC2 toPoints order and mapping', () => {
  // The API returns readings newest first; the chart draws oldest -> newest.
  const NEWEST_FIRST = [
    { recorded_at: '2026-11-20T15:10:00.000Z', score: { total: 3 }, heart_rate: 80, temperature: '37.0' },
    { recorded_at: '2026-11-20T15:05:00.000Z', score: { total: 2 }, heart_rate: 75, temperature: '36.9' },
    { recorded_at: '2026-11-20T15:00:00.000Z', score: { total: 1 }, heart_rate: 70, temperature: '36.8' },
  ]

  it('AC2 reverses a newest-first input to oldest-first', () => {
    const points = toPoints(NEWEST_FIRST, 'score')
    // Oldest (15:00) first, newest (15:10) last.
    expect(points.map((p) => p.value)).toEqual([1, 2, 3])
  })

  it('AC2 maps recorded_at to a Date and the chosen parameter value', () => {
    const points = toPoints(NEWEST_FIRST, 'heart_rate')
    expect(points).toHaveLength(3)
    expect(points[0].recordedAt).toBeInstanceOf(Date)
    expect(points[0].recordedAt.toISOString()).toBe('2026-11-20T15:00:00.000Z')
    expect(points.map((p) => p.value)).toEqual([70, 75, 80])
  })

  it('AC2 converts temperature strings to numbers in point order', () => {
    const points = toPoints(NEWEST_FIRST, 'temperature')
    expect(points.map((p) => p.value)).toEqual([36.8, 36.9, 37.0])
  })

  it('AC2 returns an empty array for no readings or an unknown parameter', () => {
    expect(toPoints([], 'score')).toEqual([])
    expect(toPoints(NEWEST_FIRST, 'does_not_exist')).toEqual([])
    expect(toPoints(null, 'score')).toEqual([])
  })
})
