// TS-13 AC4, FR-006 (research R4): the return-to page after sign-in is used only when it is an
// internal app path other than /login; anything else lands on /patients (no open redirect).
// Synthetic patient codes only.
import { describe, it, expect } from 'vitest'
import { returnPath } from './returnPath.js'

describe('TS-13 AC4 FR-006 returnPath', () => {
  it.each(['/patients/PAT-003', '/patients'])('AC4 returns the remembered internal page %s', (from) => {
    expect(returnPath({ from })).toBe(from)
  })

  it.each([
    ['undefined state', undefined],
    ['null state', null],
    ['state without from', {}],
    ['from is a number', { from: 5 }],
    ['from is empty', { from: '' }],
    ['relative path', { from: 'patients' }],
    ['outside site', { from: 'https://evil.example' }],
    ['protocol-relative host', { from: '//evil.example' }],
    ['slash-backslash host', { from: '/\\evil.example' }],
    ['the login page', { from: '/login' }],
    ['under the login page', { from: '/login/x' }],
  ])('FR-006 falls back to /patients for %s', (_name, state) => {
    expect(() => returnPath(state)).not.toThrow()
    expect(returnPath(state)).toBe('/patients')
  })

  // TS-13 T025 security finding 1: the browser URL parser strips tab/CR/LF, so "/\t/evil.example"
  // would become "//evil.example" (protocol-relative, outside the site). Any control character
  // (U+0000-U+001F, U+007F) or a backslash anywhere in `from` falls back to /patients.
  it.each([
    ['tab before second slash', '/\t/evil.example'],
    ['newline before second slash', '/\n/evil.example'],
    ['trailing carriage return', '/patients\r'],
    ['trailing newline', '/patients\n'],
    ['NUL in the middle', '/a\u0000b'],
    ['U+001F in the middle', '/a\u001Fb'],
    ['DEL (U+007F) in the middle', '/a\u007Fb'],
    ['backslash in the middle', '/patients/a\\b'],
  ])('T025 finding 1: FR-006 falls back to /patients for %s', (_name, from) => {
    expect(() => returnPath({ from })).not.toThrow()
    expect(returnPath({ from })).toBe('/patients')
  })

  // TS-13 T025 security finding 1: ordinary internal paths are not affected by the hardening.
  // A percent-encoded "//" stays a same-origin path, so it is returned as is.
  it.each(['/patients/PAT-003', '/patients/AB-1', '/%2F%2Fevil.example'])(
    'T025 finding 1: AC4 still returns the ordinary internal path %s unchanged',
    (from) => {
      expect(returnPath({ from })).toBe(from)
    },
  )
})
