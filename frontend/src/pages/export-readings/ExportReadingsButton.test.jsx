// US-10 T011: "Exportar CSV" button tests, following specs/026-export-vitals-csv/contracts/ui.md.
// The whole app runs in an in-memory router (renderApp) on /patients/PAT-001; fetch is stubbed
// (stubBackend) and wrapped so the export path answers from a per-test handler. downloadCsv is
// mocked, so no file is written. Demo users and synthetic readings only.
//
// Exact texts copied from frontend/src/i18n/translations.js:
//   exportReadings.button  'Exportar CSV'                                       / 'Export CSV'
//   exportReadings.busy    'Exportando…'                                        / 'Exporting…'
//   exportReadings.error   'No se pudo exportar el CSV. Inténtalo de nuevo.'   / 'Could not export the CSV. Please try again.'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
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
import { LanguageProvider } from '../../i18n/LanguageContext.jsx'
import ExportReadingsButton from './ExportReadingsButton.jsx'
import { downloadCsv } from './downloadCsv.js'
import { buildReadingsCsv, exportFileName } from './readingsCsv.js'

vi.mock('./downloadCsv.js', () => ({ downloadCsv: vi.fn() }))

const EXPORT_PATH = /^\/api\/patients\/[^/]+\/readings\/export$/
const EXPORT_URL_PATH = '/api/patients/PAT-001/readings/export'

const ES_BUTTON = 'Exportar CSV'
const EN_BUTTON = 'Export CSV'
const ES_BUSY = 'Exportando…'
const EN_BUSY = 'Exporting…'
const ES_ERROR = 'No se pudo exportar el CSV. Inténtalo de nuevo.'
const EN_ERROR = 'Could not export the CSV. Please try again.'
const ES_DETAIL_TITLE = 'Paciente PAT-001'
const ES_LOGIN = 'Iniciar sesión'

const HEADER =
  'recorded_at,respiratory_rate,spo2,on_oxygen,systolic_bp,heart_rate,consciousness,temperature,news2_total,risk_band\r\n'

const PATIENT = {
  identifier: 'PAT-001',
  name: 'Paciente de Prueba',
  age: 57,
  sex: 'male',
  triage_level: 3,
  status: 'active',
  admitted_at: '2026-11-19T08:15:00.000000Z',
  last_reading_at: '2026-11-20T15:04:05.123456Z',
}

function reading(recordedAt, temperature, total, band) {
  return {
    recorded_at: recordedAt,
    respiratory_rate: 18,
    spo2: 96,
    on_oxygen: false,
    systolic_bp: 120,
    heart_rate: 80,
    consciousness: 'A',
    temperature,
    score: { system: 'NEWS2', total, band, entries: [] },
  }
}

// Export endpoint answer: every reading, oldest first.
const EXPORT_READINGS = [
  reading('2026-11-20T09:00:00.000000Z', '37.0', 0, 'low'),
  reading('2026-11-20T15:04:05.123456Z', '38.4', 1, 'low'),
]

// The per-test handler for the export path; set by each test before clicking.
let exportHandler

function deferred() {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}

async function openDetail(user = DOCTOR) {
  const base = stubBackend({
    me: async () => jsonResponse(user),
    patient: async () => jsonResponse(PATIENT),
    readings: async () => jsonResponse({ readings: [EXPORT_READINGS[1]] }),
    triageEvents: async () => jsonResponse({ triage_events: [] }),
    suggestions: async () => jsonResponse({ suggestions: [] }),
  })
  const fetchMock = vi.fn((url, options) =>
    EXPORT_PATH.test(new URL(url).pathname) ? exportHandler(url, options) : base(url, options),
  )
  vi.stubGlobal('fetch', fetchMock)
  signInForTest(user)
  renderApp(['/patients/PAT-001'])
  await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))
  await act(async () => {})
  return fetchMock
}

function exportButton(name = ES_BUTTON) {
  return screen.getByRole('button', { name })
}

function switchToEnglish() {
  fireEvent.click(screen.getByRole('button', { name: 'English' }))
}

beforeEach(() => {
  resetSession()
  localStorage.clear()
  vi.mocked(downloadCsv).mockClear()
  exportHandler = async () => jsonResponse({ readings: EXPORT_READINGS })
})

afterEach(() => {
  vi.restoreAllMocks()
  resetSession()
  localStorage.clear()
  vi.unstubAllGlobals()
  document.documentElement.lang = 'es'
})

describe('US-10 AC8/AC9 labels and icon', () => {
  it('AC8/AC9 renders "Exportar CSV" (es) and "Export CSV" (en) with a decorative icon', async () => {
    await openDetail()

    const button = exportButton()
    const svgs = button.querySelectorAll('svg')
    expect(svgs).toHaveLength(1)
    expect(svgs[0].getAttribute('aria-hidden')).toBe('true')
    expect(svgs[0].getAttribute('focusable')).toBe('false')

    switchToEnglish()

    expect(exportButton(EN_BUTTON)).toBeTruthy()
    expect(screen.queryByRole('button', { name: ES_BUTTON })).toBeNull()
  })

  it('R9 no call to the export path is made on render', async () => {
    const fetchMock = await openDetail()

    expect(exportButton()).toBeTruthy()
    expect(fetchMock.mock.calls.filter(([url]) => EXPORT_PATH.test(new URL(url).pathname))).toHaveLength(0)
  })
})

describe('US-10 AC1/AC3/AC4 successful export', () => {
  it('AC1/AC3 a click calls the export path once with the bearer token and downloads the built CSV', async () => {
    const fetchMock = await openDetail()

    fireEvent.click(exportButton())

    await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1))
    const calls = callsTo(fetchMock, EXPORT_URL_PATH)
    expect(calls).toHaveLength(1)
    expect(calls[0][1].headers.Authorization).toBe('Bearer test-token')
    expect(downloadCsv).toHaveBeenCalledWith(buildReadingsCsv(EXPORT_READINGS), exportFileName('PAT-001'))
    // The file name is the expected PAT-001 pattern for today.
    expect(vi.mocked(downloadCsv).mock.calls[0][1]).toMatch(/^PAT-001-vital-signs-\d{4}-\d{2}-\d{2}\.csv$/)
    // No alert; the button is ready again.
    expect(screen.queryByText(ES_ERROR)).toBeNull()
    expect(exportButton().disabled).toBe(false)
  })

  it('AC4 empty readings give a header-only file', async () => {
    exportHandler = async () => jsonResponse({ readings: [] })
    await openDetail()

    fireEvent.click(exportButton())

    await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1))
    expect(downloadCsv).toHaveBeenCalledWith(HEADER, exportFileName('PAT-001'))
    expect(screen.queryByText(ES_ERROR)).toBeNull()
  })
})

describe('US-10 AC7 pending export', () => {
  it('AC7 while pending the button is disabled and shows "Exportando…"; a second click makes no call; enabled again after', async () => {
    const pending = deferred()
    exportHandler = () => pending.promise
    const fetchMock = await openDetail()

    fireEvent.click(exportButton())

    const busyButton = await screen.findByRole('button', { name: ES_BUSY })
    expect(busyButton.disabled).toBe(true)
    expect(screen.queryByRole('button', { name: ES_BUTTON })).toBeNull()

    // Click the rendered disabled button: no second request.
    fireEvent.click(busyButton)
    await act(async () => {})
    expect(callsTo(fetchMock, EXPORT_URL_PATH)).toHaveLength(1)
    expect(downloadCsv).not.toHaveBeenCalled()

    await act(async () => {
      pending.resolve(jsonResponse({ readings: EXPORT_READINGS }))
    })

    await waitFor(() => expect(exportButton().disabled).toBe(false))
    expect(downloadCsv).toHaveBeenCalledTimes(1)
    expect(callsTo(fetchMock, EXPORT_URL_PATH)).toHaveLength(1)
  })

  it('AC7 while pending the English label is "Exporting…"', async () => {
    const pending = deferred()
    exportHandler = () => pending.promise
    await openDetail()
    switchToEnglish()

    fireEvent.click(exportButton(EN_BUTTON))

    const busyButton = await screen.findByRole('button', { name: EN_BUSY })
    expect(busyButton.disabled).toBe(true)

    await act(async () => {
      pending.resolve(jsonResponse({ readings: [] }))
    })
    await waitFor(() => expect(exportButton(EN_BUTTON).disabled).toBe(false))
  })
})

// The five failure kinds; each must give the same result (AC7, FR-010).
const ERROR_CASES = [
  ['404', () => Promise.resolve(jsonResponse({ detail: 'Patient not found' }, 404))],
  ['503', () => Promise.resolve(jsonResponse({ detail: 'Service unavailable' }, 503))],
  ['network TypeError', () => Promise.reject(new TypeError('Failed to fetch'))],
  ['timeout AbortError', () => Promise.reject(new DOMException('Aborted', 'AbortError'))],
  ['body {} without readings', () => Promise.resolve(jsonResponse({}))],
]

describe('US-10 AC7/FR-010 error path', () => {
  it.each(ERROR_CASES)('AC7/FR-010 %s shows the Spanish alert, downloads nothing, button enabled again', async (_, handler) => {
    exportHandler = handler
    const fetchMock = await openDetail()

    fireEvent.click(exportButton())

    const alert = await screen.findByText(ES_ERROR)
    expect(alert.getAttribute('role')).toBe('alert')
    expect(downloadCsv).not.toHaveBeenCalled()
    expect(exportButton().disabled).toBe(false)
    expect(callsTo(fetchMock, EXPORT_URL_PATH)).toHaveLength(1)
    // Still on the detail page (no redirect for these errors).
    expect(currentPath()).toBe('/patients/PAT-001')
  })

  it.each(ERROR_CASES)('AC7/FR-010 %s shows the English alert after switching language', async (_, handler) => {
    exportHandler = handler
    await openDetail()
    switchToEnglish()

    fireEvent.click(exportButton(EN_BUTTON))

    const alert = await screen.findByText(EN_ERROR)
    expect(alert.getAttribute('role')).toBe('alert')
    expect(downloadCsv).not.toHaveBeenCalled()
    expect(exportButton(EN_BUTTON).disabled).toBe(false)
  })

  it('AC7 a successful retry after an error clears the alert and downloads', async () => {
    exportHandler = () => Promise.resolve(jsonResponse({}, 503))
    await openDetail()

    fireEvent.click(exportButton())
    await screen.findByText(ES_ERROR)

    exportHandler = async () => jsonResponse({ readings: EXPORT_READINGS })
    fireEvent.click(exportButton())

    await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(ES_ERROR)).toBeNull()
  })
})

describe('US-10 FR-007 invalid identifier', () => {
  it('FR-007 an invalid identifier renders nothing', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { container } = render(
      <LanguageProvider>
        <ExportReadingsButton identifier="not a code" />
      </LanguageProvider>,
    )

    expect(container.innerHTML).toBe('')
    expect(screen.queryByRole('button')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('US-10 AC5/FR-001/FR-009 access', () => {
  it('AC5 signed out goes to the login page and there is no export button', () => {
    resetSession()
    stubBackend()
    renderApp(['/patients/PAT-001'])

    expect(currentPath()).toBe('/login')
    expect(screen.getByRole('heading', { name: ES_LOGIN })).toBeTruthy()
    expect(screen.queryByRole('button', { name: ES_BUTTON })).toBeNull()
    expect(screen.queryByText(ES_BUTTON)).toBeNull()
  })

  it.each([
    ['DOCTOR', DOCTOR],
    ['NURSE', NURSE],
  ])('FR-001/FR-009 %s sees the export button on the detail page', async (_, user) => {
    await openDetail(user)

    expect(screen.getByRole('heading', { level: 1, name: ES_DETAIL_TITLE })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: ES_BUTTON })).toHaveLength(1)
  })
})
