// US-09 patient list filter and sort component tests (T009): AC1 to AC13, SC-005 and the spec edge
// cases, following specs/025-patient-list-filter-sort/spec.md and contracts/ui.md. The whole app runs
// in an in-memory router (renderApp); fetch is stubbed (stubBackend), no backend and no network.
// Synthetic patients (PAT-NNN, "Paciente Ficticio PAT-NNN") and demo users only. Fake timers with
// shouldAdvanceTime drive the US-02 15 s refresh. Patterns copied from PatientTable.test.jsx.
//
// Exact texts copied from frontend/src/i18n/translations.js:
//   patientList.filterLabel    'Filtrar por nivel de triage' / 'Filter by triage level'
//   patientList.filterAll      'Todos' / 'All'
//   patientList.sortByTriage   'Ordenar por nivel de triage' / 'Sort by triage level'
//   patientList.sortByScore    'Ordenar por puntaje NEWS2 (0–20)' / 'Sort by NEWS2 score (0–20)'
//   patientList.sortByCode     'Ordenar por código de paciente' / 'Sort by patient code'
//   patientList.sortByLatest   'Ordenar por última lectura' / 'Sort by latest reading'
//   patientList.resultCount    '{shown} de {total} pacientes' / '{shown} of {total} patients'
//   patientList.filteredEmpty  'No hay pacientes en este nivel.' / 'No patients at this level.'
//   patientList.empty          'No hay pacientes activos.'
//   triageLevel.1..5           'Triage I' .. 'Triage V'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import { currentPath, renderApp } from '../../testing/renderApp.jsx'
import {
  DOCTOR,
  NURSE,
  callsTo,
  jsonResponse,
  resetSession,
  signInForTest,
  stubBackend,
} from '../../testing/fakeBackend.js'

const ES = {
  filterLabel: 'Filtrar por nivel de triage',
  all: 'Todos',
  sortTriage: 'Ordenar por nivel de triage',
  sortScore: 'Ordenar por puntaje NEWS2 (0–20)',
  sortCode: 'Ordenar por código de paciente',
  sortLatest: 'Ordenar por última lectura',
  filteredEmpty: 'No hay pacientes en este nivel.',
  empty: 'No hay pacientes activos.',
  register: 'Registrar paciente',
}
const EN = {
  filterLabel: 'Filter by triage level',
  all: 'All',
  sortTriage: 'Sort by triage level',
  sortScore: 'Sort by NEWS2 score (0–20)',
  sortCode: 'Sort by patient code',
  sortLatest: 'Sort by latest reading',
  filteredEmpty: 'No patients at this level.',
}
const ES_HEADERS = ['Código', 'Nombre', 'Nivel de triage', 'Puntaje NEWS2 (0–20)', 'Última lectura']
const EN_HEADERS = ['Code', 'Name', 'Triage level', 'NEWS2 score (0–20)', 'Latest reading']
const TRIAGE_OPTIONS = ['Triage I', 'Triage II', 'Triage III', 'Triage IV', 'Triage V']

// Fixed start time: 21 November 2026, 14:34:50 local time.
const START = new Date(2026, 10, 21, 14, 34, 50)
const at = (h, m, s = 50) => new Date(2026, 10, 21, h, m, s).toISOString()

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

// Server order, deliberately not sorted by any column. Two patients without readings.
const LIST = [
  patient('PAT-002', 4, reading(1, at(14, 31))),
  patient('PAT-005', 2, reading(7, at(14, 33), 'high')),
  patient('PAT-001', 1, null),
  patient('PAT-003', 3, reading(3, at(14, 29))),
  patient('PAT-004', 2, reading(4, at(14, 24), 'medium')),
  patient('PAT-006', 2, null),
]
const API_ORDER = ['PAT-002', 'PAT-005', 'PAT-001', 'PAT-003', 'PAT-004', 'PAT-006']

// A GET /api/patients handler answering from a queue of responders; the last one repeats.
function listHandler(...responders) {
  const queue = [...responders]
  return vi.fn(async (url, options) => {
    if (options?.method && options.method !== 'GET') return jsonResponse({}, 405)
    const next = queue.length > 1 ? queue.shift() : queue[0]
    return typeof next === 'function' ? next() : jsonResponse(next)
  })
}

async function advance(ms) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

async function openList({ user = DOCTOR, patients = listHandler({ patients: LIST }) } = {}) {
  const fetchMock = stubBackend({ me: async () => jsonResponse(user), patients })
  signInForTest(user)
  const view = renderApp(['/patients'])
  await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))
  await act(async () => {})
  return { fetchMock, view }
}

const listCalls = (fetchMock) => callsTo(fetchMock, '/api/patients')
const bodyRows = () => screen.getAllByRole('row').slice(1)
const shownCodes = () => bodyRows().map((row) => within(row).getByRole('link').textContent)
const filterSelect = (label = ES.filterLabel) => screen.getByRole('combobox', { name: label })
const sortButton = (name) => screen.getByRole('button', { name })
const headerOf = (name) => sortButton(name).closest('th')
const ariaSorts = () => screen.getAllByRole('columnheader').map((th) => th.getAttribute('aria-sort'))

function chooseLevel(level, label) {
  fireEvent.change(filterSelect(label), { target: { value: level === null ? '' : String(level) } })
}
function clickSort(name) {
  fireEvent.click(sortButton(name))
}

beforeEach(() => {
  resetSession()
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(START)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  resetSession()
  localStorage.clear()
  vi.unstubAllGlobals()
  document.documentElement.lang = 'es'
})

describe('US-09 AC1 filter by triage level', () => {
  it('AC1 choosing "Triage II" shows only the Triage II patients, in server order', async () => {
    await openList()

    chooseLevel(2)

    expect(shownCodes()).toEqual(['PAT-005', 'PAT-004', 'PAT-006'])
    for (const row of bodyRows()) {
      expect(within(row).getAllByRole('cell')[2].textContent).toBe('Triage II')
    }
    expect(screen.queryByRole('link', { name: 'PAT-002' })).toBeNull()
  })

  it.each([
    [1, ['PAT-001']],
    [3, ['PAT-003']],
    [4, ['PAT-002']],
  ])('AC1 choosing level %i shows only that level', async (level, expected) => {
    await openList()

    chooseLevel(level)

    expect(shownCodes()).toEqual(expected)
  })

  it('AC1 the filter keeps the current sort order', async () => {
    await openList()
    clickSort(ES.sortCode)

    chooseLevel(2)

    expect(shownCodes()).toEqual(['PAT-004', 'PAT-005', 'PAT-006'])
  })
})

describe('US-09 AC2 show all levels', () => {
  it('AC2 "Todos" is selected by default with options Todos, Triage I..V in order', async () => {
    await openList()

    const select = filterSelect()
    expect(select.value).toBe('')
    const options = within(select).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([ES.all, ...TRIAGE_OPTIONS])
    expect(options[0].selected).toBe(true)
    expect(shownCodes()).toEqual(API_ORDER)
  })

  it('AC2 choosing "Todos" after a level shows every patient again', async () => {
    await openList()
    chooseLevel(3)
    expect(shownCodes()).toEqual(['PAT-003'])

    chooseLevel(null)

    expect(filterSelect().value).toBe('')
    expect(shownCodes()).toEqual(API_ORDER)
  })
})

describe('US-09 AC3 sort column choice', () => {
  it('AC3 clicking the NEWS2 score header sorts highest first and marks it with aria-sort', async () => {
    const { fetchMock } = await openList()

    clickSort(ES.sortScore)

    expect(shownCodes()).toEqual(['PAT-005', 'PAT-004', 'PAT-003', 'PAT-002', 'PAT-001', 'PAT-006'])
    expect(headerOf(ES.sortScore).getAttribute('aria-sort')).toBe('descending')
    // Order of headers: code, name, triage, score, latest; the name column is not sortable.
    expect(ariaSorts()).toEqual(['none', null, 'none', 'descending', 'none'])
    expect(listCalls(fetchMock)).toHaveLength(1)
  })

  it('AC3 the four sortable headers hold a button; the name column has none', async () => {
    await openList()

    const headers = screen.getAllByRole('columnheader')
    expect(headers.map((th) => th.querySelectorAll('button').length)).toEqual([1, 0, 1, 1, 1])
    expect(headers.map((th) => th.textContent)).toEqual(ES_HEADERS)
    for (const name of [ES.sortCode, ES.sortTriage, ES.sortScore, ES.sortLatest]) {
      expect(sortButton(name).getAttribute('type')).toBe('button')
    }
  })

  it('AC3 AC12 only the active header shows the decorative chevron', async () => {
    await openList()
    for (const th of screen.getAllByRole('columnheader')) expect(th.querySelector('svg')).toBeNull()

    clickSort(ES.sortTriage)

    const icon = headerOf(ES.sortTriage).querySelector('svg')
    expect(icon).not.toBeNull()
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    for (const name of [ES.sortCode, ES.sortScore, ES.sortLatest]) {
      expect(headerOf(name).querySelector('svg')).toBeNull()
    }
    expect(headerOf(ES.sortTriage).textContent).toBe('Nivel de triage')
  })
})

describe('US-09 AC4 sort direction', () => {
  it.each([
    [ES.sortTriage, 'ascending', ['PAT-001', 'PAT-005', 'PAT-004', 'PAT-006', 'PAT-003', 'PAT-002']],
    [ES.sortScore, 'descending', ['PAT-005', 'PAT-004', 'PAT-003', 'PAT-002', 'PAT-001', 'PAT-006']],
    [ES.sortCode, 'ascending', ['PAT-001', 'PAT-002', 'PAT-003', 'PAT-004', 'PAT-005', 'PAT-006']],
    [ES.sortLatest, 'descending', ['PAT-005', 'PAT-002', 'PAT-003', 'PAT-004', 'PAT-001', 'PAT-006']],
  ])('AC4 first click on "%s" uses the default direction (%s)', async (name, ariaSort, expected) => {
    await openList()

    clickSort(name)

    expect(headerOf(name).getAttribute('aria-sort')).toBe(ariaSort)
    expect(shownCodes()).toEqual(expected)
  })

  it.each([
    [ES.sortTriage, 'descending', ['PAT-002', 'PAT-003', 'PAT-005', 'PAT-004', 'PAT-006', 'PAT-001']],
    [ES.sortScore, 'ascending', ['PAT-002', 'PAT-003', 'PAT-004', 'PAT-005', 'PAT-001', 'PAT-006']],
    [ES.sortCode, 'descending', ['PAT-006', 'PAT-005', 'PAT-004', 'PAT-003', 'PAT-002', 'PAT-001']],
    [ES.sortLatest, 'ascending', ['PAT-004', 'PAT-003', 'PAT-002', 'PAT-005', 'PAT-001', 'PAT-006']],
  ])('AC4 second click on "%s" reverses (%s)', async (name, ariaSort, expected) => {
    await openList()

    clickSort(name)
    clickSort(name)

    expect(headerOf(name).getAttribute('aria-sort')).toBe(ariaSort)
    expect(shownCodes()).toEqual(expected)
  })

  it('AC4 third click flips back; switching column uses the new column default', async () => {
    await openList()

    clickSort(ES.sortCode)
    clickSort(ES.sortCode)
    clickSort(ES.sortCode)
    expect(headerOf(ES.sortCode).getAttribute('aria-sort')).toBe('ascending')

    clickSort(ES.sortCode) // now descending
    clickSort(ES.sortScore)

    expect(headerOf(ES.sortScore).getAttribute('aria-sort')).toBe('descending')
    expect(headerOf(ES.sortCode).getAttribute('aria-sort')).toBe('none')
    expect(ariaSorts().filter((v) => v === 'ascending' || v === 'descending')).toHaveLength(1)
  })
})

describe('US-09 AC5 default order is the server order; filter and sort are independent', () => {
  it('AC5 before any header click rows are in server order and no header is active', async () => {
    await openList()

    expect(shownCodes()).toEqual(API_ORDER)
    expect(ariaSorts()).toEqual(['none', null, 'none', 'none', 'none'])
  })

  it('AC5 with a filter and no sort the matching rows keep server order', async () => {
    await openList()

    chooseLevel(2)

    expect(shownCodes()).toEqual(['PAT-005', 'PAT-004', 'PAT-006'])
    expect(ariaSorts()).toEqual(['none', null, 'none', 'none', 'none'])
  })

  it('AC5 clearing the filter keeps the current sort', async () => {
    await openList()
    chooseLevel(2)
    clickSort(ES.sortCode)
    clickSort(ES.sortCode) // descending

    chooseLevel(null)

    expect(headerOf(ES.sortCode).getAttribute('aria-sort')).toBe('descending')
    expect(shownCodes()).toEqual(['PAT-006', 'PAT-005', 'PAT-004', 'PAT-003', 'PAT-002', 'PAT-001'])
  })

  it('AC5 choosing a sort keeps the current filter', async () => {
    await openList()
    chooseLevel(2)

    clickSort(ES.sortLatest)

    expect(filterSelect().value).toBe('2')
    expect(screen.getByText('3 de 6 pacientes')).toBeTruthy()
    expect(shownCodes()).toEqual(['PAT-005', 'PAT-004', 'PAT-006'])
  })
})

describe('US-09 AC6 filter and sort combine', () => {
  it('AC6 Triage II sorted by score: highest first, then reversed; no-reading row last', async () => {
    await openList()
    chooseLevel(2)

    clickSort(ES.sortScore)
    expect(shownCodes()).toEqual(['PAT-005', 'PAT-004', 'PAT-006'])

    clickSort(ES.sortScore)
    expect(shownCodes()).toEqual(['PAT-004', 'PAT-005', 'PAT-006'])
  })

  it('AC6 Triage II sorted by code descending', async () => {
    await openList()
    clickSort(ES.sortCode)
    clickSort(ES.sortCode)

    chooseLevel(2)

    expect(shownCodes()).toEqual(['PAT-006', 'PAT-005', 'PAT-004'])
  })
})

describe('US-09 AC7 patients without readings when sorting by score or time', () => {
  it.each([
    [ES.sortScore, 1],
    [ES.sortScore, 2],
    [ES.sortLatest, 1],
    [ES.sortLatest, 2],
  ])('AC7 "%s" after %i click(s): "Sin datos" rows grouped last in server order', async (name, clicks) => {
    await openList()

    for (let i = 0; i < clicks; i += 1) clickSort(name)

    const codes = shownCodes()
    expect(codes.slice(-2)).toEqual(['PAT-001', 'PAT-006'])
    for (const row of bodyRows().slice(-2)) {
      const cells = within(row).getAllByRole('cell')
      expect(cells[3].textContent).toBe('Sin datos')
      expect(cells[4].textContent).toBe('Sin datos')
    }
  })
})

describe('US-09 AC8 controls survive the 15 s refresh', () => {
  it('AC8 filter and sort are re-applied to a changed second list', async () => {
    const second = [
      patient('PAT-004', 2, reading(1, at(14, 34))),
      patient('PAT-002', 4, reading(1, at(14, 31))),
      patient('PAT-007', 2, reading(9, at(14, 35, 0), 'high')),
      patient('PAT-006', 2, null),
      patient('PAT-001', 1, null),
    ]
    const { fetchMock } = await openList({
      patients: listHandler({ patients: LIST }, { patients: second }),
    })
    chooseLevel(2)
    clickSort(ES.sortScore)
    expect(shownCodes()).toEqual(['PAT-005', 'PAT-004', 'PAT-006'])
    expect(screen.getByText('3 de 6 pacientes')).toBeTruthy()

    await advance(15000)

    expect(listCalls(fetchMock)).toHaveLength(2)
    expect(filterSelect().value).toBe('2')
    expect(headerOf(ES.sortScore).getAttribute('aria-sort')).toBe('descending')
    expect(shownCodes()).toEqual(['PAT-007', 'PAT-004', 'PAT-006'])
    expect(screen.queryByRole('link', { name: 'PAT-005' })).toBeNull()
    expect(screen.getByText('3 de 5 pacientes')).toBeTruthy()
    expect(screen.getByText('Actualizado: 14:35:05')).toBeTruthy()
  })

  it('AC8 AC9 edge case: a refresh that removes the last patient at the level shows the filtered-empty message', async () => {
    const second = LIST.filter((p) => p.triage_level !== 3)
    const { fetchMock } = await openList({
      patients: listHandler({ patients: LIST }, { patients: second }),
    })
    chooseLevel(3)
    expect(shownCodes()).toEqual(['PAT-003'])

    await advance(15000)

    expect(listCalls(fetchMock)).toHaveLength(2)
    expect(screen.getByText(ES.filteredEmpty)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(filterSelect().value).toBe('3')
  })
})

describe('US-09 AC9 filtered empty result', () => {
  it('AC9 a level with no patients shows "No hay pacientes en este nivel." and the filter stays usable', async () => {
    await openList()

    chooseLevel(5)

    expect(screen.getByText(ES.filteredEmpty)).toBeTruthy()
    expect(screen.queryByText(ES.empty)).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
    const select = filterSelect()
    expect(select.disabled).toBe(false)
    expect(select.value).toBe('5')

    chooseLevel(4)
    expect(screen.queryByText(ES.filteredEmpty)).toBeNull()
    expect(shownCodes()).toEqual(['PAT-002'])

    chooseLevel(5)
    chooseLevel(null)
    expect(shownCodes()).toEqual(API_ORDER)
  })

  it('AC9 the US-02 empty state stays distinct: an empty list shows "No hay pacientes activos." and no filter', async () => {
    await openList({ patients: listHandler({ patients: [] }) })

    expect(screen.getByText(ES.empty)).toBeTruthy()
    expect(screen.queryByText(ES.filteredEmpty)).toBeNull()
    expect(screen.queryByRole('combobox', { name: ES.filterLabel })).toBeNull()
  })
})

describe('US-09 AC10 result count', () => {
  it('AC10 a filter shows "3 de 6 pacientes" as a status; "Todos" hides it', async () => {
    await openList()
    expect(screen.queryByText(/de 6 pacientes/)).toBeNull()

    chooseLevel(2)
    const count = screen.getByText('3 de 6 pacientes')
    expect(count.getAttribute('role')).toBe('status')

    chooseLevel(1)
    expect(screen.getByText('1 de 6 pacientes')).toBeTruthy()

    chooseLevel(5)
    expect(screen.getByText('0 de 6 pacientes')).toBeTruthy()

    chooseLevel(null)
    expect(screen.queryByText(/de 6 pacientes/)).toBeNull()
  })

  it('AC10 sorting does not change the count', async () => {
    await openList()
    chooseLevel(2)

    clickSort(ES.sortCode)
    clickSort(ES.sortScore)

    expect(screen.getByText('3 de 6 pacientes')).toBeTruthy()
  })
})

describe('US-09 AC11 Spanish by default, English switch; SC-005 no extra requests', () => {
  it('AC11 Spanish texts by default', async () => {
    await openList()

    expect(screen.getByText(ES.filterLabel).tagName).toBe('LABEL')
    expect(filterSelect()).toBeTruthy()
    for (const name of [ES.sortTriage, ES.sortScore, ES.sortCode, ES.sortLatest]) {
      expect(sortButton(name)).toBeTruthy()
    }
    chooseLevel(5)
    expect(screen.getByText(ES.filteredEmpty)).toBeTruthy()
    expect(screen.getByText('0 de 6 pacientes')).toBeTruthy()
  })

  it('AC11 English switch translates every new text; triage options unchanged; state kept', async () => {
    const { fetchMock } = await openList()
    chooseLevel(2)
    clickSort(ES.sortScore)

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    const select = filterSelect(EN.filterLabel)
    expect(select.value).toBe('2')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      EN.all,
      ...TRIAGE_OPTIONS,
    ])
    for (const name of [EN.sortTriage, EN.sortScore, EN.sortCode, EN.sortLatest]) {
      expect(sortButton(name)).toBeTruthy()
    }
    expect(screen.queryByRole('button', { name: ES.sortScore })).toBeNull()
    expect(headerOf(EN.sortScore).getAttribute('aria-sort')).toBe('descending')
    expect(screen.getByText('3 of 6 patients')).toBeTruthy()
    expect(shownCodes()).toEqual(['PAT-005', 'PAT-004', 'PAT-006'])

    chooseLevel(5, EN.filterLabel)
    expect(screen.getByText(EN.filteredEmpty)).toBeTruthy()
    expect(screen.getByText('0 of 6 patients')).toBeTruthy()
    expect(listCalls(fetchMock)).toHaveLength(1)
  })

  it('AC11 English chosen before opening the page shows English controls', async () => {
    localStorage.setItem('pdm.language', 'en')
    await openList()

    expect(filterSelect(EN.filterLabel)).toBeTruthy()
    expect(screen.getByRole('option', { name: EN.all }).selected).toBe(true)
  })

  it('AC11 SC-005 filter, sort and language switch cause no GET /api/patients', async () => {
    const { fetchMock } = await openList()
    expect(listCalls(fetchMock)).toHaveLength(1)

    chooseLevel(1)
    chooseLevel(2)
    chooseLevel(5)
    chooseLevel(null)
    for (const name of [ES.sortTriage, ES.sortScore, ES.sortCode, ES.sortLatest]) {
      clickSort(name)
      clickSort(name)
    }
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    clickSort(EN.sortCode)
    chooseLevel(2, EN.filterLabel)
    fireEvent.click(screen.getByRole('button', { name: 'Español' }))
    await act(async () => {})

    expect(listCalls(fetchMock)).toHaveLength(1)

    // Only the US-02 refresh schedule adds requests.
    await advance(15000)
    expect(listCalls(fetchMock)).toHaveLength(2)
  })
})

describe('US-09 AC12 keyboard and accessibility', () => {
  it('AC12 the filter <select> is focusable and operable (native control, labelled)', async () => {
    await openList()

    const select = filterSelect()
    expect(select.tagName).toBe('SELECT')
    expect(select.getAttribute('tabindex')).not.toBe('-1')
    act(() => select.focus())
    expect(document.activeElement).toBe(select)

    fireEvent.change(select, { target: { value: '2' } })
    expect(shownCodes()).toEqual(['PAT-005', 'PAT-004', 'PAT-006'])
    expect(document.activeElement).toBe(select)
  })

  it('AC12 each header button is a native focusable <button> and activation updates aria-sort', async () => {
    await openList()

    for (const [name, first, second] of [
      [ES.sortCode, 'ascending', 'descending'],
      [ES.sortTriage, 'ascending', 'descending'],
      [ES.sortScore, 'descending', 'ascending'],
      [ES.sortLatest, 'descending', 'ascending'],
    ]) {
      const button = sortButton(name)
      // Native <button type="button">: browsers activate it with Enter and Space (jsdom does not
      // synthesize that default action, so activation is simulated with a click on the focused button).
      expect(button.tagName).toBe('BUTTON')
      expect(button.getAttribute('type')).toBe('button')
      expect(button.disabled).toBe(false)
      expect(button.getAttribute('tabindex')).not.toBe('-1')
      act(() => button.focus())
      expect(document.activeElement).toBe(button)

      fireEvent.keyDown(button, { key: 'Enter' })
      fireEvent.click(button)
      expect(headerOf(name).getAttribute('aria-sort')).toBe(first)
      expect(document.activeElement).toBe(sortButton(name))

      fireEvent.keyDown(button, { key: ' ' })
      fireEvent.click(sortButton(name))
      expect(headerOf(name).getAttribute('aria-sort')).toBe(second)
    }
  })

  it('AC12 the active sort is exposed by aria-sort and an icon, not color only; header text unchanged', async () => {
    await openList()

    clickSort(ES.sortLatest)

    const th = headerOf(ES.sortLatest)
    expect(th.getAttribute('aria-sort')).toBe('descending')
    expect(th.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(ES_HEADERS)
  })

  it('AC12 WCAG 2.5.3 label in name: each sort button accessible name contains its visible header label (ES and EN)', async () => {
    await openList()

    const check = (visibleLabels) => {
      const headers = screen.getAllByRole('columnheader')
      expect(headers.map((th) => th.textContent)).toEqual(visibleLabels)
      const sortable = headers.filter((th) => th.querySelector('button'))
      expect(sortable).toHaveLength(4)
      for (const th of sortable) {
        const button = th.querySelector('button')
        const name = button.getAttribute('aria-label')
        expect(name).toBeTruthy()
        expect(name.toLowerCase()).toContain(th.textContent.toLowerCase())
      }
    }

    check(ES_HEADERS)
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    check(EN_HEADERS)
  })
})

describe('US-09 AC13 existing behavior unchanged', () => {
  it('AC13 the patient-code link still navigates after filter and sort', async () => {
    await openList()
    chooseLevel(2)
    clickSort(ES.sortScore)

    const link = screen.getByRole('link', { name: 'PAT-005' })
    expect(link.getAttribute('href')).toBe('/patients/PAT-005')
    fireEvent.click(link)
    expect(currentPath()).toBe('/patients/PAT-005')
  })

  it('AC13 the ScoreBadge is still rendered in sorted and filtered rows', async () => {
    await openList()
    clickSort(ES.sortScore)
    chooseLevel(2)

    const row = screen.getByRole('link', { name: 'PAT-005' }).closest('tr')
    const scoreCell = within(row).getAllByRole('cell')[3]
    expect(within(scoreCell).getByRole('img', { name: 'Puntaje NEWS2 7, riesgo Alta' })).toBeTruthy()
    expect(scoreCell.textContent).toBe('7 · Alta')
  })

  it.each([
    ['DOCTOR', DOCTOR, false],
    ['NURSE', NURSE, true],
  ])('AC13 %s sees the filter and sort controls; register button only for nurses', async (_n, user, hasRegister) => {
    await openList({ user })

    expect(filterSelect()).toBeTruthy()
    for (const name of [ES.sortTriage, ES.sortScore, ES.sortCode, ES.sortLatest]) {
      expect(sortButton(name)).toBeTruthy()
    }
    expect(Boolean(screen.queryByRole('button', { name: ES.register }))).toBe(hasRegister)
    chooseLevel(2)
    expect(shownCodes()).toEqual(['PAT-005', 'PAT-004', 'PAT-006'])
  })

  it('AC13 health section and last-update line unchanged; /health called once', async () => {
    const { fetchMock } = await openList()
    expect(await screen.findByText('API: funcionando')).toBeTruthy()

    chooseLevel(2)
    clickSort(ES.sortCode)
    await advance(15000)

    expect(screen.getByText('Versión: 0.1.0')).toBeTruthy()
    expect(screen.getByText('Base de datos: disponible')).toBeTruthy()
    expect(screen.getByText('Actualizado: 14:35:05')).toBeTruthy()
    expect(callsTo(fetchMock, '/health')).toHaveLength(1)
  })

  it('AC13 a failed refresh keeps the filtered/sorted rows and shows the US-02 message', async () => {
    const patients = listHandler({ patients: LIST }, () => jsonResponse({}, 500))
    await openList({ patients })
    chooseLevel(2)
    clickSort(ES.sortCode)

    await advance(15000)

    expect(screen.getByRole('alert').textContent).toBe(
      'No se pudo actualizar la lista. Se muestra la última versión.',
    )
    expect(shownCodes()).toEqual(['PAT-004', 'PAT-005', 'PAT-006'])
    expect(filterSelect().value).toBe('2')
  })
})
