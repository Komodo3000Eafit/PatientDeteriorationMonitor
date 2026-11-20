// TS-12 monitoring-status helpers: AC9 (no clinical logic, name/label mapping), AC6 (no_data fallback), AC12 (labels in both languages).
import { describe, it, expect } from 'vitest'
import {
  MONITORING_STATUSES,
  normalizeMonitoringStatus,
  statusToToken,
  statusToLabelKey,
} from './monitoringStatus.js'
import { readTokens } from '../testing/sourceFiles.js'
import { translations } from '../i18n/translations.js'

// The four contract rows from specs/012-ui-foundation/contracts/helpers-and-guards.md.
const ROWS = [
  {
    status: 'stable',
    token: { name: 'stable', color: '--color-stable', soft: '--color-stable-soft' },
    labelKey: 'monitoringStatus.stable',
  },
  {
    status: 'warning',
    token: { name: 'warning', color: '--color-warning', soft: '--color-warning-soft' },
    labelKey: 'monitoringStatus.warning',
  },
  {
    status: 'critical',
    token: { name: 'critical', color: '--color-critical', soft: '--color-critical-soft' },
    labelKey: 'monitoringStatus.critical',
  },
  {
    status: 'no_data',
    token: { name: 'no-data', color: '--color-no-data', soft: '--color-no-data-soft' },
    labelKey: 'monitoringStatus.no_data',
  },
]

const NO_DATA_TOKEN = { name: 'no-data', color: '--color-no-data', soft: '--color-no-data-soft' }
const FALLBACK_INPUTS = [undefined, null, '', 'STABLE', ' stable', 'unknown', 3, {}]

// AC9: statusToToken maps each of the four statuses to the exact contract row.
describe('statusToToken — contract rows (AC9)', () => {
  for (const { status, token } of ROWS) {
    it(`maps '${status}' to its token row`, () => {
      expect(statusToToken(status)).toEqual(token)
    })
  }
})

// AC9: statusToLabelKey maps each of the four statuses to the exact contract key.
describe('statusToLabelKey — contract rows (AC9)', () => {
  for (const { status, labelKey } of ROWS) {
    it(`maps '${status}' to '${labelKey}'`, () => {
      expect(statusToLabelKey(status)).toBe(labelKey)
    })
  }
})

// AC6: every unknown / malformed input falls back to the no_data row in one place.
describe('fallback to no_data for invalid input (AC6)', () => {
  for (const input of FALLBACK_INPUTS) {
    const label = JSON.stringify(input)
    it(`statusToToken(${label}) deep-equals the no_data row`, () => {
      expect(statusToToken(input)).toEqual(NO_DATA_TOKEN)
    })
    it(`statusToLabelKey(${label}) === 'monitoringStatus.no_data'`, () => {
      expect(statusToLabelKey(input)).toBe('monitoringStatus.no_data')
    })
    it(`normalizeMonitoringStatus(${label}) === 'no_data'`, () => {
      expect(normalizeMonitoringStatus(input)).toBe('no_data')
    })
  }
})

// AC6/AC9: a valid status is returned unchanged by normalizeMonitoringStatus.
describe('normalizeMonitoringStatus returns valid values unchanged (AC6)', () => {
  for (const value of MONITORING_STATUSES) {
    it(`returns '${value}' unchanged`, () => {
      expect(normalizeMonitoringStatus(value)).toBe(value)
    })
  }
})

// AC1/AC9: the color and soft tokens each helper references exist in tokens.css.
describe('token existence in tokens.css (AC9)', () => {
  const tokens = readTokens()
  for (const { status } of ROWS) {
    it(`'${status}' color and soft tokens are defined`, () => {
      const { color, soft } = statusToToken(status)
      expect(tokens.has(color)).toBe(true)
      expect(tokens.has(soft)).toBe(true)
    })
  }
})

// AC12: every label key exists in both languages with the exact contract text.
describe('labels exist in both languages with contract texts (AC12)', () => {
  const EXPECTED = {
    'monitoringStatus.stable': { es: 'Estable', en: 'Stable' },
    'monitoringStatus.warning': { es: 'Vigilar', en: 'Watch' },
    'monitoringStatus.critical': { es: 'Crítico', en: 'Critical' },
    'monitoringStatus.no_data': { es: 'Sin datos', en: 'No data' },
  }
  for (const { labelKey } of ROWS) {
    it(`'${labelKey}' has the Spanish text`, () => {
      expect(translations.es[labelKey]).toBe(EXPECTED[labelKey].es)
    })
    it(`'${labelKey}' has the English text`, () => {
      expect(translations.en[labelKey]).toBe(EXPECTED[labelKey].en)
    })
  }
})
