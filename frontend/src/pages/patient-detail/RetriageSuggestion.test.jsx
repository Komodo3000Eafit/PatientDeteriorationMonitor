// Re-triage suggestion component tests (US-04): AC14-AC18, following
// specs/020-retriage-suggestion-alerts/contracts/ui.md. The whole app runs in an in-memory router
// (renderApp) on the patient detail page, where the component is mounted; fetch is stubbed
// (stubBackend with the suggestions handler), no backend and no network. Synthetic data only
// (PAT-NNN codes, demo users).
//
// Exact texts copied from frontend/src/i18n/translations.js:
//   retriage.title        'Sugerencia de retriage' / 'Re-triage suggestion'
//   retriage.currentLevel 'Nivel actual' / 'Current level'
//   retriage.suggestedLevel 'Nivel sugerido' / 'Suggested level'
//   retriage.severity.high 'Severidad alta' / 'High severity'
//   retriage.accept       'Aceptar' / 'Accept'
//   retriage.dismiss      'Descartar' / 'Dismiss'
//   retriage.accepted     'Retriage aplicado.' / 'Re-triage applied.'
//   retriage.dismissed    'Sugerencia descartada.' / 'Suggestion dismissed.'
//   retriage.none         'No hay sugerencias de retriage abiertas.' / 'No open re-triage suggestions.'
//   retriage.loadError    'No se pudieron cargar las sugerencias.' / 'Could not load suggestions.'
//   retriage.actionError  'No se pudo completar la acción. Inténtalo de nuevo.' /
//                         'The action could not be completed. Try again.'
//   triageLevel.3 'Triage III'; triageLevel.1 'Triage I'; riskBand.high 'Alta' / 'High'
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

const ES_TITLE = 'Sugerencia de retriage'
const ES_ACCEPT = 'Aceptar'
const ES_DISMISS = 'Descartar'
const ES_ACCEPTED = 'Retriage aplicado.'
const ES_DISMISSED = 'Sugerencia descartada.'
const ES_NONE = 'No hay sugerencias de retriage abiertas.'
const ES_LOAD_ERROR = 'No se pudieron cargar las sugerencias.'
const ES_ACTION_ERROR = 'No se pudo completar la acción. Inténtalo de nuevo.'
const SUGGESTIONS_PATH = '/api/patients/PAT-001/suggestions'

// A high open suggestion: Triage III -> Triage I.
const OPEN_HIGH = {
  id: 7,
  severity: 'high',
  message: 'Risk is high. Suggest re-triage from Triage III to Triage I.',
  reason: 'respiratory_rate +3, spo2 +3, temperature +1',
  current_level: 3,
  suggested_level: 1,
  status: 'open',
  created_at: '2026-11-21T15:04:05.123456Z',
}

// Builds a suggestions handler: GET returns `list`; POST .../accept and .../dismiss return the
// acknowledged suggestion (or the given action response/error). Records the POSTs seen.
function suggestionsHandler({ list = [OPEN_HIGH], onAction } = {}) {
  return async (url, options = {}) => {
    const method = (options.method ?? 'GET').toUpperCase()
    if (method === 'GET') return jsonResponse({ suggestions: list })
    // POST .../accept or .../dismiss
    if (onAction) return onAction(url, options)
    const isAccept = new URL(url).pathname.endsWith('/accept')
    return jsonResponse({
      ...OPEN_HIGH,
      status: 'acknowledged',
      current_level: isAccept ? OPEN_HIGH.suggested_level : OPEN_HIGH.current_level,
    })
  }
}

async function openDetail(user, handlerOptions) {
  const fetchMock = stubBackend({
    me: async () => jsonResponse(user),
    suggestions: suggestionsHandler(handlerOptions),
  })
  signInForTest(user)
  renderApp(['/patients/PAT-001'])
  await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))
  // Wait for the suggestions fetch to resolve and the component to render.
  await waitFor(() => expect(callsTo(fetchMock, SUGGESTIONS_PATH).length).toBeGreaterThan(0))
  await act(async () => {})
  return fetchMock
}

function retriageCard() {
  // The component renders a Card with the retriage title heading; return that card element.
  return screen.getByRole('heading', { name: ES_TITLE }).closest('div')
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

// --- AC14 / AC16: doctor, open suggestion --------------------------------------

describe('US-04 AC14/AC16 doctor sees an open suggestion with actions', () => {
  it('AC14 the Card shows the band badge, current + suggested triage badges, severity and reason', async () => {
    await openDetail(DOCTOR)

    const card = retriageCard()
    expect(within(card).getByText(ES_TITLE)).toBeTruthy()
    // Band badge for the high band (derived from severity): label "Alta".
    expect(within(card).getByText('Alta')).toBeTruthy()
    // Current and suggested triage labels and their badges.
    expect(within(card).getByText('Nivel actual')).toBeTruthy()
    expect(within(card).getByText('Nivel sugerido')).toBeTruthy()
    expect(within(card).getByText('Triage III')).toBeTruthy()
    expect(within(card).getByText('Triage I')).toBeTruthy()
    // Severity label and the reason text, shown as given.
    expect(within(card).getByText('Severidad alta')).toBeTruthy()
    expect(within(card).getByText(OPEN_HIGH.reason)).toBeTruthy()
    // Doctor sees both action buttons.
    expect(within(card).getByRole('button', { name: ES_ACCEPT })).toBeTruthy()
    expect(within(card).getByRole('button', { name: ES_DISMISS })).toBeTruthy()
  })

  it('AC16 Accept sends the accept path and shows the applied message and the new level', async () => {
    const fetchMock = await openDetail(DOCTOR)

    fireEvent.click(screen.getByRole('button', { name: ES_ACCEPT }))

    expect(await screen.findByText(ES_ACCEPTED)).toBeTruthy()
    expect(callsTo(fetchMock, SUGGESTIONS_PATH + '/7/accept')).toHaveLength(1)
    // The new current level (Triage I) is shown with the result, inside the retriage card.
    const card = retriageCard()
    const result = within(card).getByRole('status')
    expect(within(result).getByText('Triage I')).toBeTruthy()
  })

  it('AC16 Dismiss sends the dismiss path and shows the dismissed message', async () => {
    const fetchMock = await openDetail(DOCTOR)

    fireEvent.click(screen.getByRole('button', { name: ES_DISMISS }))

    expect(await screen.findByText(ES_DISMISSED)).toBeTruthy()
    expect(callsTo(fetchMock, SUGGESTIONS_PATH + '/7/dismiss')).toHaveLength(1)
  })

  it('AC16 both buttons are disabled while an action is pending (one request on double click)', async () => {
    // A deferred accept response so the action stays pending while we click again.
    let resolve
    const pending = new Promise((r) => {
      resolve = r
    })
    const fetchMock = await openDetail(DOCTOR, {
      onAction: () => pending,
    })

    const acceptButton = screen.getByRole('button', { name: ES_ACCEPT })
    fireEvent.click(acceptButton)
    // Still pending: both buttons disabled.
    await waitFor(() => expect(acceptButton.disabled).toBe(true))
    expect(screen.getByRole('button', { name: ES_DISMISS }).disabled).toBe(true)
    // A second click sends no second request.
    fireEvent.click(acceptButton)
    fireEvent.click(screen.getByRole('button', { name: ES_DISMISS }))

    await act(async () => {
      resolve(jsonResponse({ ...OPEN_HIGH, status: 'acknowledged', current_level: 1 }))
      await pending
    })

    expect(callsTo(fetchMock, SUGGESTIONS_PATH + '/7/accept')).toHaveLength(1)
    expect(callsTo(fetchMock, SUGGESTIONS_PATH + '/7/dismiss')).toHaveLength(0)
    expect(await screen.findByText(ES_ACCEPTED)).toBeTruthy()
  })
})

// --- AC14: nurse, open suggestion (read-only) ----------------------------------

describe('US-04 AC14 nurse sees the suggestion read-only', () => {
  it('AC14 the same Card renders with no Accept/Dismiss buttons', async () => {
    await openDetail(NURSE)

    const card = retriageCard()
    expect(within(card).getByText('Severidad alta')).toBeTruthy()
    expect(within(card).getByText('Triage I')).toBeTruthy()
    expect(screen.queryByRole('button', { name: ES_ACCEPT })).toBeNull()
    expect(screen.queryByRole('button', { name: ES_DISMISS })).toBeNull()
  })
})

// --- AC15: no open suggestion --------------------------------------------------

describe('US-04 AC15 no open suggestion', () => {
  it('AC15 shows the "none" message and no buttons', async () => {
    await openDetail(DOCTOR, { list: [] })

    expect(screen.getByText(ES_NONE)).toBeTruthy()
    expect(screen.queryByRole('button', { name: ES_ACCEPT })).toBeNull()
    expect(screen.queryByRole('button', { name: ES_DISMISS })).toBeNull()
  })

  it('AC15 an acknowledged-only list shows the "none" message (only open suggestions are shown)', async () => {
    await openDetail(DOCTOR, { list: [{ ...OPEN_HIGH, status: 'acknowledged' }] })

    expect(screen.getByText(ES_NONE)).toBeTruthy()
    expect(screen.queryByRole('button', { name: ES_ACCEPT })).toBeNull()
  })
})

// --- AC17: failed action keeps the suggestion ----------------------------------

describe('US-04 AC17 failed action keeps the suggestion', () => {
  it.each([
    ['409', async () => jsonResponse({ detail: 'Suggestion already handled' }, 409)],
    ['500', async () => jsonResponse({ detail: 'Service unavailable' }, 500)],
    ['network', async () => {
      throw new TypeError('Failed to fetch')
    }],
  ])('AC17 a %s on accept shows the action error, keeps the suggestion, re-enables the buttons', async (_label, onAction) => {
    await openDetail(DOCTOR, { onAction })

    fireEvent.click(screen.getByRole('button', { name: ES_ACCEPT }))

    expect(await screen.findByText(ES_ACTION_ERROR)).toBeTruthy()
    // The suggestion is still shown and the buttons are usable again.
    expect(screen.getByText('Severidad alta')).toBeTruthy()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: ES_ACCEPT }).disabled).toBe(false),
    )
    expect(screen.getByRole('button', { name: ES_DISMISS }).disabled).toBe(false)
  })

  it('AC17 a 401 on accept sends the user to /login (session-expiry handling)', async () => {
    // The first /me (load check) succeeds; the accept returns 401 using the stored token, which
    // the API client turns into the session-expiry handling that redirects to /login.
    await openDetail(DOCTOR, {
      onAction: async () => jsonResponse({ detail: 'Not authenticated' }, 401),
    })

    fireEvent.click(screen.getByRole('button', { name: ES_ACCEPT }))

    await waitFor(() => expect(currentPath()).toBe('/login'))
  })

  it('AC17 a load error shows the load-error message and no buttons', async () => {
    // No suggestions handler given: the suggestions path answers 404, a load error.
    const fetchMock = stubBackend({ me: async () => jsonResponse(DOCTOR) })
    signInForTest(DOCTOR)
    renderApp(['/patients/PAT-001'])
    await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))

    expect(await screen.findByText(ES_LOAD_ERROR)).toBeTruthy()
    expect(screen.queryByText(ES_NONE)).toBeNull()
    expect(screen.queryByRole('button', { name: ES_ACCEPT })).toBeNull()
  })
})

// --- AC18: Spanish by default, English switch ----------------------------------

describe('US-04 AC18 language', () => {
  it('AC18 English texts appear after the language switch and the suggestion stays shown', async () => {
    await openDetail(DOCTOR)

    // Spanish first.
    expect(screen.getByRole('heading', { name: ES_TITLE })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    const card = screen.getByRole('heading', { name: 'Re-triage suggestion' }).closest('div')
    expect(within(card).getByText('Current level')).toBeTruthy()
    expect(within(card).getByText('Suggested level')).toBeTruthy()
    expect(within(card).getByText('High severity')).toBeTruthy()
    expect(within(card).getByText('High')).toBeTruthy()   // band badge in English
    expect(within(card).getByRole('button', { name: 'Accept' })).toBeTruthy()
    expect(within(card).getByRole('button', { name: 'Dismiss' })).toBeTruthy()
    // Spanish labels are gone.
    expect(screen.queryByText(ES_TITLE)).toBeNull()
  })

  it('AC18 switching language after an accept keeps the result shown, translated', async () => {
    await openDetail(DOCTOR)
    fireEvent.click(screen.getByRole('button', { name: ES_ACCEPT }))
    expect(await screen.findByText(ES_ACCEPTED)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    expect(screen.getByText('Re-triage applied.')).toBeTruthy()
    expect(screen.queryByText(ES_ACCEPTED)).toBeNull()
  })
})
