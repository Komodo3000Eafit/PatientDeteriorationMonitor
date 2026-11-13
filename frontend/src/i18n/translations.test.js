// TS-05 translations module tests: AC1, AC7, FR-001, FR-002, following
// specs/005-language-disclaimer/contracts/i18n.md. Pure functions only; no network.
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  interpolate,
  translate,
  translations,
} from './translations.js'

const TEST_DICT = { es: { 'a.one': 'Uno', 'a.two': 'Dos' }, en: { 'a.one': 'One' } }

// The ten keys of contracts/i18n.md (TS-04 start page texts plus banner and switch label).
const CONTRACT_KEYS = [
  'app.title',
  'disclaimer.text',
  'language.label',
  'health.checking',
  'health.apiOk',
  'health.version',
  'health.databaseOk',
  'health.databaseUnavailable',
  'health.unreachable',
  'health.reloadHint',
]

describe('translate', () => {
  it('AC7 translate returns the English text when present', () => {
    expect(translate('en', 'a.one', TEST_DICT)).toBe('One')
  })

  it('AC7 translate falls back to Spanish when English lacks the key', () => {
    expect(translate('en', 'a.two', TEST_DICT)).toBe('Dos')
  })

  it('edge case: translate returns the key when missing in both', () => {
    expect(translate('en', 'a.three', TEST_DICT)).toBe('a.three')
    expect(translate('es', 'a.three', TEST_DICT)).toBe('a.three')
  })

  it('translate uses the real translations by default', () => {
    expect(translate('en', 'health.apiOk')).toBe('API: running')
  })
})

describe('interpolate', () => {
  it('interpolate replaces {name} and leaves unknown names', () => {
    expect(interpolate('Versión: {version}', { version: '0.1.0' })).toBe('Versión: 0.1.0')
    expect(interpolate('x {y}', {})).toBe('x {y}')
    expect(interpolate('x', undefined)).toBe('x')
  })
})

describe('translations collections', () => {
  it('FR-002 every English key exists in Spanish', () => {
    for (const key of Object.keys(translations.en)) {
      expect(translations.es, `missing Spanish key ${key}`).toHaveProperty([key])
    }
  })

  it('FR-001 every Spanish text is a non-empty string', () => {
    for (const [key, text] of Object.entries(translations.es)) {
      expect(typeof text, key).toBe('string')
      expect(text.trim().length, key).toBeGreaterThan(0)
    }
  })

  it('TS-04 keys are all present', () => {
    for (const key of CONTRACT_KEYS) {
      expect(translations.es, `es ${key}`).toHaveProperty([key])
      expect(translations.en, `en ${key}`).toHaveProperty([key])
    }
  })

  it('AC6 disclaimer texts are exactly as specified', () => {
    expect(translations.es['disclaimer.text']).toBe(
      'Prototipo académico: no es un dispositivo médico certificado.',
    )
    expect(translations.en['disclaimer.text']).toBe(
      'Academic prototype: not a certified medical device.',
    )
  })

  it('LANGUAGES lists es and en', () => {
    expect(LANGUAGES).toEqual([
      { code: 'es', short: 'ES', name: 'Español' },
      { code: 'en', short: 'EN', name: 'English' },
    ])
  })

  it('DEFAULT_LANGUAGE is es', () => {
    expect(DEFAULT_LANGUAGE).toBe('es')
  })
})
