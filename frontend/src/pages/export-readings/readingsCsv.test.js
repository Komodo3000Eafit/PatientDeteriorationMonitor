// US-10 T010: pure tests of the CSV util (readingsCsv.js), following
// specs/026-export-vitals-csv/contracts/ui.md. No DOM, no network. Synthetic readings only.
import { describe, it, expect } from 'vitest'
import { CSV_COLUMNS, buildReadingsCsv, csvField, exportFileName } from './readingsCsv.js'

const HEADER =
  'recorded_at,respiratory_rate,spo2,on_oxygen,systolic_bp,heart_rate,consciousness,temperature,news2_total,risk_band\r\n'

// Newest reading: vitals that would score high under NEWS2, but the stored score is total 19,
// band 'low'. The CSV must carry the stored values, proving nothing is recomputed.
const NEWER = {
  recorded_at: '2026-11-22T10:05:00.123456Z',
  respiratory_rate: 30,
  spo2: 88,
  on_oxygen: true,
  systolic_bp: 85,
  heart_rate: 140,
  consciousness: 'V',
  temperature: '39.6',
  score: { system: 'NEWS2', total: 19, band: 'low', entries: [] },
}

// Older reading: temperature kept as the string "37.0", on_oxygen false.
const OLDER = {
  recorded_at: '2026-11-22T10:00:00.000001Z',
  respiratory_rate: 16,
  spo2: 97,
  on_oxygen: false,
  systolic_bp: 120,
  heart_rate: 72,
  consciousness: 'A',
  temperature: '37.0',
  score: { system: 'NEWS2', total: 0, band: 'low', entries: [] },
}

const NEWER_RECORD = '2026-11-22T10:05:00.123456Z,30,88,true,85,140,V,39.6,19,low\r\n'
const OLDER_RECORD = '2026-11-22T10:00:00.000001Z,16,97,false,120,72,A,37.0,0,low\r\n'

describe('US-10 buildReadingsCsv', () => {
  it('AC2/AC4/FR-008 an empty list gives exactly the header record', () => {
    expect(buildReadingsCsv([])).toBe(HEADER)
    expect(CSV_COLUMNS.join(',') + '\r\n').toBe(HEADER)
  })

  it('AC1/FR-002 two readings give three CRLF records in the given order (newest first kept, no sorting)', () => {
    const csv = buildReadingsCsv([NEWER, OLDER])
    expect(csv).toBe(HEADER + NEWER_RECORD + OLDER_RECORD)
    const records = csv.split('\r\n')
    // Three records plus the empty string after the final CRLF.
    expect(records).toHaveLength(4)
    expect(records[3]).toBe('')
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(records[1].startsWith(NEWER.recorded_at)).toBe(true)
    expect(records[2].startsWith(OLDER.recorded_at)).toBe(true)
  })

  it('AC2/FR-003 temperature "37.0" is written as 37.0, booleans as false/true, recorded_at byte-identical', () => {
    const [, newer, older] = buildReadingsCsv([NEWER, OLDER]).split('\r\n')
    const newerFields = newer.split(',')
    const olderFields = older.split(',')
    expect(olderFields[CSV_COLUMNS.indexOf('temperature')]).toBe('37.0')
    expect(olderFields[CSV_COLUMNS.indexOf('on_oxygen')]).toBe('false')
    expect(newerFields[CSV_COLUMNS.indexOf('on_oxygen')]).toBe('true')
    expect(newerFields[CSV_COLUMNS.indexOf('recorded_at')]).toBe('2026-11-22T10:05:00.123456Z')
    expect(olderFields[CSV_COLUMNS.indexOf('recorded_at')]).toBe('2026-11-22T10:00:00.000001Z')
  })

  it('AC2/FR-004 the stored score.total and score.band are written, never recomputed (19, low)', () => {
    const [, newer] = buildReadingsCsv([NEWER]).split('\r\n')
    const fields = newer.split(',')
    expect(fields[CSV_COLUMNS.indexOf('news2_total')]).toBe('19')
    expect(fields[CSV_COLUMNS.indexOf('risk_band')]).toBe('low')
  })

  it('AC6/FR-006 a crafted consciousness =HYPERLINK("x") is neutralized and quoted in the full CSV', () => {
    const crafted = { ...OLDER, consciousness: '=HYPERLINK("x")' }
    const csv = buildReadingsCsv([crafted])
    expect(csv).toBe(
      HEADER + '2026-11-22T10:00:00.000001Z,16,97,false,120,72,"\'=HYPERLINK(""x"")",37.0,0,low\r\n',
    )
    expect(csv).not.toContain(',=HYPERLINK')
  })
})

describe('US-10 csvField quoting (AC2, FR-005)', () => {
  it('AC2/FR-005 a comma is quoted', () => {
    expect(csvField('a,b')).toBe('"a,b"')
  })

  it('AC2/FR-005 inner double quotes are doubled and the field quoted', () => {
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
  })

  it('AC2/FR-005 values containing \\n or \\r are quoted', () => {
    expect(csvField('a\nb')).toBe('"a\nb"')
    expect(csvField('a\rb')).toBe('"a\rb"')
  })

  it('AC2/FR-005 37, false and low-medium are unchanged', () => {
    expect(csvField(37)).toBe('37')
    expect(csvField(false)).toBe('false')
    expect(csvField('low-medium')).toBe('low-medium')
  })
})

describe('US-10 csvField injection guard (AC6, FR-006)', () => {
  it.each([
    ['=1', "'=1"],
    ['+1', "'+1"],
    ['-1', "'-1"],
    ['@x', "'@x"],
  ])('AC6/FR-006 %j gets a leading apostrophe', (input, expected) => {
    expect(csvField(input)).toBe(expected)
  })

  it('AC6/FR-006 a leading tab gets a leading apostrophe', () => {
    expect(csvField('\tx')).toBe("'\tx")
  })

  it('AC6/FR-006 a leading carriage return gets a leading apostrophe and is then quoted', () => {
    expect(csvField('\rx')).toBe('"\'\rx"')
  })

  it('AC6/FR-006 the contract examples =SUM(A1) and -5', () => {
    expect(csvField('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvField('-5')).toBe("'-5")
  })

  it('AC6/FR-006 a trigger character not at the start is unchanged (a=b, a-b)', () => {
    expect(csvField('a=b')).toBe('a=b')
    expect(csvField('a-b')).toBe('a-b')
  })

  it('AC6/FR-006 =1,2 is prefixed, then quoted', () => {
    expect(csvField('=1,2')).toBe('"\'=1,2"')
  })
})

describe('US-10 exportFileName (AC3, FR-007)', () => {
  it('AC3 PAT-001 on 2026-11-22 (local date)', () => {
    expect(exportFileName('PAT-001', new Date(2026, 10, 22))).toBe('PAT-001-vital-signs-2026-11-22.csv')
  })

  it('AC3 month and day are zero-padded (2026-01-05)', () => {
    expect(exportFileName('PAT-001', new Date(2026, 0, 5))).toBe('PAT-001-vital-signs-2026-01-05.csv')
  })

  it.each([
    ['../x'],
    ['PAT 1'],
    ['pat-1'],
    [''],
    ['A'.repeat(21)],
    ['PAT-1/..'],
    [undefined],
    [null],
  ])('FR-007 invalid identifier %j gives null', (identifier) => {
    expect(exportFileName(identifier, new Date(2026, 10, 22))).toBeNull()
  })

  it('FR-007 a 20-character code (the upper limit) is accepted', () => {
    const code = 'A'.repeat(20)
    expect(exportFileName(code, new Date(2026, 10, 22))).toBe(`${code}-vital-signs-2026-11-22.csv`)
  })
})
