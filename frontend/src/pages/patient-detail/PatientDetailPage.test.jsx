// US-05 patient detail page tests: AC1 to AC12, following
// specs/018-patient-detail/contracts/ui.md and spec.md. The whole app runs in an in-memory router
// (renderApp); fetch is stubbed (stubBackend with the patient / readings / triageEvents handlers),
// no backend and no network. Demo users and synthetic patient data only. No jest-dom; assertions
// use toBeTruthy / queryBy* / getByRole, like App.routes.test.jsx and RecordReadingPage.test.jsx.
//
// Exact Spanish / English texts copied from frontend/src/i18n/translations.js:
//   patientDetail.title             'Paciente {code}'               / 'Patient {code}'
//   patientDetail.loading           'Cargando…'                     / 'Loading…'
//   patientDetail.notFoundTitle     'Paciente no encontrado'        / 'Patient not found'
//   patientDetail.notFoundBody      'No existe un paciente con ese código.'
//                                   / 'There is no patient with that code.'
//   patientDetail.loadErrorTitle    'No se pudo cargar'             / 'Could not load'
//   patientDetail.retry             'Reintentar'                    / 'Retry'
//   patientDetail.noReadingsTitle   'Sin lecturas aún'              / 'No readings yet'
//   patientDetail.noReadingsBody    'Este paciente todavía no tiene lecturas registradas.'
//                                   / 'This patient has no readings recorded yet.'
//   patientDetail.noPreviousLevel   'Sin nivel previo'              / 'No previous level'
//   patientDetail.noScore           'Sin puntaje'                   / 'No score'
//   patientDetail.statusLabel       'Estado'                        / 'Status'
//   patientDetail.sex.male          'Masculino'                     / 'Male'
//   patientDetail.status.active     'Activo'                        / 'Active'
//   patientDetail.source.initial    'Triage inicial'                / 'Initial triage'
//   patientDetail.source.manual     'Manual'                        / 'Manual'
//   patientDetail.section.patient   'Datos del paciente'            / 'Patient data'
//   patientDetail.section.reading   'Lectura actual'                / 'Current reading'
//   patientDetail.section.history   'Historial de triage'           / 'Triage history'
//   nav.backToPatients              'Volver a la lista de pacientes'/ 'Back to the patient list'
//   recordReading.button            'Registrar signos vitales'      / 'Record vital signs'
//   patientDetail.latestReadingTitle 'Última lectura de signos vitales' / 'Latest vital signs reading'
//   recordReading.score             'Puntaje NEWS2'                 / 'NEWS2 score'
//   riskBand.medium (RiskBandBadge) 'Media'                         / 'Medium'
//   monitoringStatus.*              'Estable' / 'Vigilar' / 'Crítico' / 'Sin datos' (must NOT appear)
//   NotFoundPage heading            'Página no encontrada'          / 'Page not found'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor, within, act } from '@testing-library/react'
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

const PATH = '/patients/PAT-001'
const PATIENT_PATH = '/api/patients/PAT-001'
const READINGS_PATH = '/api/patients/PAT-001/readings'
const TRIAGE_EVENTS_PATH = '/api/patients/PAT-001/triage-events'

// Spanish (default) texts.
const ES_TITLE = 'Paciente PAT-001'
const ES_SECTION_PATIENT = 'Datos del paciente'
const ES_SECTION_READING = 'Lectura actual'
const ES_SECTION_HISTORY = 'Historial de triage'
const ES_SEX_MALE = 'Masculino'
const ES_STATUS_ACTIVE = 'Activo'
const ES_NO_READINGS_TITLE = 'Sin lecturas aún'
const ES_NO_READINGS_BODY = 'Este paciente todavía no tiene lecturas registradas.'
const ES_NO_PREVIOUS_LEVEL = 'Sin nivel previo'
const ES_NO_SCORE = 'Sin puntaje'
const ES_SOURCE_INITIAL = 'Triage inicial'
const ES_SOURCE_MANUAL = 'Manual'
const ES_NOT_FOUND_TITLE = 'Paciente no encontrado'
const ES_NOT_FOUND_BODY = 'No existe un paciente con ese código.'
const ES_LOAD_ERROR_TITLE = 'No se pudo cargar'
const ES_RETRY = 'Reintentar'
const ES_BACK_TO_PATIENTS = 'Volver a la lista de pacientes'
const ES_RECORD_BUTTON = 'Registrar signos vitales'
const ES_RESULT_TITLE = 'Última lectura de signos vitales'
const ES_BAND_MEDIUM = 'Media'
const ES_GLOBAL_NOT_FOUND = 'Página no encontrada'

// English texts (after the language switch).
const EN_TITLE = 'Patient PAT-001'
const EN_SECTION_PATIENT = 'Patient data'
const EN_SECTION_READING = 'Current reading'
const EN_SECTION_HISTORY = 'Triage history'
const EN_SEX_MALE = 'Male'
const EN_STATUS_ACTIVE = 'Active'
const EN_SOURCE_INITIAL = 'Initial triage'
const EN_BAND_MEDIUM = 'Medium'

// Any StatusBadge traffic-light text; none of these may appear on this page (FR-005, AC2, AC4).
const MONITORING_STATUS_TEXTS = ['Estable', 'Vigilar', 'Crítico', 'Sin datos']

// Synthetic patient, matching the patient-detail-api contract (no internal id, no monitoring_status).
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

// The contract example reading (contracts/readings-api.md): total 5, band medium, seven entries.
// Same shape used by RecordReadingPage.test.jsx.
const EXAMPLE_READING = {
  recorded_at: '2026-11-20T15:04:05.123456Z',
  respiratory_rate: 22,
  spo2: 95,
  on_oxygen: false,
  systolic_bp: 118,
  heart_rate: 96,
  consciousness: 'A',
  temperature: '38.4',
  score: {
    system: 'NEWS2',
    total: 5,
    band: 'medium',
    entries: [
      { parameter: 'respiratory_rate', value: 22, points: 2, low: 21, high: 24, category: [] },
      { parameter: 'spo2', value: 95, points: 1, low: 94, high: 95, category: [] },
      { parameter: 'on_oxygen', value: false, points: 0, low: null, high: null, category: [false] },
      { parameter: 'systolic_bp', value: 118, points: 0, low: 111, high: 219, category: [] },
      { parameter: 'heart_rate', value: 96, points: 1, low: 91, high: 110, category: [] },
      { parameter: 'consciousness', value: 'A', points: 0, low: null, high: null, category: ['A'] },
      { parameter: 'temperature', value: '38.4', points: 1, low: '38.1', high: '39.0', category: [] },
    ],
  },
}

// Triage history newest-first: a later 'manual' re-triage (with a previous level and a score),
// then the initial event (no previous level, no score). The endpoint already orders them.
const TRIAGE_EVENTS = [
  {
    occurred_at: '2026-11-20T15:05:00.000000Z',
    previous_level: 4,
    new_level: 3,
    score: 5,
    reason: 'NEWS2 reached medium risk',
    source: 'manual',
  },
  {
    occurred_at: '2026-11-20T09:00:00.000000Z',
    previous_level: null,
    new_level: 4,
    score: null,
    reason: 'Triage on admission',
    source: 'initial',
  },
]

// Signs in, opens the detail page and waits for the TS-06 /me check, like RecordReadingPage.test.jsx.
async function openPage({
  user = DOCTOR,
  patient = async () => jsonResponse(PATIENT),
  readings = async () => jsonResponse({ readings: [EXAMPLE_READING] }),
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

// The data rows of the triage-history table, found inside the "Historial de triage" card (other
// tables are on the page: the reading result table and, since US-06, the chart's hidden table).
function historyRows() {
  const historyCard = screen.getByRole('heading', { name: ES_SECTION_HISTORY }).parentElement
  const table = within(historyCard).getByRole('table')
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
  document.documentElement.lang = 'es'
})

describe('US-05 AC1/AC2/AC3/AC4/AC10/AC12 loaded patient with a reading', () => {
  it('AC2 the three section blocks and the patient data (name, age, sex, status, triage, admitted) render, with no StatusBadge', async () => {
    await openPage()

    await screen.findByText(ES_SECTION_PATIENT)
    expect(screen.getByRole('heading', { level: 1, name: ES_TITLE })).toBeTruthy()
    // The three section blocks all present (AC1 reading + AC2 patient + AC3 history). The patient
    // and history blocks are Card titles (visible text); the reading block is a labelled region.
    expect(screen.getByText(ES_SECTION_PATIENT)).toBeTruthy()
    expect(screen.getByRole('region', { name: ES_SECTION_READING })).toBeTruthy()
    expect(screen.getByText(ES_SECTION_HISTORY)).toBeTruthy()
    // Patient data: name, age, translated sex, translated status, admitted_at (a formatted date).
    expect(screen.getByText(PATIENT.name)).toBeTruthy()
    expect(screen.getByText(String(PATIENT.age))).toBeTruthy()
    expect(screen.getByText(ES_SEX_MALE)).toBeTruthy()
    expect(screen.getByText(ES_STATUS_ACTIVE)).toBeTruthy()
    expect(screen.getByText(new Date(PATIENT.admitted_at).toLocaleString('es'))).toBeTruthy()
    // TriageLevelBadge for the current level (triage_level 3 -> "Triage III"), in the patient block.
    const patientCard = screen.getByText(ES_SECTION_PATIENT).closest('section, div')
    expect(within(patientCard).getByText('Triage III')).toBeTruthy()
    // AC2 / AC4 / FR-005: no monitoring-status traffic light (no StatusBadge text anywhere).
    for (const text of MONITORING_STATUS_TEXTS) {
      expect(screen.queryByText(text)).toBeNull()
    }
  })

  it('AC1/AC4/AC10 the reading block shows the stored NEWS2 score, the risk band (RiskBandBadge) and a reason row', async () => {
    await openPage()

    // ReadingResult renders the stored score and band read from the readings endpoint.
    expect(await screen.findByText('Puntaje NEWS2: 5')).toBeTruthy()
    expect(screen.getByText(ES_RESULT_TITLE)).toBeTruthy()
    // The risk band via RiskBandBadge (band label 'Media'), not a StatusBadge.
    expect(screen.getByText(ES_BAND_MEDIUM)).toBeTruthy()
    // At least one per-parameter reason row (the seven vitals table from ReadingResult).
    expect(within(screen.getByRole('region', { name: ES_SECTION_READING })).getByText('Frecuencia respiratoria (resp/min)')).toBeTruthy()
    expect(screen.getByText('21–24')).toBeTruthy()
  })

  it('AC3 the triage history renders newest-first: the manual event before the initial event', async () => {
    await openPage()

    await screen.findByText(ES_SECTION_HISTORY)
    const rows = historyRows()
    expect(rows).toHaveLength(2)
    // Row 0 is the newest (manual) event; row 1 is the initial event.
    expect(within(rows[0]).getByText(ES_SOURCE_MANUAL)).toBeTruthy()
    expect(within(rows[0]).getByText('5')).toBeTruthy()
    expect(within(rows[1]).getByText(ES_SOURCE_INITIAL)).toBeTruthy()
    // The initial event has no previous level and no score (AC3 edge cases).
    expect(within(rows[1]).getByText(ES_NO_PREVIOUS_LEVEL)).toBeTruthy()
    expect(within(rows[1]).getByText(ES_NO_SCORE)).toBeTruthy()
    // Newest-first ordering: the manual row's timestamp is after the initial row's.
    const firstTime = new Date(TRIAGE_EVENTS[0].occurred_at).toLocaleString('es')
    const secondTime = new Date(TRIAGE_EVENTS[1].occurred_at).toLocaleString('es')
    expect(within(rows[0]).getByText(firstTime)).toBeTruthy()
    expect(within(rows[1]).getByText(secondTime)).toBeTruthy()
  })

  it('AC12 the nurse-only record-reading button shows for a NURSE and not for a DOCTOR', async () => {
    await openPage({ user: NURSE })

    await screen.findByText(ES_SECTION_PATIENT)
    expect(screen.getByRole('button', { name: ES_RECORD_BUTTON })).toBeTruthy()
  })

  it('AC12 the record-reading button is not shown for a DOCTOR', async () => {
    await openPage({ user: DOCTOR })

    await screen.findByText(ES_SECTION_PATIENT)
    expect(screen.queryByRole('button', { name: ES_RECORD_BUTTON })).toBeNull()
  })

  it('AC10/AC12 all three read endpoints are called for a valid code', async () => {
    const fetchMock = await openPage()

    await screen.findByText(ES_SECTION_PATIENT)
    expect(callsTo(fetchMock, PATIENT_PATH)).toHaveLength(1)
    expect(callsTo(fetchMock, READINGS_PATH).filter(([url]) => new URL(url).searchParams.get('limit') === '1')).toHaveLength(1)
    expect(callsTo(fetchMock, TRIAGE_EVENTS_PATH)).toHaveLength(1)
  })
})

describe('US-05 AC5 patient with no readings', () => {
  it('AC5 the "no readings yet" state shows, with no band and no reading result, while the patient block and history still render', async () => {
    await openPage({ readings: async () => jsonResponse({ readings: [] }) })

    expect(await screen.findByText(ES_NO_READINGS_TITLE)).toBeTruthy()
    expect(screen.getByText(ES_NO_READINGS_BODY)).toBeTruthy()
    // No reading result, no band, no fabricated last-reading score.
    expect(screen.queryByText(ES_RESULT_TITLE)).toBeNull()
    expect(screen.queryByText(ES_BAND_MEDIUM)).toBeNull()
    expect(screen.queryByText('Puntaje NEWS2: 5')).toBeNull()
    // No monitoring-status no_data badge.
    for (const text of MONITORING_STATUS_TEXTS) {
      expect(screen.queryByText(text)).toBeNull()
    }
    // The patient data block and the triage history still render.
    expect(screen.getByText(ES_SECTION_PATIENT)).toBeTruthy()
    expect(screen.getByText(PATIENT.name)).toBeTruthy()
    expect(screen.getByText(ES_SECTION_HISTORY)).toBeTruthy()
    expect(historyRows()).toHaveLength(2)
  })
})

describe('US-05 AC6 invalid patient code in the address', () => {
  it('AC6 a badly-formatted code shows the global not-found page and makes no /api/patients call', async () => {
    const fetchMock = stubBackend({
      patient: async () => jsonResponse(PATIENT),
      readings: async () => jsonResponse({ readings: [EXAMPLE_READING] }),
      triageEvents: async () => jsonResponse({ triage_events: TRIAGE_EVENTS }),
    })
    signInForTest(DOCTOR)
    renderApp(['/patients/not-a-code'])
    await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))
    await act(async () => {})

    // The global NotFoundPage, not the page's own "patient not found" state.
    expect(screen.getByRole('heading', { level: 1, name: ES_GLOBAL_NOT_FOUND })).toBeTruthy()
    expect(screen.queryByText(ES_NOT_FOUND_TITLE)).toBeNull()
    // No backend call to any /api/patients/... path; only /api/me may have run.
    expect(
      fetchMock.mock.calls.every(([url]) => new URL(url).pathname === '/api/me'),
    ).toBe(true)
  })
})

describe('US-05 AC6 well-formed but unknown patient code (404)', () => {
  it('AC6 a 404 shows the page\'s "patient not found" state with a back link to /patients', async () => {
    await openPage({ patient: async () => jsonResponse({ detail: 'Patient not found' }, 404) })

    expect(await screen.findByText(ES_NOT_FOUND_TITLE)).toBeTruthy()
    // Distinct body text tells this apart from the global NotFoundPage.
    expect(screen.getByText(ES_NOT_FOUND_BODY)).toBeTruthy()
    expect(screen.queryByText(ES_GLOBAL_NOT_FOUND)).toBeNull()
    // The page title still shows, and there is a link back to the patient list.
    expect(screen.getByRole('heading', { level: 1, name: ES_TITLE })).toBeTruthy()
    expect(screen.getByRole('link', { name: ES_BACK_TO_PATIENTS }).getAttribute('href')).toBe(
      '/patients',
    )
    // The raw server text is never shown.
    expect(document.body.textContent).not.toContain('Patient not found')
  })
})

describe('US-05 AC6/FR-014 load error (503 / network)', () => {
  it('FR-014 a 503 shows the "could not load" state with a retry button; retry re-requests and the page then loads', async () => {
    let calls = 0
    const patient = vi.fn(async () => {
      calls += 1
      return calls === 1
        ? jsonResponse({ detail: 'Service unavailable' }, 503)
        : jsonResponse(PATIENT)
    })
    const fetchMock = await openPage({ patient })

    expect(await screen.findByText(ES_LOAD_ERROR_TITLE)).toBeTruthy()
    const retry = screen.getByRole('button', { name: ES_RETRY })
    expect(retry).toBeTruthy()
    // The raw server text is never shown.
    expect(document.body.textContent).not.toContain('Service unavailable')
    const before = callsTo(fetchMock, PATIENT_PATH).length

    fireEvent.click(retry)

    // Retry re-requests the patient endpoint and the loaded page then appears.
    await screen.findByText(ES_SECTION_PATIENT)
    expect(callsTo(fetchMock, PATIENT_PATH).length).toBeGreaterThan(before)
    expect(screen.getByText(PATIENT.name)).toBeTruthy()
    expect(screen.queryByText(ES_LOAD_ERROR_TITLE)).toBeNull()
  })

  it('FR-014 a network failure (TypeError) shows the "could not load" state, never the raw error', async () => {
    await openPage({ patient: async () => Promise.reject(new TypeError('Failed to fetch')) })

    expect(await screen.findByText(ES_LOAD_ERROR_TITLE)).toBeTruthy()
    expect(screen.getByRole('button', { name: ES_RETRY })).toBeTruthy()
    expect(document.body.textContent).not.toContain('Failed to fetch')
  })
})

describe('US-05 AC11 Spanish by default and English switch', () => {
  it('AC11 every heading, label, source and status renders in ES by default', async () => {
    await openPage()

    await screen.findByText(ES_SECTION_PATIENT)
    expect(screen.getByRole('heading', { level: 1, name: ES_TITLE })).toBeTruthy()
    expect(screen.getByRole('region', { name: ES_SECTION_READING })).toBeTruthy()
    expect(screen.getByText(ES_SECTION_HISTORY)).toBeTruthy()
    expect(screen.getByText(ES_SEX_MALE)).toBeTruthy()
    expect(screen.getByText(ES_STATUS_ACTIVE)).toBeTruthy()
    expect(screen.getByText(ES_SOURCE_INITIAL)).toBeTruthy()
    expect(screen.getByText(ES_BAND_MEDIUM)).toBeTruthy()
  })

  it('AC11 clicking English translates every label and keeps the loaded data (name, score)', async () => {
    await openPage()
    await screen.findByText(ES_SECTION_PATIENT)

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    // Headings, source, status and band switch to English.
    expect(screen.getByRole('heading', { level: 1, name: EN_TITLE })).toBeTruthy()
    expect(screen.getByText(EN_SECTION_PATIENT)).toBeTruthy()
    expect(screen.getByRole('region', { name: EN_SECTION_READING })).toBeTruthy()
    expect(screen.getByText(EN_SECTION_HISTORY)).toBeTruthy()
    expect(screen.getByText(EN_SEX_MALE)).toBeTruthy()
    expect(screen.getByText(EN_STATUS_ACTIVE)).toBeTruthy()
    expect(screen.getByText(EN_SOURCE_INITIAL)).toBeTruthy()
    expect(screen.getByText(EN_BAND_MEDIUM)).toBeTruthy()
    // The Spanish strings are gone.
    expect(screen.queryByText(ES_SECTION_PATIENT)).toBeNull()
    expect(screen.queryByText(ES_SOURCE_INITIAL)).toBeNull()
    // Switching language does not reload or lose the loaded data (name, score stay).
    expect(screen.getByText(PATIENT.name)).toBeTruthy()
    expect(screen.getByText('NEWS2 score: 5')).toBeTruthy()
  })
})
