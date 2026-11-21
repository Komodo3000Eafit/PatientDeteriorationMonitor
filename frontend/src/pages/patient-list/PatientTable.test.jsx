// US-02 patient list page tests: AC6 to AC15 and the spec edge cases (session expiry on a refresh,
// unknown band vs no readings), following specs/016-patient-list/contracts/ui.md. The whole app
// runs in an in-memory router (renderApp); fetch is stubbed (stubBackend), no backend and no
// network. Synthetic patients (PAT-NNN, "Paciente Ficticio ...") and demo users only.
// Fake timers with shouldAdvanceTime drive the 15 s refresh.
// Change request 2026-11-21: the score cell is one ScoreBadge ("7 · Alta", role="img" named
// "Puntaje NEWS2 7, riesgo Alta"), the header shows the range "(0–20)", and the last-update line is
// the exact 24-hour time with seconds ("Actualizado: 14:34:50"); the list page <main> is wider.
//
// Exact Spanish texts copied from frontend/src/i18n/translations.js:
//   patients.title             'Pacientes'
//   patientList.colCode        'Código'
//   patientList.colName        'Nombre'
//   patientList.colTriage      'Nivel de triage'
//   patientList.colScore       'Puntaje NEWS2 (0–20)'
//   patientList.scoreLabel     'Puntaje NEWS2 {score}, riesgo {band}'
//   patientList.colLatest      'Última lectura'
//   patientList.noData         'Sin datos'
//   patientList.empty          'No hay pacientes activos.'
//   patientList.loading        'Cargando pacientes…'
//   patientList.loadError      'No se pudo cargar la lista de pacientes. Se intentará de nuevo.'
//   patientList.refreshError   'No se pudo actualizar la lista. Se muestra la última versión.'
//   patientList.lastUpdated    'Actualizado: {time}'
//   triageLevel.2              'Triage II'
//   riskBand.high              'Alta'
//   riskBand.low               'Baja'
//   riskBand.unknown           'Desconocida'
//   registerPatient.button     'Registrar paciente'
//   health.apiOk               'API: funcionando'
//   health.version             'Versión: {version}'
//   health.databaseOk          'Base de datos: disponible'
//   patients.placeholder (TS-13, removed) 'La lista de pacientes se mostrará aquí.'
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

const ES_HEADERS = ['Código', 'Nombre', 'Nivel de triage', 'Puntaje NEWS2 (0–20)', 'Última lectura']
const EN_HEADERS = ['Code', 'Name', 'Triage level', 'NEWS2 score (0–20)', 'Latest reading']
const ES_NO_DATA = 'Sin datos'
const ES_UNKNOWN_BAND = 'Desconocida'
const ES_EMPTY = 'No hay pacientes activos.'
const ES_LOADING = 'Cargando pacientes…'
const ES_LOAD_ERROR = 'No se pudo cargar la lista de pacientes. Se intentará de nuevo.'
const ES_REFRESH_ERROR = 'No se pudo actualizar la lista. Se muestra la última versión.'
const ES_REGISTER = 'Registrar paciente'
const ES_PLACEHOLDER = 'La lista de pacientes se mostrará aquí.'
const ES_LOGIN = 'Iniciar sesión'

// Fixed start time: 21 November 2026, 14:34:50 local time. A refresh 15 s later is at 14:35:05,
// so "Actualizado: 14:34:50" changes to "Actualizado: 14:35:05". shouldAdvanceTime lets the fake
// clock move with real time too, which is milliseconds here, so the seconds stay exact.
const START = new Date(2026, 10, 21, 14, 34, 50)
const THREE_MIN_AGO = new Date(2026, 10, 21, 14, 31, 50).toISOString()

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

// Deliberately NOT in the AC3 order: the page must keep the order received.
const LIST = [
  patient('PAT-002', 4, { recorded_at: THREE_MIN_AGO, total: 1, band: 'low' }),
  patient('PAT-005', 2, { recorded_at: THREE_MIN_AGO, total: 7, band: 'high' }),
  patient('PAT-001', 1, null),
  patient('PAT-003', 3, { recorded_at: THREE_MIN_AGO, total: 3, band: 'bogus' }),
]

// A GET /api/patients handler answering from a queue of responders; the last one repeats.
// A responder is a body (answered 200), or a function returning a Response or a promise.
function listHandler(...responders) {
  const queue = [...responders]
  return vi.fn(async (url, options) => {
    if (options?.method && options.method !== 'GET') return jsonResponse({}, 405)
    const next = queue.length > 1 ? queue.shift() : queue[0]
    return typeof next === 'function' ? next() : jsonResponse(next)
  })
}

function deferred() {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}

async function advance(ms) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

async function openList({ user = DOCTOR, patients } = {}) {
  const fetchMock = stubBackend({ me: async () => jsonResponse(user), patients })
  signInForTest(user)
  const view = renderApp(['/patients'])
  await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))
  await act(async () => {})
  return { fetchMock, view }
}

const listCalls = (fetchMock) => callsTo(fetchMock, '/api/patients')
const bodyRows = () => screen.getAllByRole('row').slice(1)
const rowOf = (code) => screen.getByRole('link', { name: code }).closest('tr')

let hidden = false

function setHidden(value) {
  hidden = value
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  resetSession()
  localStorage.clear()
  hidden = false
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(START)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  resetSession()
  localStorage.clear()
  vi.unstubAllGlobals()
  delete document.hidden
  document.documentElement.lang = 'es'
})

describe('US-02 AC6 list on the page', () => {
  it('AC6 five Spanish column headers, rows in the order received, placeholder gone', async () => {
    await openList({ patients: listHandler({ patients: LIST }) })

    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent)
    expect(headers).toEqual(ES_HEADERS)
    expect(bodyRows().map((row) => within(row).getByRole('link').textContent)).toEqual([
      'PAT-002',
      'PAT-005',
      'PAT-001',
      'PAT-003',
    ])
    expect(screen.queryByText(ES_PLACEHOLDER)).toBeNull()
  })

  it('AC6 a row shows code, name, "Triage II", one score badge "7 · Alta" and the latest time', async () => {
    await openList({ patients: listHandler({ patients: LIST }) })

    const cells = within(rowOf('PAT-005')).getAllByRole('cell')
    expect(cells).toHaveLength(5)
    expect(cells[0].textContent).toBe('PAT-005')
    expect(cells[1].textContent).toBe('Paciente Ficticio PAT-005')
    expect(cells[2].textContent).toBe('Triage II')
    expect(cells[3].textContent).toBe('7 · Alta')
    expect(cells[4].textContent).toBe('hace 3 min (14:31)')
    expect(within(rowOf('PAT-002')).getAllByRole('cell')[3].textContent).toBe('1 · Baja')
  })

  it('AC6 FR-007 the score cell has exactly one badge named "Puntaje NEWS2 7, riesgo Alta"', async () => {
    await openList({ patients: listHandler({ patients: LIST }) })

    const scoreCell = within(rowOf('PAT-005')).getAllByRole('cell')[3]
    const badges = within(scoreCell).getAllByRole('img')
    expect(badges).toHaveLength(1)
    expect(within(scoreCell).getByRole('img', { name: 'Puntaje NEWS2 7, riesgo Alta' })).toBe(
      badges[0],
    )
    expect(badges[0].textContent).toBe('7 · Alta')
    // No separate RiskBandBadge: no element whose whole text is just the band label.
    expect(within(scoreCell).queryByText('Alta')).toBeNull()
    expect(scoreCell.querySelectorAll('svg')).toHaveLength(1)
    expect(
      within(rowOf('PAT-002')).getByRole('img', { name: 'Puntaje NEWS2 1, riesgo Baja' }),
    ).toBeTruthy()
  })

  it('AC6 AC11 shows the exact time of the last update with seconds (24-hour)', async () => {
    await openList({ patients: listHandler({ patients: LIST }) })

    expect(screen.getByText('Actualizado: 14:34:50')).toBeTruthy()
  })

  it('page width: the patient list <main> has its own wider CSS module class', async () => {
    await openList({ patients: listHandler({ patients: LIST }) })

    const main = screen.getByRole('main')
    expect(main.className).toMatch(/page/)
  })
})

describe('US-02 AC7 patient without readings vs unknown band', () => {
  it('AC7 latest_score null shows "Sin datos" twice and never "Desconocida"', async () => {
    await openList({ patients: listHandler({ patients: LIST }) })

    const row = rowOf('PAT-001')
    expect(within(row).getAllByText(ES_NO_DATA)).toHaveLength(2)
    expect(within(row).queryByText(ES_UNKNOWN_BAND)).toBeNull()
    const cells = within(row).getAllByRole('cell')
    expect(cells[3].textContent).toBe(ES_NO_DATA)
    expect(cells[4].textContent).toBe(ES_NO_DATA)
    expect(within(row).queryByRole('img')).toBeNull()
    expect(row.querySelector('svg')).toBeNull()
  })

  it('AC7 edge case: band "bogus" shows "3 · Desconocida", not "Sin datos"', async () => {
    await openList({ patients: listHandler({ patients: LIST }) })

    const row = rowOf('PAT-003')
    const scoreCell = within(row).getAllByRole('cell')[3]
    expect(scoreCell.textContent).toBe(`3 · ${ES_UNKNOWN_BAND}`)
    expect(
      within(scoreCell).getByRole('img', { name: `Puntaje NEWS2 3, riesgo ${ES_UNKNOWN_BAND}` }),
    ).toBeTruthy()
    expect(within(scoreCell).queryByText(ES_NO_DATA)).toBeNull()
    expect(within(row).queryByText(ES_NO_DATA)).toBeNull()
  })
})

describe('US-02 AC8 open a patient', () => {
  it('AC8 the code is a link to /patients/PAT-005 and clicking it opens that address', async () => {
    await openList({ patients: listHandler({ patients: LIST }) })

    const link = screen.getByRole('link', { name: 'PAT-005' })
    expect(link.getAttribute('href')).toBe('/patients/PAT-005')
    fireEvent.click(link)
    expect(currentPath()).toBe('/patients/PAT-005')
  })

  it('AC8 the rest of the row is plain text: no role, no click handler, one link only', async () => {
    await openList({ patients: listHandler({ patients: LIST }) })

    const row = rowOf('PAT-005')
    expect(row.getAttribute('role')).toBeNull()
    expect(row.onclick).toBeNull()
    expect(within(row).getAllByRole('link')).toHaveLength(1)
    fireEvent.click(within(row).getByText('Paciente Ficticio PAT-005'))
    expect(currentPath()).toBe('/patients')
  })
})

describe('US-02 AC9 register button kept for nurses', () => {
  it('AC9 nurse sees "Registrar paciente" above the table', async () => {
    await openList({ user: NURSE, patients: listHandler({ patients: LIST }) })

    const button = screen.getByRole('button', { name: ES_REGISTER })
    const table = screen.getByRole('table')
    expect(button.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC9 doctor does not see it', async () => {
    await openList({ user: DOCTOR, patients: listHandler({ patients: LIST }) })

    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.queryByRole('button', { name: ES_REGISTER })).toBeNull()
  })
})

describe('US-02 AC10 empty list', () => {
  it('AC10 {"patients": []} shows "No hay pacientes activos." and no table', async () => {
    await openList({ patients: listHandler({ patients: [] }) })

    expect(screen.getByText(ES_EMPTY)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('US-02 AC11 automatic refresh', () => {
  it('AC11 after 15 s a second GET redraws the table and the "Actualizado: HH:MM:SS" text', async () => {
    const changed = [patient('PAT-009', 1, { recorded_at: THREE_MIN_AGO, total: 9, band: 'high' })]
    const patients = listHandler({ patients: LIST }, { patients: changed })
    const { fetchMock } = await openList({ patients })
    expect(listCalls(fetchMock)).toHaveLength(1)
    expect(screen.getByText('Actualizado: 14:34:50')).toBeTruthy()

    await advance(14000)
    expect(listCalls(fetchMock)).toHaveLength(1)
    await advance(1000)

    expect(listCalls(fetchMock)).toHaveLength(2)
    expect(bodyRows().map((row) => within(row).getByRole('link').textContent)).toEqual(['PAT-009'])
    expect(screen.queryByRole('link', { name: 'PAT-005' })).toBeNull()
    expect(screen.getByText('Actualizado: 14:35:05')).toBeTruthy()
    expect(screen.queryByText('Actualizado: 14:34:50')).toBeNull()
  })

  it('AC11 edge case: no second request while the previous one is still pending', async () => {
    const pending = deferred()
    const patients = listHandler({ patients: LIST }, () => pending.promise, { patients: LIST })
    const { fetchMock } = await openList({ patients })

    await advance(15000)
    expect(listCalls(fetchMock)).toHaveLength(2)
    await advance(45000)
    expect(listCalls(fetchMock)).toHaveLength(2)

    await act(async () => {
      pending.resolve(jsonResponse({ patients: LIST }))
    })
    expect(listCalls(fetchMock)).toHaveLength(2)
    await advance(15000)
    expect(listCalls(fetchMock)).toHaveLength(3)
  })

  it('AC11 hidden tab pauses the refresh; visible again requests at once and restarts the timer', async () => {
    const { fetchMock } = await openList({ patients: listHandler({ patients: LIST }) })

    await act(async () => setHidden(true))
    await advance(60000)
    expect(listCalls(fetchMock)).toHaveLength(1)

    await act(async () => setHidden(false))
    expect(listCalls(fetchMock)).toHaveLength(2)

    await advance(14000)
    expect(listCalls(fetchMock)).toHaveLength(2)
    await advance(1000)
    expect(listCalls(fetchMock)).toHaveLength(3)
  })

  it('AC11 leaving the page (link to a patient) stops the refresh', async () => {
    const { fetchMock } = await openList({ patients: listHandler({ patients: LIST }) })

    fireEvent.click(screen.getByRole('link', { name: 'PAT-005' }))
    expect(currentPath()).toBe('/patients/PAT-005')
    await advance(60000)

    expect(listCalls(fetchMock)).toHaveLength(1)
  })

  it('AC11 unmount stops the refresh', async () => {
    const { fetchMock, view } = await openList({ patients: listHandler({ patients: LIST }) })

    view.unmount()
    await advance(60000)

    expect(listCalls(fetchMock)).toHaveLength(1)
  })
})

describe('US-02 AC12 failed refresh', () => {
  it.each([
    ['answers 500', () => jsonResponse({ detail: 'Internal server text' }, 500)],
    ['rejects (network failure)', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['answers a body without a patients array', () => jsonResponse({ detail: 'odd' })],
  ])('AC12 refresh %s: same rows + fixed message; next success removes it', async (_name, failure) => {
    const patients = listHandler({ patients: LIST }, failure, { patients: LIST })
    const { fetchMock } = await openList({ patients })

    await advance(15000)

    expect(listCalls(fetchMock)).toHaveLength(2)
    expect(screen.getByRole('alert').textContent).toBe(ES_REFRESH_ERROR)
    expect(bodyRows()).toHaveLength(LIST.length)
    expect(screen.getByRole('link', { name: 'PAT-005' })).toBeTruthy()
    // The last update time stays the one of the last success (14:34:50), not the failed 14:35:05.
    expect(screen.getByText('Actualizado: 14:34:50')).toBeTruthy()
    expect(screen.queryByText('Actualizado: 14:35:05')).toBeNull()
    expect(screen.queryByText('Internal server text')).toBeNull()

    await advance(15000)

    expect(listCalls(fetchMock)).toHaveLength(3)
    expect(screen.queryByText(ES_REFRESH_ERROR)).toBeNull()
    expect(bodyRows()).toHaveLength(LIST.length)
  })
})

describe('US-02 AC13 first load states', () => {
  it('AC13 pending first request shows "Cargando pacientes…"', async () => {
    const pending = deferred()
    await openList({ patients: listHandler(() => pending.promise) })

    expect(screen.getByText(ES_LOADING)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()

    await act(async () => {
      pending.resolve(jsonResponse({ patients: LIST }))
    })
    expect(screen.queryByText(ES_LOADING)).toBeNull()
    expect(screen.getByRole('table')).toBeTruthy()
  })

  it('AC13 first request 500 shows the fixed error and retries after 15 s', async () => {
    const patients = listHandler(() => jsonResponse({ detail: 'Internal server text' }, 500), {
      patients: LIST,
    })
    const { fetchMock } = await openList({ patients })

    expect(screen.getByRole('alert').textContent).toBe(ES_LOAD_ERROR)
    expect(screen.queryByText('Internal server text')).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()

    await advance(15000)

    expect(listCalls(fetchMock)).toHaveLength(2)
    expect(screen.queryByText(ES_LOAD_ERROR)).toBeNull()
    expect(bodyRows()).toHaveLength(LIST.length)
  })
})

describe('US-02 edge case: session expires while the page is open', () => {
  it('a 401 on a refresh sends the user to /login and refreshing stops', async () => {
    const patients = listHandler({ patients: LIST }, () =>
      jsonResponse({ detail: 'Not authenticated' }, 401),
    )
    const { fetchMock } = await openList({ patients })

    await advance(15000)

    await waitFor(() => expect(currentPath()).toBe('/login'))
    expect(screen.getByRole('heading', { name: ES_LOGIN })).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    await advance(60000)
    expect(listCalls(fetchMock)).toHaveLength(2)
  })
})

describe('US-02 AC14 health section unchanged', () => {
  it('AC14 health texts shown and /health called once per page load even after refreshes', async () => {
    const { fetchMock } = await openList({ patients: listHandler({ patients: LIST }) })

    expect(await screen.findByText('API: funcionando')).toBeTruthy()
    expect(screen.getByText('Versión: 0.1.0')).toBeTruthy()
    expect(screen.getByText('Base de datos: disponible')).toBeTruthy()

    await advance(15000)
    await advance(15000)

    expect(listCalls(fetchMock)).toHaveLength(3)
    expect(callsTo(fetchMock, '/health')).toHaveLength(1)
  })
})

describe('US-02 AC15 English switch', () => {
  it('AC15 headers, "No data", times and "Updated:" in English; rows stay; no extra GET', async () => {
    const { fetchMock } = await openList({ patients: listHandler({ patients: LIST }) })
    expect(listCalls(fetchMock)).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(EN_HEADERS)
    expect(within(rowOf('PAT-001')).getAllByText('No data')).toHaveLength(2)
    expect(screen.queryByText(ES_NO_DATA)).toBeNull()
    expect(within(rowOf('PAT-005')).getAllByRole('cell')[3].textContent).toBe('7 · High')
    expect(
      within(rowOf('PAT-005')).getByRole('img', { name: 'NEWS2 score 7, risk High' }),
    ).toBeTruthy()
    expect(within(rowOf('PAT-005')).getAllByRole('cell')[4].textContent).toBe(
      '3 min. ago (14:31)',
    )
    expect(within(rowOf('PAT-003')).getAllByRole('cell')[3].textContent).toBe('3 · Unknown')
    expect(
      within(rowOf('PAT-003')).getByRole('img', { name: 'NEWS2 score 3, risk Unknown' }),
    ).toBeTruthy()
    expect(screen.getByText('Updated: 14:34:50')).toBeTruthy()
    expect(bodyRows().map((row) => within(row).getByRole('link').textContent)).toEqual([
      'PAT-002',
      'PAT-005',
      'PAT-001',
      'PAT-003',
    ])
    expect(listCalls(fetchMock)).toHaveLength(1)
  })

  it('AC15 empty, loading and error texts in English', async () => {
    localStorage.setItem('pdm.language', 'en')
    const pending = deferred()
    const patients = listHandler(
      () => pending.promise,
      () => jsonResponse({}, 500),
      { patients: [] },
    )
    const { fetchMock } = await openList({ patients })
    expect(screen.getByText('Loading patients…')).toBeTruthy()

    await act(async () => {
      pending.resolve(jsonResponse({}, 500))
    })
    expect(screen.getByRole('alert').textContent).toBe(
      'Could not load the patient list. It will try again.',
    )

    await advance(15000)
    await advance(15000)
    expect(listCalls(fetchMock)).toHaveLength(3)
    expect(screen.getByText('There are no active patients.')).toBeTruthy()
  })
})
