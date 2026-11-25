// US-09 unit tests for the pure filter/sort helper (T008), following
// specs/025-patient-list-filter-sort/spec.md (AC1, AC2, AC4, AC5, AC6, AC7, FR-013) and
// contracts/ui.md. Synthetic patients only (PAT-NNN, "Paciente Ficticio PAT-NNN").
import { describe, it, expect } from 'vitest'
import { filterAndSort, SORT_DEFAULT_DIRECTION } from './filterAndSort.js'

function patient(identifier, triage_level, latest_score) {
  return {
    identifier,
    name: `Paciente Ficticio ${identifier}`,
    age: 50,
    sex: 'other',
    triage_level,
    admitted_at: '2026-11-20T14:00:00Z',
    latest_score,
  }
}

const reading = (total, recorded_at, band = 'low') => ({ total, recorded_at, band })

// Deliberately not in any sorted order (the "server order"). Two rows without readings, placed in
// the middle and at the start, so "last in API order" is observable.
const LIST = [
  patient('PAT-004', 3, reading(5, '2026-11-21T14:20:00Z', 'medium')),
  patient('PAT-007', 1, null),
  patient('PAT-001', 2, reading(9, '2026-11-21T14:30:00Z', 'high')),
  patient('PAT-010', 5, reading(0, '2026-11-21T14:10:00Z')),
  patient('PAT-003', 4, null),
  patient('PAT-002', 1, reading(2, '2026-11-21T14:25:00Z')),
]

const codes = (rows) => rows.map((p) => p.identifier)
const NO_FILTER = { triageLevel: null }
const NO_SORT = { column: null, direction: 'asc' }

describe('US-09 SORT_DEFAULT_DIRECTION (AC4 first-click directions)', () => {
  it('AC4 triage asc (most urgent first), score desc, code asc, latest desc', () => {
    expect(SORT_DEFAULT_DIRECTION).toEqual({
      triage: 'asc',
      score: 'desc',
      code: 'asc',
      latest: 'desc',
    })
  })
})

describe('US-09 filter (AC1, AC2)', () => {
  it.each([
    [1, ['PAT-007', 'PAT-002']],
    [2, ['PAT-001']],
    [3, ['PAT-004']],
    [4, ['PAT-003']],
    [5, ['PAT-010']],
  ])('AC1 triage level %i keeps only that level, in API order', (level, expected) => {
    const rows = filterAndSort(LIST, { triageLevel: level }, NO_SORT)
    expect(codes(rows)).toEqual(expected)
    expect(rows.every((p) => p.triage_level === level)).toBe(true)
  })

  it('AC2 "all" (triageLevel null) keeps every row in API order', () => {
    expect(codes(filterAndSort(LIST, NO_FILTER, NO_SORT))).toEqual(codes(LIST))
  })

  it('AC9 a level with no patients returns an empty array', () => {
    const rows = filterAndSort([patient('PAT-001', 2, null)], { triageLevel: 5 }, NO_SORT)
    expect(rows).toEqual([])
  })
})

describe('US-09 sort by each column in each direction (AC3, AC4)', () => {
  it('AC3 triage asc: most urgent (I) first; equal levels keep API order', () => {
    const rows = filterAndSort(LIST, NO_FILTER, { column: 'triage', direction: 'asc' })
    expect(codes(rows)).toEqual(['PAT-007', 'PAT-002', 'PAT-001', 'PAT-004', 'PAT-003', 'PAT-010'])
  })

  it('AC4 triage desc: least urgent (V) first; equal levels keep API order', () => {
    const rows = filterAndSort(LIST, NO_FILTER, { column: 'triage', direction: 'desc' })
    expect(codes(rows)).toEqual(['PAT-010', 'PAT-003', 'PAT-004', 'PAT-001', 'PAT-007', 'PAT-002'])
  })

  it('AC3 code asc', () => {
    const rows = filterAndSort(LIST, NO_FILTER, { column: 'code', direction: 'asc' })
    expect(codes(rows)).toEqual(['PAT-001', 'PAT-002', 'PAT-003', 'PAT-004', 'PAT-007', 'PAT-010'])
  })

  it('AC4 code desc', () => {
    const rows = filterAndSort(LIST, NO_FILTER, { column: 'code', direction: 'desc' })
    expect(codes(rows)).toEqual(['PAT-010', 'PAT-007', 'PAT-004', 'PAT-003', 'PAT-002', 'PAT-001'])
  })

  it('AC3 score desc: highest first, no-reading rows last in API order', () => {
    const rows = filterAndSort(LIST, NO_FILTER, { column: 'score', direction: 'desc' })
    expect(codes(rows)).toEqual(['PAT-001', 'PAT-004', 'PAT-002', 'PAT-010', 'PAT-007', 'PAT-003'])
  })

  it('AC4 score asc: lowest first, no-reading rows still last in API order', () => {
    const rows = filterAndSort(LIST, NO_FILTER, { column: 'score', direction: 'asc' })
    expect(codes(rows)).toEqual(['PAT-010', 'PAT-002', 'PAT-004', 'PAT-001', 'PAT-007', 'PAT-003'])
  })

  it('AC3 latest desc: most recent first, no-reading rows last in API order', () => {
    const rows = filterAndSort(LIST, NO_FILTER, { column: 'latest', direction: 'desc' })
    expect(codes(rows)).toEqual(['PAT-001', 'PAT-002', 'PAT-004', 'PAT-010', 'PAT-007', 'PAT-003'])
  })

  it('AC4 latest asc: oldest first, no-reading rows still last in API order', () => {
    const rows = filterAndSort(LIST, NO_FILTER, { column: 'latest', direction: 'asc' })
    expect(codes(rows)).toEqual(['PAT-010', 'PAT-004', 'PAT-002', 'PAT-001', 'PAT-007', 'PAT-003'])
  })
})

describe('US-09 AC7 rows without readings', () => {
  // A score of 0 is a real reading and must never be confused with "no reading".
  const ZERO_VS_NULL = [
    patient('PAT-021', 3, null),
    patient('PAT-022', 3, reading(0, '2026-11-21T10:00:00Z')),
    patient('PAT-023', 3, reading(4, '2026-11-21T12:00:00Z')),
    patient('PAT-024', 3, null),
  ]

  it.each(['asc', 'desc'])(
    'AC7 score %s: no-reading rows are last and a real 0 is not grouped with them',
    (direction) => {
      const rows = filterAndSort(ZERO_VS_NULL, NO_FILTER, { column: 'score', direction })
      expect(codes(rows).slice(-2)).toEqual(['PAT-021', 'PAT-024'])
      const ranked = codes(rows).slice(0, 2)
      expect(ranked).toEqual(direction === 'asc' ? ['PAT-022', 'PAT-023'] : ['PAT-023', 'PAT-022'])
    },
  )

  it.each(['asc', 'desc'])(
    'AC7 latest %s: no-reading rows are last (never treated as newest or oldest)',
    (direction) => {
      const rows = filterAndSort(ZERO_VS_NULL, NO_FILTER, { column: 'latest', direction })
      expect(codes(rows).slice(-2)).toEqual(['PAT-021', 'PAT-024'])
      const ranked = codes(rows).slice(0, 2)
      expect(ranked).toEqual(direction === 'asc' ? ['PAT-022', 'PAT-023'] : ['PAT-023', 'PAT-022'])
    },
  )

  it('AC7 latest_score undefined is treated like null (grouped last, no crash)', () => {
    const list = [
      { ...patient('PAT-031', 2, null), latest_score: undefined },
      patient('PAT-032', 2, reading(3, '2026-11-21T12:00:00Z')),
    ]
    const rows = filterAndSort(list, NO_FILTER, { column: 'score', direction: 'desc' })
    expect(codes(rows)).toEqual(['PAT-032', 'PAT-031'])
  })

  it('AC7 only no-reading rows: sorting by score keeps them in API order', () => {
    const list = [patient('PAT-043', 1, null), patient('PAT-041', 2, null), patient('PAT-042', 3, null)]
    for (const column of ['score', 'latest']) {
      for (const direction of ['asc', 'desc']) {
        expect(codes(filterAndSort(list, NO_FILTER, { column, direction }))).toEqual([
          'PAT-043',
          'PAT-041',
          'PAT-042',
        ])
      }
    }
  })

  it('AC7 triage and code sorts do not separate no-reading rows', () => {
    const rows = filterAndSort(LIST, NO_FILTER, { column: 'code', direction: 'asc' })
    expect(codes(rows).indexOf('PAT-003')).toBe(2)
  })
})

describe('US-09 stability on equal keys (rows keep API order)', () => {
  const TIME = '2026-11-21T12:00:00Z'
  const EQUAL = [
    patient('PAT-053', 2, reading(5, TIME)),
    patient('PAT-051', 2, reading(5, TIME)),
    patient('PAT-052', 2, reading(5, TIME)),
  ]

  it.each([
    ['triage', 'asc'],
    ['triage', 'desc'],
    ['score', 'asc'],
    ['score', 'desc'],
    ['latest', 'asc'],
    ['latest', 'desc'],
  ])('equal %s keys (%s) keep API order', (column, direction) => {
    expect(codes(filterAndSort(EQUAL, NO_FILTER, { column, direction }))).toEqual([
      'PAT-053',
      'PAT-051',
      'PAT-052',
    ])
  })
})

describe('US-09 AC5 no sort column: exact API order', () => {
  it.each(['asc', 'desc'])('AC5 column null (direction %s) without a filter returns API order', (direction) => {
    expect(codes(filterAndSort(LIST, NO_FILTER, { column: null, direction }))).toEqual(codes(LIST))
  })

  it('AC5 column null with a filter returns the filtered rows in API order', () => {
    const list = [
      patient('PAT-063', 2, reading(1, '2026-11-21T12:00:00Z')),
      patient('PAT-061', 1, null),
      patient('PAT-062', 2, null),
      patient('PAT-060', 2, reading(8, '2026-11-21T13:00:00Z')),
    ]
    expect(codes(filterAndSort(list, { triageLevel: 2 }, NO_SORT))).toEqual([
      'PAT-063',
      'PAT-062',
      'PAT-060',
    ])
  })

  it('AC5 column null returns a new array, not the input', () => {
    const rows = filterAndSort(LIST, NO_FILTER, NO_SORT)
    expect(rows).not.toBe(LIST)
    expect(rows).toEqual(LIST)
  })
})

describe('US-09 AC6 filter and sort combined', () => {
  it('AC6 level 1 sorted by code asc and desc', () => {
    expect(codes(filterAndSort(LIST, { triageLevel: 1 }, { column: 'code', direction: 'asc' }))).toEqual([
      'PAT-002',
      'PAT-007',
    ])
    expect(codes(filterAndSort(LIST, { triageLevel: 1 }, { column: 'code', direction: 'desc' }))).toEqual([
      'PAT-007',
      'PAT-002',
    ])
  })

  it('AC6 AC7 level 1 sorted by score asc: the no-reading row is still last', () => {
    expect(codes(filterAndSort(LIST, { triageLevel: 1 }, { column: 'score', direction: 'asc' }))).toEqual([
      'PAT-002',
      'PAT-007',
    ])
  })
})

describe('US-09 input safety', () => {
  it('does not mutate the input array or its rows for any column and direction', () => {
    const snapshot = JSON.parse(JSON.stringify(LIST))
    const orderBefore = [...LIST]
    for (const column of [null, 'triage', 'score', 'code', 'latest']) {
      for (const direction of ['asc', 'desc']) {
        for (const triageLevel of [null, 1, 3]) {
          filterAndSort(LIST, { triageLevel }, { column, direction })
        }
      }
    }
    expect(LIST).toEqual(snapshot)
    LIST.forEach((row, i) => expect(row).toBe(orderBefore[i]))
  })

  it.each([null, 'triage', 'score', 'code', 'latest'])('empty input returns [] (column %s)', (column) => {
    expect(filterAndSort([], NO_FILTER, { column, direction: 'asc' })).toEqual([])
    expect(filterAndSort([], { triageLevel: 2 }, { column, direction: 'desc' })).toEqual([])
  })

  it('returns the same row objects (no copies of rows)', () => {
    const rows = filterAndSort(LIST, NO_FILTER, { column: 'code', direction: 'asc' })
    expect(rows[0]).toBe(LIST[2])
  })
})
