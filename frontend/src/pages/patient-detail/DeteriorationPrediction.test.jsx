// Deterioration prediction component tests (US-08): AC9-AC12 and FR-010/FR-011, following
// specs/024-deterioration-prediction/contracts/ui.md. The component is rendered on its own inside
// the real LanguageProvider and AuthProvider (signed in), with a test-only language switch; fetch
// is stubbed (stubBackend with the prediction handler), no backend and no network. One page-level
// test renders the whole app at /patients/PAT-001 (renderApp). Synthetic data only (PAT-NNN codes,
// demo users, made-up scores).
//
// Exact texts copied from frontend/src/i18n/translations.js:
//   prediction.title     'Predicción de deterioro' / 'Deterioration prediction'
//   prediction.none      'Sin predicción de deterioro.' / 'No deterioration prediction.'
//   prediction.notEnough 'Se necesitan al menos 3 lecturas para la predicción de deterioro.'
//   prediction.loadError 'No se pudo cargar la predicción de deterioro.'
//   riskBand.medium      'Media' / 'Medium'
//   recordReading.button 'Registrar signos vitales'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { REQUEST_TIMEOUT_MS } from '../../api/client.js'
import { AuthProvider } from '../../auth/AuthContext.jsx'
import { getSession } from '../../auth/session.js'
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext.jsx'
import { renderApp } from '../../testing/renderApp.jsx'
import {
  DOCTOR,
  NURSE,
  callsTo,
  jsonResponse,
  resetSession,
  signInForTest,
  stubBackend,
} from '../../testing/fakeBackend.js'
import DeteriorationPrediction from './DeteriorationPrediction.jsx'

const PREDICTION_PATH = '/api/patients/PAT-001/prediction'

const ES_TITLE = 'Predicción de deterioro'
const ES_NONE = 'Sin predicción de deterioro.'
const ES_NOT_ENOUGH = 'Se necesitan al menos 3 lecturas para la predicción de deterioro.'
const ES_LOAD_ERROR = 'No se pudo cargar la predicción de deterioro.'
const ES_BAND_MEDIUM = 'Media'
const EN_TITLE = 'Deterioration prediction'
const EN_BAND_MEDIUM = 'Medium'
const ES_RECORD_BUTTON = 'Registrar signos vitales'
const LANG_BUTTON = 'test-english'

// Every text the component may show; none may appear while loading or on 404 / 401.
const ALL_COMPONENT_TEXTS = [ES_TITLE, ES_NONE, ES_NOT_ENOUGH, ES_LOAD_ERROR, ES_BAND_MEDIUM]

// Contract answers (contracts/prediction-api.md): readings oldest first, {total, recorded_at}.
const READINGS_2_4_6 = [
  { total: 2, recorded_at: '2026-11-23T08:00:00.000000Z' },
  { total: 4, recorded_at: '2026-11-23T08:05:00.000000Z' },
  { total: 6, recorded_at: '2026-11-23T08:10:00.000000Z' },
]
const RISING = { rising: true, reason: null, readings: READINGS_2_4_6, latest_band: 'medium' }
const NOT_RISING = {
  rising: false,
  reason: 'not_rising',
  readings: [
    { total: 3, recorded_at: '2026-11-23T08:00:00.000000Z' },
    { total: 3, recorded_at: '2026-11-23T08:05:00.000000Z' },
    { total: 3, recorded_at: '2026-11-23T08:10:00.000000Z' },
  ],
  latest_band: 'low',
}
const MISSING_SCORE = {
  rising: false,
  reason: 'missing_score',
  readings: [
    { total: 2, recorded_at: '2026-11-23T08:00:00.000000Z' },
    { total: null, recorded_at: '2026-11-23T08:05:00.000000Z' },
    { total: 5, recorded_at: '2026-11-23T08:10:00.000000Z' },
  ],
  latest_band: 'medium',
}
const NOT_ENOUGH = {
  rising: false,
  reason: 'not_enough_readings',
  readings: [{ total: 4, recorded_at: '2026-11-23T08:00:00.000000Z' }],
  latest_band: 'low-medium',
}

// Test-only language switch (the real one lives in AppShell, not rendered here).
function EnglishButton() {
  const { setLang } = useLanguage()
  return (
    <button type="button" onClick={() => setLang('en')}>
      {LANG_BUTTON}
    </button>
  )
}

// Signs in, renders the component alone with the given prediction handler, and waits for the
// prediction request to be sent. Returns { fetchMock, container }. With fake timers, waitFor
// cannot poll (its setTimeout is faked), so pass { fakeTimers: true } to only flush once.
async function renderComponent(prediction, user = DOCTOR, { fakeTimers = false } = {}) {
  const fetchMock = stubBackend({ me: async () => jsonResponse(user), prediction })
  signInForTest(user)
  const { container } = render(
    <MemoryRouter>
      <LanguageProvider>
        <AuthProvider>
          <EnglishButton />
          <DeteriorationPrediction identifier="PAT-001" />
        </AuthProvider>
      </LanguageProvider>
    </MemoryRouter>,
  )
  if (!fakeTimers) {
    await waitFor(() => expect(callsTo(fetchMock, PREDICTION_PATH).length).toBeGreaterThan(0))
  }
  await act(async () => {})
  return { fetchMock, container }
}

// The component's own text: everything rendered except the test-only language button.
function componentText(container) {
  return container.textContent.replace(LANG_BUTTON, '')
}

function expectNothingFromComponent(container) {
  expect(componentText(container).trim()).toBe('')
  for (const text of ALL_COMPONENT_TEXTS) {
    expect(screen.queryByText(text)).toBeNull()
  }
  // No score, band or icon either.
  expect(container.querySelector('svg')).toBeNull()
}

beforeEach(() => {
  resetSession()
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  resetSession()
  localStorage.clear()
  vi.unstubAllGlobals()
  document.documentElement.lang = 'es'
})

// --- Request ---------------------------------------------------------------------

describe('US-08 FR-010 request', () => {
  it('FR-010 the component requests /api/patients/PAT-001/prediction once', async () => {
    const { fetchMock } = await renderComponent(async () => jsonResponse(RISING))

    expect(callsTo(fetchMock, PREDICTION_PATH)).toHaveLength(1)
    const [, options] = callsTo(fetchMock, PREDICTION_PATH)[0]
    expect((options?.method ?? 'GET').toUpperCase()).toBe('GET')
  })
})

// --- AC9: warning card -------------------------------------------------------------

describe('US-08 AC9 rising answer shows the warning card', () => {
  it('AC9 shows the title, the scores 2, 4, 6 in order, the medium RiskBandBadge and an aria-hidden icon', async () => {
    const { container } = await renderComponent(async () => jsonResponse(RISING))

    expect(await screen.findByText(ES_TITLE)).toBeTruthy()
    // Scores oldest -> newest, in that order (joined with an arrow or similar separator).
    expect(componentText(container)).toMatch(/2\D{0,5}4\D{0,5}6/)
    // Newest risk band via RiskBandBadge.
    const badgeLabel = screen.getByText(ES_BAND_MEDIUM)
    expect(badgeLabel).toBeTruthy()
    // A decorative icon of its own (not only the badge's icon), hidden from assistive tech.
    const badge = badgeLabel.parentElement
    const ownIcons = [...container.querySelectorAll('svg')].filter((svg) => !badge.contains(svg))
    expect(ownIcons.length).toBeGreaterThan(0)
    for (const svg of ownIcons) expect(svg.getAttribute('aria-hidden')).toBe('true')
    // Not a no-prediction / error view.
    expect(screen.queryByText(ES_NONE)).toBeNull()
    expect(screen.queryByText(ES_NOT_ENOUGH)).toBeNull()
    expect(screen.queryByText(ES_LOAD_ERROR)).toBeNull()
  })

  it('AC9 (Clarifications) a rising answer with the newest band high still shows the warning', async () => {
    await renderComponent(async () => jsonResponse({ ...RISING, latest_band: 'high' }))

    expect(await screen.findByText(ES_TITLE)).toBeTruthy()
    expect(screen.getByText('Alta')).toBeTruthy()
  })

  it('AC9 a nurse sees the same warning card', async () => {
    await renderComponent(async () => jsonResponse(RISING), NURSE)

    expect(await screen.findByText(ES_TITLE)).toBeTruthy()
    expect(screen.getByText(ES_BAND_MEDIUM)).toBeTruthy()
  })
})

// --- AC10: no prediction / not enough readings ------------------------------------

describe('US-08 AC10 no warning when nothing is predicted', () => {
  it.each([
    ['not_rising', NOT_RISING],
    ['missing_score', MISSING_SCORE],
  ])('AC10 reason %s shows the "no deterioration prediction" note and no warning title', async (_label, body) => {
    const { container } = await renderComponent(async () => jsonResponse(body))

    expect(await screen.findByText(ES_NONE)).toBeTruthy()
    expect(screen.queryByText(ES_TITLE)).toBeNull()
    expect(screen.queryByText(ES_NOT_ENOUGH)).toBeNull()
    expect(screen.queryByText(ES_LOAD_ERROR)).toBeNull()
    // Not shown as a warning: no risk band badge.
    expect(screen.queryByText(ES_BAND_MEDIUM)).toBeNull()
    expect(screen.queryByText('Baja')).toBeNull()
    expect(container.querySelector('svg')).toBeNull()
  })

  it('AC10 reason not_enough_readings shows the "at least 3 readings" note and no warning title', async () => {
    await renderComponent(async () => jsonResponse(NOT_ENOUGH))

    expect(await screen.findByText(ES_NOT_ENOUGH)).toBeTruthy()
    expect(screen.queryByText(ES_TITLE)).toBeNull()
    expect(screen.queryByText(ES_NONE)).toBeNull()
    expect(screen.queryByText(ES_LOAD_ERROR)).toBeNull()
  })

  it('AC10 not_enough_readings with no readings at all (0 readings, latest_band null) shows the same note', async () => {
    await renderComponent(async () =>
      jsonResponse({ rising: false, reason: 'not_enough_readings', readings: [], latest_band: null }),
    )

    expect(await screen.findByText(ES_NOT_ENOUGH)).toBeTruthy()
    expect(screen.queryByText(ES_TITLE)).toBeNull()
  })
})

// --- AC11: loading and failure -----------------------------------------------------

describe('US-08 AC11 loading and failure', () => {
  it('AC11 while the request is pending nothing is rendered (no title, score, band or note)', async () => {
    const { container } = await renderComponent(() => new Promise(() => {}))

    expectNothingFromComponent(container)
  })

  it('AC11 a 503 shows the fixed load-error text, never the server text', async () => {
    await renderComponent(async () => jsonResponse({ detail: 'Service unavailable' }, 503))

    expect(await screen.findByText(ES_LOAD_ERROR)).toBeTruthy()
    expect(document.body.textContent).not.toContain('Service unavailable')
    expect(screen.queryByText(ES_TITLE)).toBeNull()
    expect(screen.queryByText(ES_NONE)).toBeNull()
  })

  it('AC11 a network failure (fetch rejects) shows the fixed load-error text, never the raw error', async () => {
    await renderComponent(async () => Promise.reject(new TypeError('Failed to fetch')))

    expect(await screen.findByText(ES_LOAD_ERROR)).toBeTruthy()
    expect(document.body.textContent).not.toContain('Failed to fetch')
  })

  it('AC11 a timeout (client aborts after REQUEST_TIMEOUT_MS) shows the fixed load-error text', async () => {
    // Only the client's timer is faked; React's scheduler keeps working (App.test.jsx pattern).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { fetchMock, container } = await renderComponent(
      (url, { signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
      DOCTOR,
      { fakeTimers: true },
    )
    expect(callsTo(fetchMock, PREDICTION_PATH)).toHaveLength(1)

    // Still pending just before the timeout: nothing shown.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1)
    })
    expectNothingFromComponent(container)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(screen.getByText(ES_LOAD_ERROR)).toBeTruthy()
    expect(document.body.textContent).not.toContain('Aborted')
  })

  it('AC11 a 404 renders nothing (no note, no error line)', async () => {
    const { container } = await renderComponent(async () =>
      jsonResponse({ detail: 'Patient not found' }, 404),
    )
    await act(async () => {})

    expectNothingFromComponent(container)
    expect(document.body.textContent).not.toContain('Patient not found')
  })

  it('AC11 a 401 shows nothing from the component and the session-expiry handling clears the session', async () => {
    const { container } = await renderComponent(async () =>
      jsonResponse({ detail: 'Not authenticated' }, 401),
    )
    await act(async () => {})

    expectNothingFromComponent(container)
    expect(document.body.textContent).not.toContain('Not authenticated')
    // The client's 401 handling (TS-06) cleared the stored session.
    expect(getSession()).toBeNull()
  })
})

// --- AC12: language ------------------------------------------------------------------

describe('US-08 AC12 Spanish by default, English switch', () => {
  it('AC12 after switching to English the rising card shows the English title and the same scores, with no new request', async () => {
    const { fetchMock, container } = await renderComponent(async () => jsonResponse(RISING))
    expect(await screen.findByText(ES_TITLE)).toBeTruthy()
    const before = callsTo(fetchMock, PREDICTION_PATH).length

    fireEvent.click(screen.getByRole('button', { name: LANG_BUTTON }))

    expect(screen.getByText(EN_TITLE)).toBeTruthy()
    expect(screen.queryByText(ES_TITLE)).toBeNull()
    expect(screen.getByText(EN_BAND_MEDIUM)).toBeTruthy()
    expect(componentText(container)).toMatch(/2\D{0,5}4\D{0,5}6/)
    expect(callsTo(fetchMock, PREDICTION_PATH)).toHaveLength(before)
  })

  it('AC12 the not-enough-readings note switches to English', async () => {
    await renderComponent(async () => jsonResponse(NOT_ENOUGH))
    expect(await screen.findByText(ES_NOT_ENOUGH)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: LANG_BUTTON }))

    expect(
      screen.getByText('At least 3 readings are needed for the deterioration prediction.'),
    ).toBeTruthy()
  })
})

// --- AC11 page level: the rest of the detail page keeps working ------------------------

const PATIENT = {
  identifier: 'PAT-001',
  name: 'Paciente de Prueba',
  age: 57,
  sex: 'male',
  triage_level: 3,
  status: 'active',
  admitted_at: '2026-11-19T08:15:00.000000Z',
  last_reading_at: null,
}

describe('US-08 AC11 page level', () => {
  it('AC11 on the detail page a prediction 503 shows the load-error text while the patient name and record-reading button still render', async () => {
    const fetchMock = stubBackend({
      me: async () => jsonResponse(NURSE),
      patient: async () => jsonResponse(PATIENT),
      readings: async () => jsonResponse({ readings: [] }),
      triageEvents: async () => jsonResponse({ triage_events: [] }),
      prediction: async () => jsonResponse({ detail: 'Service unavailable' }, 503),
    })
    signInForTest(NURSE)
    renderApp(['/patients/PAT-001'])
    await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))
    await act(async () => {})

    expect(await screen.findByText(PATIENT.name)).toBeTruthy()
    expect(screen.getByRole('button', { name: ES_RECORD_BUTTON })).toBeTruthy()
    expect(await screen.findByText(ES_LOAD_ERROR)).toBeTruthy()
    expect(callsTo(fetchMock, PREDICTION_PATH)).toHaveLength(1)
  })
})
