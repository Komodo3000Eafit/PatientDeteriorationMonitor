// US-06 vital signs chart: component / integration tests for the chart section mounted on the
// patient detail page. Covers AC1-AC11. The whole app runs in the in-memory router (renderApp);
// fetch is stubbed (stubBackend) with the patient / readings / triage-events handlers as the US-05
// tests do, plus the chart's own no-limit readings call. No backend, no network, synthetic data.
//
// react-chartjs-2's <Line> is mocked with a <canvas> that exposes role, aria-label and a
// data-chart JSON of { data, options }, so the plotted values, labels and options are inspectable
// without a real canvas (jsdom has none). vi.useFakeTimers({ shouldAdvanceTime: true }) is used
// only where the 15 s refresh timing matters.
//
// Exact Spanish (default) texts copied from frontend/src/i18n/translations.js:
//   vitalsChart.title         'Historial de signos vitales'
//   vitalsChart.parameterLabel'Parámetro'
//   vitalsChart.xAxis         'Hora de la lectura'
//   vitalsChart.count         'Últimas {count} lecturas'
//   vitalsChart.ariaLabel     'Gráfico de {parameter} del paciente {code}'
//   vitalsChart.tableCaption  'Valores del gráfico'
//   vitalsChart.noReadings    'Aún no hay lecturas para este paciente.'
//   vitalsChart.loading       'Cargando historial…'
//   vitalsChart.loadError     'No se pudo cargar el historial. Se intentará de nuevo.'
//   vitalsChart.refreshError  'No se pudo actualizar el gráfico. Se muestra la última versión.'
//   vitalsChart.live          'En vivo · Actualizado: {time}'
//   recordReading.score       'Puntaje NEWS2'  / EN 'NEWS2 score'
//   parameter.respiratory_rate'Frecuencia respiratoria (resp/min)'
//   parameter.spo2            'Saturación de oxígeno SpO2 (%)'
//   parameter.systolic_bp     'Presión arterial sistólica (mmHg)'
//   parameter.heart_rate      'Frecuencia cardiaca (lpm)'
//   parameter.temperature     'Temperatura (°C)'
// English (after the switch):
//   vitalsChart.title 'Vital signs history', vitalsChart.xAxis 'Reading time',
//   recordReading.score 'NEWS2 score', vitalsChart.live 'Live · Updated: {time}'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { Chart as ChartJS } from 'chart.js'
import { formatClockSeconds } from '../patient-list/formatTime.js'
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

// Mock the chart so the canvas is inspectable without a real rendering context.
vi.mock('react-chartjs-2', () => ({
  Line: (props) => (
    <canvas
      role={props.role}
      aria-label={props['aria-label']}
      data-chart={JSON.stringify({ data: props.data, options: props.options })}
    />
  ),
}))

const CODE = 'PAT-005'
const PATH = '/patients/PAT-005'
const PATIENT_PATH = '/api/patients/PAT-005'
const READINGS_PATH = '/api/patients/PAT-005/readings'
const TRIAGE_EVENTS_PATH = '/api/patients/PAT-005/triage-events'

const REFRESH_MS = 15000

// --- Spanish texts ---
const ES_TITLE = 'Historial de signos vitales'
const ES_PARAM_LABEL = 'Parámetro'
const ES_X_AXIS = 'Hora de la lectura'
const ES_NO_READINGS = 'Aún no hay lecturas para este paciente.'
const ES_LOADING = 'Cargando historial…'
const ES_LOAD_ERROR = 'No se pudo cargar el historial. Se intentará de nuevo.'
const ES_REFRESH_ERROR = 'No se pudo actualizar el gráfico. Se muestra la última versión.'
const ES_SCORE = 'Puntaje NEWS2'
const ES_RESPIRATORY = 'Frecuencia respiratoria (resp/min)'
const ES_SPO2 = 'Saturación de oxígeno SpO2 (%)'
const ES_SYSTOLIC = 'Presión arterial sistólica (mmHg)'
const ES_HEART_RATE = 'Frecuencia cardiaca (lpm)'
const ES_TEMPERATURE = 'Temperatura (°C)'

// --- English texts ---
const EN_TITLE = 'Vital signs history'
const EN_X_AXIS = 'Reading time'
const EN_SCORE = 'NEWS2 score'

// US-05 page needs a patient and triage events to reach its loaded state.
const PATIENT = {
  identifier: CODE,
  name: 'Paciente de Prueba',
  age: 57,
  sex: 'male',
  triage_level: 3,
  status: 'active',
  admitted_at: '2026-11-19T08:15:00.000000Z',
  last_reading_at: '2026-11-20T15:10:05.000000Z',
}

const TRIAGE_EVENTS = [
  {
    occurred_at: '2026-11-20T09:00:00.000000Z',
    previous_level: null,
    new_level: 4,
    score: null,
    reason: 'Triage on admission',
    source: 'initial',
  },
]

// A reading with all seven vitals and a stored score, matching the US-03 contract shape.
function reading({ at, total, rr, spo2, sys, hr, temp }) {
  return {
    recorded_at: at,
    respiratory_rate: rr,
    spo2,
    on_oxygen: false,
    systolic_bp: sys,
    heart_rate: hr,
    consciousness: 'A',
    temperature: temp,
    score: { system: 'NEWS2', total, band: 'medium', entries: [] },
  }
}

// Three readings, newest first (as the API returns them). Stored totals are deliberately not what a
// NEWS2 recomputation of the vitals would give, so a test can prove score.total is read as stored.
const NEWEST_FIRST = [
  reading({ at: '2026-11-20T15:10:05.000Z', total: 7, rr: 24, spo2: 93, sys: 150, hr: 110, temp: '38.4' }),
  reading({ at: '2026-11-20T15:05:05.000Z', total: 5, rr: 22, spo2: 95, sys: 140, hr: 100, temp: '37.5' }),
  reading({ at: '2026-11-20T15:00:05.000Z', total: 3, rr: 20, spo2: 96, sys: 130, hr: 90, temp: '36.8' }),
]
// Oldest -> newest, the order the chart draws.
const OLDEST_FIRST = [...NEWEST_FIRST].slice().reverse()

// A readings handler that answers the US-05 ?limit=1 current-reading call and the chart's no-limit
// call separately. latest is the single reading US-05 reads; history is the full list for the
// chart.
function readingsHandler({ latest = NEWEST_FIRST[0], history = NEWEST_FIRST } = {}) {
  return async (url) => {
    const limit = new URL(url).searchParams.get('limit')
    if (limit === '1') return jsonResponse({ readings: latest ? [latest] : [] })
    return jsonResponse({ readings: history })
  }
}

// Sign in, render the app at the patient detail page and wait for the /me check, like the US-05
// tests. Returns the fetch mock.
async function openPage({
  user = DOCTOR,
  patient = async () => jsonResponse(PATIENT),
  readings = readingsHandler(),
  triageEvents = async () => jsonResponse({ triage_events: TRIAGE_EVENTS }),
  entries = [PATH],
} = {}) {
  const fetchMock = stubBackend({ me: async () => jsonResponse(user), patient, readings, triageEvents })
  signInForTest(user)
  renderApp(entries)
  await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))
  await act(async () => {})
  return fetchMock
}

// The no-limit readings calls (the chart's own request), as opposed to the ?limit=1 US-05 call.
function chartReadingsCalls(fetchMock) {
  return callsTo(fetchMock, READINGS_PATH).filter(
    ([url]) => new URL(url).searchParams.get('limit') === null,
  )
}

// The mocked canvas and its parsed { data, options }.
function chartCanvas() {
  return screen.getByRole('img')
}
function chartModel() {
  return JSON.parse(chartCanvas().getAttribute('data-chart'))
}

// The hidden text-alternative table (the chart's own table). Found by its caption in either
// language (es "Valores del gráfico" / en "Chart values"), so the helper works after a switch.
function chartTable() {
  const caption = screen.getByText(/^(Valores del gráfico|Chart values)$/)
  return caption.closest('table')
}
function chartTableRows() {
  const table = chartTable()
  const [, body] = within(table).getAllByRole('rowgroup')
  return within(body).getAllByRole('row')
}

beforeEach(() => {
  resetSession()
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  resetSession()
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.documentElement.lang = 'es'
})

describe('US-06 AC1 chart mounted on the patient detail page', () => {
  it('AC1 shows the "Historial de signos vitales" section for a doctor, below the US-05 blocks', async () => {
    await openPage({ user: DOCTOR })

    expect(await screen.findByText('Datos del paciente')).toBeTruthy()
    // The chart section title shows.
    expect(await screen.findByText(ES_TITLE)).toBeTruthy()
    // The existing US-05 blocks still render.
    expect(screen.getByText('Datos del paciente')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Lectura actual' })).toBeTruthy()
    expect(screen.getByText('Historial de triage')).toBeTruthy()
    // The chart heading comes after the US-05 current-reading region in document order.
    const readingRegion = screen.getByRole('region', { name: 'Lectura actual' })
    const chartHeading = screen.getByRole('heading', { name: ES_TITLE })
    const position = readingRegion.compareDocumentPosition(chartHeading)
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC1 shows the chart section for a nurse as well', async () => {
    await openPage({ user: NURSE })

    expect(await screen.findByText('Datos del paciente')).toBeTruthy()
    expect(await screen.findByText(ES_TITLE)).toBeTruthy()
  })

  it('AC1 is not shown and makes no no-limit readings request on the not-found state', async () => {
    const fetchMock = await openPage({
      patient: async () => jsonResponse({ detail: 'Patient not found' }, 404),
    })

    expect(await screen.findByText('Paciente no encontrado')).toBeTruthy()
    // No chart section, no chart canvas.
    expect(screen.queryByText(ES_TITLE)).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
    // The chart's no-limit readings request was never made.
    expect(chartReadingsCalls(fetchMock)).toHaveLength(0)
  })
})

describe('US-06 AC2 data from the existing history, oldest -> newest', () => {
  it('AC2 the chart request has no limit param', async () => {
    const fetchMock = await openPage()

    await screen.findByText(ES_TITLE)
    await waitFor(() => expect(chartReadingsCalls(fetchMock).length).toBeGreaterThanOrEqual(1))
    // The chart's call carries no limit; the US-05 current-reading call carries ?limit=1.
    expect(chartReadingsCalls(fetchMock)).toHaveLength(1)
    expect(
      callsTo(fetchMock, READINGS_PATH).filter(
        ([url]) => new URL(url).searchParams.get('limit') === '1',
      ),
    ).toHaveLength(1)
  })

  it('AC2 labels and values come out oldest -> newest from a newest-first stub', async () => {
    await openPage()

    await screen.findByText(ES_TITLE)
    await waitFor(() => expect(screen.queryByRole('img')).toBeTruthy())
    const model = chartModel()
    // Default parameter is the stored NEWS2 score: oldest (3) -> newest (7).
    expect(model.data.datasets[0].data).toEqual([3, 5, 7])
    // Labels are in the same oldest -> newest order (local clock, so compute the expected time).
    expect(model.data.labels).toHaveLength(3)
    const oldestClock = formatClockSeconds(new Date(OLDEST_FIRST[0].recorded_at), 'es')
    const newestClock = formatClockSeconds(new Date(OLDEST_FIRST[2].recorded_at), 'es')
    expect(model.data.labels[0]).toContain(oldestClock)
    expect(model.data.labels[2]).toContain(newestClock)
  })
})

describe('US-06 AC3 NEWS2 score by default', () => {
  it('AC3 default y-axis title is "Puntaje NEWS2" and values equal the stored score.total', async () => {
    await openPage()

    await screen.findByText(ES_TITLE)
    await waitFor(() => expect(screen.queryByRole('img')).toBeTruthy())
    const model = chartModel()
    expect(model.options.scales.y.title.text).toBe(ES_SCORE)
    // Stored totals, never recomputed from vitals, oldest -> newest.
    expect(model.data.datasets[0].data).toEqual([3, 5, 7])
    expect(model.options.scales.x.title.text).toBe(ES_X_AXIS)
  })

  it('AC3 x labels are HH:MM:SS with the date on the first label and on a day change', async () => {
    // Two readings on 2026-11-20 and one on 2026-11-21 (newest first), so the day changes.
    const crossDay = [
      reading({ at: '2026-11-21T08:00:05.000Z', total: 4, rr: 20, spo2: 96, sys: 130, hr: 90, temp: '36.8' }),
      reading({ at: '2026-11-20T23:00:05.000Z', total: 3, rr: 20, spo2: 96, sys: 130, hr: 90, temp: '36.8' }),
      reading({ at: '2026-11-20T22:00:05.000Z', total: 2, rr: 20, spo2: 96, sys: 130, hr: 90, temp: '36.8' }),
    ]
    await openPage({ readings: readingsHandler({ history: crossDay }) })

    await screen.findByText(ES_TITLE)
    await waitFor(() => expect(screen.queryByRole('img')).toBeTruthy())
    const labels = chartModel().data.labels
    // Oldest-first local-day ordering of the three readings (clocks computed in the local zone, so
    // the test is timezone-independent). The two earliest fall on one local day, the last on the
    // next. point[0] = first reading of day A (date prefix), point[1] = same day A (no prefix),
    // point[2] = first reading of day B (date prefix again).
    const oldestFirst = [...crossDay].slice().reverse()
    const clocks = oldestFirst.map((r) => formatClockSeconds(new Date(r.recorded_at), 'es'))
    const sameLocalDay = (a, b) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
    const d0 = new Date(oldestFirst[0].recorded_at)
    const d1 = new Date(oldestFirst[1].recorded_at)
    const d2 = new Date(oldestFirst[2].recorded_at)
    expect(sameLocalDay(d0, d1)).toBe(true) // first two on the same local day
    expect(sameLocalDay(d1, d2)).toBe(false) // the third on the next local day
    expect(labels[0]).toContain(clocks[0])
    expect(labels[0].length).toBeGreaterThan(clocks[0].length) // date prefix on the first label
    expect(labels[1]).toContain(clocks[1]) // same day, no date prefix
    expect(labels[1].length).toBe(clocks[1].length)
    expect(labels[2]).toContain(clocks[2]) // new local day -> date prefix again
    expect(labels[2].length).toBeGreaterThan(clocks[2].length)
  })
})

describe('US-06 AC4 parameter selector', () => {
  it('AC4 the selector has exactly six options in order with no oxygen/consciousness', async () => {
    await openPage()

    await screen.findByText(ES_TITLE)
    const select = await screen.findByLabelText(ES_PARAM_LABEL)
    const optionTexts = within(select).getAllByRole('option').map((o) => o.textContent)
    expect(optionTexts).toEqual([
      ES_SCORE,
      ES_RESPIRATORY,
      ES_SPO2,
      ES_SYSTOLIC,
      ES_HEART_RATE,
      ES_TEMPERATURE,
    ])
    // No supplemental oxygen or consciousness option.
    expect(screen.queryByRole('option', { name: 'Oxígeno suplementario' })).toBeNull()
    expect(screen.queryByRole('option', { name: 'Nivel de conciencia (ACVPU)' })).toBeNull()
  })

  it('AC4 choosing each parameter updates the y title and the plotted values', async () => {
    await openPage()

    await screen.findByText(ES_TITLE)
    const select = await screen.findByLabelText(ES_PARAM_LABEL)

    // Each vital sign: the y-axis title and the plotted values (oldest -> newest).
    const expectations = [
      { value: 'respiratory_rate', title: ES_RESPIRATORY, data: [20, 22, 24] },
      { value: 'spo2', title: ES_SPO2, data: [96, 95, 93] },
      { value: 'systolic_bp', title: ES_SYSTOLIC, data: [130, 140, 150] },
      { value: 'heart_rate', title: ES_HEART_RATE, data: [90, 100, 110] },
      { value: 'temperature', title: ES_TEMPERATURE, data: [36.8, 37.5, 38.4] },
    ]
    for (const { value, title, data } of expectations) {
      fireEvent.change(select, { target: { value } })
      const model = chartModel()
      expect(model.options.scales.y.title.text).toBe(title)
      expect(model.data.datasets[0].data).toEqual(data)
    }
  })
})

describe('US-06 AC5 accessible chart', () => {
  it('AC5 the canvas has role="img" and names the patient and parameter, updating on change', async () => {
    await openPage()

    await screen.findByText(ES_TITLE)
    await waitFor(() => expect(screen.queryByRole('img')).toBeTruthy())
    expect(chartCanvas().getAttribute('aria-label')).toBe(
      'Gráfico de Puntaje NEWS2 del paciente PAT-005',
    )
    // The accessible name updates when the parameter changes.
    fireEvent.change(screen.getByLabelText(ES_PARAM_LABEL), { target: { value: 'heart_rate' } })
    expect(chartCanvas().getAttribute('aria-label')).toBe(
      'Gráfico de Frecuencia cardiaca (lpm) del paciente PAT-005',
    )
  })

  it('AC5 the hidden table lists one row per point with matching values and times', async () => {
    await openPage()

    await screen.findByText(ES_TITLE)
    await waitFor(() => expect(screen.queryByRole('img')).toBeTruthy())
    const rows = chartTableRows()
    expect(rows).toHaveLength(OLDEST_FIRST.length)
    // Each row's value matches the stored score.total, oldest first.
    const values = rows.map((row) => within(row).getAllByRole('cell')[1].textContent)
    expect(values).toEqual(['3', '5', '7'])
    // Each row shows the reading's local date-time with seconds.
    const firstRowText = within(rows[0]).getAllByRole('cell')[0].textContent
    expect(firstRowText).toMatch(/\d{2}:\d{2}:\d{2}/)
  })

  it('AC5 the line has visible point markers (pointRadius > 0)', async () => {
    await openPage()

    await screen.findByText(ES_TITLE)
    await waitFor(() => expect(screen.queryByRole('img')).toBeTruthy())
    expect(chartModel().data.datasets[0].pointRadius).toBeGreaterThan(0)
  })
})

describe('US-06 AC6 no risk rules on the chart', () => {
  it('AC6 options carry no annotation plugin, no fixed scale bounds, no fill, no per-point colors', async () => {
    await openPage()

    await screen.findByText(ES_TITLE)
    await waitFor(() => expect(screen.queryByRole('img')).toBeTruthy())
    const model = chartModel()
    const plugins = model.options.plugins ?? {}
    expect(plugins.annotation).toBeUndefined()
    for (const axis of ['x', 'y']) {
      const scale = model.options.scales[axis]
      expect(scale.min).toBeUndefined()
      expect(scale.max).toBeUndefined()
      expect(scale.suggestedMin).toBeUndefined()
      expect(scale.suggestedMax).toBeUndefined()
    }
    const dataset = model.data.datasets[0]
    expect(dataset.fill).toBe(false)
    // Colors are single values (or undefined), never per-point arrays painting risk.
    expect(Array.isArray(dataset.borderColor)).toBe(false)
    expect(Array.isArray(dataset.pointBackgroundColor)).toBe(false)
  })

  it('AC6 only the six expected Chart.js components are registered', async () => {
    await openPage()
    await screen.findByText(ES_TITLE)
    await waitFor(() => expect(screen.queryByRole('img')).toBeTruthy())

    // The registry must contain exactly the six components the chart needs and no annotation,
    // Legend or Filler plugin (research R2, Principle V).
    const controllers = Object.keys(ChartJS.registry.controllers.items)
    const elements = Object.keys(ChartJS.registry.elements.items)
    const scales = Object.keys(ChartJS.registry.scales.items)
    const plugins = Object.keys(ChartJS.registry.plugins.items)

    expect(controllers).toEqual(['line'])
    expect(elements.sort()).toEqual(['line', 'point'])
    expect(scales.sort()).toEqual(['category', 'linear'])
    expect(plugins).toEqual(['tooltip'])
    // Explicitly: no risk-zone / fill plugins.
    expect(plugins).not.toContain('annotation')
    expect(plugins).not.toContain('legend')
    expect(plugins).not.toContain('filler')
  })
})

describe('US-06 AC7 no readings yet', () => {
  it('AC7 a readings: [] response shows the no-readings message with no select and no canvas', async () => {
    await openPage({ readings: readingsHandler({ latest: null, history: [] }) })

    expect(await screen.findByText(ES_NO_READINGS)).toBeTruthy()
    // No parameter selector, no chart canvas.
    expect(screen.queryByLabelText(ES_PARAM_LABEL)).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })
})

describe('US-06 AC8 automatic refresh', () => {
  it('AC8 after 15 s a second no-limit request is made, a new point appears and the live line changes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let historyCall = 0
    const readings = async (url) => {
      const limit = new URL(url).searchParams.get('limit')
      if (limit === '1') return jsonResponse({ readings: [NEWEST_FIRST[0]] })
      historyCall += 1
      // First load: three readings. After the refresh: a fourth, newer reading at the front.
      if (historyCall === 1) return jsonResponse({ readings: NEWEST_FIRST })
      return jsonResponse({
        readings: [
          reading({ at: '2026-11-20T15:15:05.000Z', total: 9, rr: 25, spo2: 90, sys: 160, hr: 120, temp: '39.0' }),
          ...NEWEST_FIRST,
        ],
      })
    }
    const fetchMock = await openPage({ readings })

    await screen.findByText(ES_TITLE)
    await waitFor(() => expect(screen.queryByRole('img')).toBeTruthy())
    await waitFor(() => expect(chartModel().data.datasets[0].data).toEqual([3, 5, 7]))
    const firstLive = screen.getByText(/En vivo · Actualizado:/).textContent

    // Advance past the 15 s refresh interval.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_MS + 100)
    })

    // A second no-limit request was made and the new point appears.
    await waitFor(() => expect(chartReadingsCalls(fetchMock).length).toBeGreaterThanOrEqual(2))
    await waitFor(() => expect(chartModel().data.datasets[0].data).toEqual([3, 5, 7, 9]))
    // The live line updates (new timestamp). The chosen parameter (default score) is kept.
    await waitFor(() =>
      expect(screen.getByText(/En vivo · Actualizado:/).textContent).not.toBe(firstLive),
    )
    expect(chartModel().options.scales.y.title.text).toBe(ES_SCORE)
  })

  it('AC8 the chosen parameter is kept across a refresh', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fetchMock = await openPage()
    await screen.findByText(ES_TITLE)
    const select = await screen.findByLabelText(ES_PARAM_LABEL)
    fireEvent.change(select, { target: { value: 'heart_rate' } })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_MS + 100)
    })

    await waitFor(() => expect(chartReadingsCalls(fetchMock).length).toBeGreaterThanOrEqual(2))
    // Still heart rate after the refresh.
    expect(chartModel().options.scales.y.title.text).toBe(ES_HEART_RATE)
    expect(chartModel().data.datasets[0].data).toEqual([90, 100, 110])
  })

  it('AC8 refreshing pauses while the tab is hidden and requests at once when visible again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fetchMock = await openPage()
    await screen.findByText(ES_TITLE)
    await waitFor(() => expect(chartReadingsCalls(fetchMock).length).toBe(1))

    // Hide the tab: no new request even after the interval passes.
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_MS + 100)
    })
    expect(chartReadingsCalls(fetchMock)).toHaveLength(1)

    // Becoming visible requests at once.
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => expect(chartReadingsCalls(fetchMock).length).toBe(2))
  })

  it('AC8 leaving the page (unmount) stops further requests', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // Two history entries so the test "go back" control leaves the detail page for the list, which
    // unmounts the chart. The list fetches /api/patients, not readings.
    const fetchMock = stubBackend({
      me: async () => jsonResponse(DOCTOR),
      patient: async () => jsonResponse(PATIENT),
      readings: readingsHandler(),
      triageEvents: async () => jsonResponse({ triage_events: TRIAGE_EVENTS }),
      patients: async () => jsonResponse({ patients: [] }),
    })
    signInForTest(DOCTOR)
    renderApp(['/patients', PATH])
    await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))
    await act(async () => {})

    await screen.findByText(ES_TITLE)
    await waitFor(() => expect(chartReadingsCalls(fetchMock).length).toBe(1))

    // Navigate away (unmounts the detail page and its chart).
    fireEvent.click(screen.getByTestId('go-back'))
    await act(async () => {})
    await waitFor(() => expect(currentPath()).toBe('/patients'))
    const afterLeave = chartReadingsCalls(fetchMock).length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_MS * 2)
    })
    // No further chart readings request fired after leaving the page.
    expect(chartReadingsCalls(fetchMock).length).toBe(afterLeave)
  })

  it('AC8 two requests never overlap: a slow request is not joined by a timer request', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let resolveSlow
    let historyCall = 0
    const readings = async (url) => {
      const limit = new URL(url).searchParams.get('limit')
      if (limit === '1') return jsonResponse({ readings: [NEWEST_FIRST[0]] })
      historyCall += 1
      if (historyCall === 1) return jsonResponse({ readings: NEWEST_FIRST })
      // The second (refresh) request hangs until we resolve it, so no third can start meanwhile.
      return new Promise((resolve) => {
        resolveSlow = () => resolve(jsonResponse({ readings: NEWEST_FIRST }))
      })
    }
    const fetchMock = await openPage({ readings })
    await screen.findByText(ES_TITLE)
    await waitFor(() => expect(chartReadingsCalls(fetchMock).length).toBe(1))

    // Trigger the refresh (second request) and let it hang.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_MS + 100)
    })
    await waitFor(() => expect(chartReadingsCalls(fetchMock).length).toBe(2))

    // Even after another interval, no third request starts while the second is in flight.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_MS * 2)
    })
    expect(chartReadingsCalls(fetchMock)).toHaveLength(2)

    // Resolve the slow request so the component settles cleanly.
    await act(async () => {
      resolveSlow()
      await Promise.resolve()
    })
  })
})

describe('US-06 AC9 loading and errors', () => {
  it('AC9 the loading text shows on first load', async () => {
    // A readings call that never resolves keeps the chart in its loading state.
    const readings = async (url) => {
      const limit = new URL(url).searchParams.get('limit')
      if (limit === '1') return jsonResponse({ readings: [NEWEST_FIRST[0]] })
      return new Promise(() => {})
    }
    await openPage({ readings })

    expect(await screen.findByText(ES_LOADING)).toBeTruthy()
  })

  it('AC9 a first-load 500 shows the load-error message and retries after 15 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let historyCall = 0
    const readings = async (url) => {
      const limit = new URL(url).searchParams.get('limit')
      if (limit === '1') return jsonResponse({ readings: [NEWEST_FIRST[0]] })
      historyCall += 1
      // First no-limit call fails; the retry succeeds.
      if (historyCall === 1) return jsonResponse({ detail: 'Server error' }, 500)
      return jsonResponse({ readings: NEWEST_FIRST })
    }
    const fetchMock = await openPage({ readings })

    expect(await screen.findByText(ES_LOAD_ERROR)).toBeTruthy()
    // Raw server text is never shown.
    expect(document.body.textContent).not.toContain('Server error')
    const before = chartReadingsCalls(fetchMock).length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_MS + 100)
    })
    // A retry fired and the chart then loads.
    await waitFor(() => expect(chartReadingsCalls(fetchMock).length).toBeGreaterThan(before))
    await waitFor(() => expect(screen.queryByRole('img')).toBeTruthy())
    expect(screen.queryByText(ES_LOAD_ERROR)).toBeNull()
  })

  it('AC9 a later 500 keeps the last chart and shows the refresh-error message', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let historyCall = 0
    const readings = async (url) => {
      const limit = new URL(url).searchParams.get('limit')
      if (limit === '1') return jsonResponse({ readings: [NEWEST_FIRST[0]] })
      historyCall += 1
      // First load succeeds; the refresh fails.
      if (historyCall === 1) return jsonResponse({ readings: NEWEST_FIRST })
      return jsonResponse({ detail: 'Server error' }, 500)
    }
    await openPage({ readings })

    await screen.findByText(ES_TITLE)
    await waitFor(() => expect(screen.queryByRole('img')).toBeTruthy())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_MS + 100)
    })
    // The refresh-error message shows and the last chart is kept.
    expect(await screen.findByText(ES_REFRESH_ERROR)).toBeTruthy()
    expect(screen.getByRole('img')).toBeTruthy()
    expect(chartModel().data.datasets[0].data).toEqual([3, 5, 7])
  })

  it('AC9 a 401 on the chart request navigates to /login', async () => {
    const readings = async (url) => {
      const limit = new URL(url).searchParams.get('limit')
      if (limit === '1') return jsonResponse({ readings: [NEWEST_FIRST[0]] })
      return jsonResponse({ detail: 'Not authenticated' }, 401)
    }
    await openPage({ readings })

    await waitFor(() => expect(currentPath()).toBe('/login'))
  })
})

describe('US-06 AC10 Spanish by default and English switch', () => {
  it('AC10 switching to English translates the chart and keeps the parameter without a new request', async () => {
    const fetchMock = await openPage()

    await screen.findByText(ES_TITLE)
    const select = await screen.findByLabelText(ES_PARAM_LABEL)
    fireEvent.change(select, { target: { value: 'temperature' } })
    // Spanish uses a comma for the one-decimal temperature in the hidden table.
    expect(within(chartTable()).getByText('36,8')).toBeTruthy()
    const before = chartReadingsCalls(fetchMock).length

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    // English texts.
    expect(screen.getByText(EN_TITLE)).toBeTruthy()
    const modelEn = chartModel()
    expect(modelEn.options.scales.x.title.text).toBe(EN_X_AXIS)
    // The parameter is kept (temperature y-axis title), not reset to the NEWS2 score.
    expect(modelEn.options.scales.y.title.text).toBe('Temperature (°C)')
    // English uses a dot for the decimal.
    expect(within(chartTable()).getByText('36.8')).toBeTruthy()
    // No new readings request was made on the language switch.
    expect(chartReadingsCalls(fetchMock).length).toBe(before)
  })

  it('AC10 the default NEWS2 title reads "NEWS2 score" in English', async () => {
    await openPage()
    await screen.findByText(ES_TITLE)
    await waitFor(() => expect(screen.queryByRole('img')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(chartModel().options.scales.y.title.text).toBe(EN_SCORE)
  })
})

describe('US-06 AC11 design tokens only', () => {
  it('AC11 the dataset borderColor equals the stubbed --color-primary token value', async () => {
    // Stub getComputedStyle so the document element reports token colors (jsdom applies no CSS).
    const realGetComputedStyle = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      if (element === document.documentElement) {
        return {
          getPropertyValue: (name) => {
            if (name === '--color-primary') return ' #123456 '
            if (name === '--color-text') return '#222222'
            if (name === '--color-border') return '#cccccc'
            return ''
          },
        }
      }
      return realGetComputedStyle(element)
    })
    await openPage()

    await screen.findByText(ES_TITLE)
    await waitFor(() => expect(screen.queryByRole('img')).toBeTruthy())
    const dataset = chartModel().data.datasets[0]
    // Trimmed token value is used for the line and points.
    expect(dataset.borderColor).toBe('#123456')
    expect(dataset.pointBackgroundColor).toBe('#123456')
    expect(chartModel().options.scales.x.ticks.color).toBe('#222222')
  })

  it('AC11 without CSS (jsdom) the chart colors are undefined so Chart.js defaults apply', async () => {
    await openPage()

    await screen.findByText(ES_TITLE)
    await waitFor(() => expect(screen.queryByRole('img')).toBeTruthy())
    const dataset = chartModel().data.datasets[0]
    // jsdom returns empty token values; readChartColors leaves them undefined (dropped by JSON).
    expect(dataset.borderColor).toBeUndefined()
    expect(dataset.pointBackgroundColor).toBeUndefined()
  })
})
