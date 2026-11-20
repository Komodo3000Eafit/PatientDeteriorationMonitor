// TS-13 FR-003 (research R7): isPatientCode accepts only upper-case letters, digits and '-',
// 1 to 20 characters (GLOSSARY "patient code", database String(20)). Synthetic codes only.
import { describe, it, expect } from 'vitest'
import { isPatientCode } from './patientCode.js'

const CODE_20 = 'PAT-' + '1'.repeat(16)
const CODE_21 = 'PAT-' + '1'.repeat(17)

describe('TS-13 FR-003 isPatientCode', () => {
  it('sanity: the boundary codes have 20 and 21 characters', () => {
    expect(CODE_20).toHaveLength(20)
    expect(CODE_21).toHaveLength(21)
  })

  it.each([
    ['PAT-001', 'PAT-001'],
    ['single letter', 'A'],
    ['digits only', '123'],
    ['single dash', '-'],
    ['20 characters (upper boundary)', CODE_20],
  ])('FR-003 accepts %s', (_name, value) => {
    expect(isPatientCode(value)).toBe(true)
  })

  it.each([
    ['lower case', 'pat-001'],
    ['space', 'PAT 001'],
    ['underscore', 'PAT_001'],
    ['markup', '<script>'],
    ['empty string', ''],
    ['21 characters (over the limit)', CODE_21],
    ['trailing newline', 'PAT-001\n'],
    ['undefined', undefined],
    ['null', null],
    ['number', 1],
    ['object', {}],
  ])('FR-003 rejects %s', (_name, value) => {
    expect(isPatientCode(value)).toBe(false)
  })
})
