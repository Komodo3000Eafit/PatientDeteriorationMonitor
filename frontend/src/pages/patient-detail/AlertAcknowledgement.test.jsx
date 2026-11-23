// Alert acknowledgement component tests (US-07): AC11-AC15, following
// specs/023-alert-acknowledgement/contracts/ui.md (task T006). The component is rendered on its own
// inside the real LanguageProvider and AuthProvider (signed in as a nurse or a doctor), with a
// test-only language switch and a location probe; fetch is stubbed (stubBackend with the alertAck
// handler, dispatching on method), no backend and no network. One page-level test renders the whole
// app at /patients/PAT-001 (renderApp). Synthetic data only (PAT-NNN codes, demo users, made-up names).
//
// Exact texts copied from frontend/src/i18n/translations.js:
//   alertAck.title          'Seguimiento de la sugerencia' / 'Suggestion follow-up'
//   alertAck.markSeen       'Marcar como visto' / 'Mark as seen'
//   alertAck.seenBy         'Visto por {name}, {time}' / 'Seen by {name}, {time}'
//   alertAck.handledBy      'Atendida por {name}, {time}' / 'Handled by {name}, {time}'
//   alertAck.handled        'Atendida' / 'Handled'
//   alertAck.alreadyHandled 'Esta sugerencia ya fue vista o atendida.'
//   alertAck.loadError      'No se pudo cargar el seguimiento de la sugerencia.'
//   alertAck.markError      'No se pudo marcar como visto. Intente de nuevo.'
//   recordReading.button    'Registrar signos vitales'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
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
import AlertAcknowledgement from './AlertAcknowledgement.jsx'

const ACK_PATH = '/api/patients/PAT-001/alerts/acknowledgement'
const ALERT_ID = 41
const SEEN_PATH = `/api/patients/PAT-001/alerts/${ALERT_ID}/seen`

const ES_TITLE = 'Seguimiento de la sugerencia'
const ES_MARK_SEEN = 'Marcar como visto'
const ES_HANDLED = 'Atendida'
const ES_ALREADY_HANDLED = 'Esta sugerencia ya fue vista o atendida.'
const ES_LOAD_ERROR = 'No se pudo cargar el seguimiento de la sugerencia.'
const ES_MARK_ERROR = 'No se pudo marcar como visto. Intente de nuevo.'
const ES_RECORD_BUTTON = 'Registrar signos vitales'
const LANG_BUTTON = 'test-english'
const START_PATH = '/patients/PAT-001'

// Every fixed text the component may show; none may appear while loading or on 404 / 401.
const ALL_COMPONENT_TEXTS = [
  ES_TITLE,
  ES_MARK_SEEN,
  ES_HANDLED,
  ES_ALREADY_HANDLED,
  ES_LOAD_ERROR,
  ES_MARK_ERROR,
]

// Synthetic people and times (contracts/alert-ack-api.md answer shape).
const SEEN_AT = '2026-11-23T08:10:00.000000Z'
const HANDLED_AT = '2026-11-23T09:20:00.000000Z'
const MARKED_AT = '2026-11-23T10:05:00.000000Z'
const SEEN_NAME = 'Laura Gómez'
const HANDLER_NAME = 'Dr. Mateo Ríos'

const NOT_SEEN = { alert: { id: ALERT_ID, status: 'open', state: 'not_seen', by: null, at: null } }
const SEEN = { alert: { id: ALERT_ID, status: 'open', state: 'seen', by: SEEN_NAME, at: SEEN_AT } }
const HANDLED = {
  alert: { id: ALERT_ID, status: 'acknowledged', state: 'handled', by: HANDLER_NAME, at: HANDLED_AT },
}
const HANDLED_NO_BY = {
  alert: { id: ALERT_ID, status: 'acknowledged', state: 'handled', by: null, at: HANDLED_AT },
}
const MARKED_BY_ME = {
  alert: { id: ALERT_ID, status: 'open', state: 'seen', by: NURSE.full_name, at: MARKED_AT },
}

const esTime = (at) => new Date(at).toLocaleString('es')
const enTime = (at) => new Date(at).toLocaleString('en')

function isPost(options) {
  return (options?.method ?? 'GET').toUpperCase() === 'POST'
}

// Builds an alertAck handler: GET answers come from `gets` (one per call, the last one repeats);
// POST calls the `post` function.
function ackHandler({ gets, post }) {
  let getCount = 0
  return (url, options) => {
    if (isPost(options)) {
      return post ? post(url, options) : jsonResponse({}, 404)
    }
    const answer = gets[Math.min(getCount, gets.length - 1)]
    getCount += 1
    return typeof answer === 'function' ? answer(url, options) : jsonResponse(answer)
  }
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

// Shows the current router path, to check that nothing navigates.
function PathProbe() {
  const location = useLocation()
  return <output data-testid="path-probe">{location.pathname}</output>
}

// Signs in, renders the component alone with the given alertAck handler, and waits for the
// acknowledgement GET to be sent. Returns { fetchMock, container }.
async function renderComponent(alertAck, user = NURSE) {
  const fetchMock = stubBackend({ me: async () => jsonResponse(user), alertAck })
  signInForTest(user)
  const { container } = render(
    <MemoryRouter initialEntries={[START_PATH]}>
      <LanguageProvider>
        <AuthProvider>
          <EnglishButton />
          <PathProbe />
          <AlertAcknowledgement identifier="PAT-001" />
        </AuthProvider>
      </LanguageProvider>
    </MemoryRouter>,
  )
  await waitFor(() => expect(callsTo(fetchMock, ACK_PATH).length).toBeGreaterThan(0))
  await act(async () => {})
  return { fetchMock, container }
}

// The component's own text: everything rendered except the test-only button and probe.
function componentText(container) {
  return container.textContent.replace(LANG_BUTTON, '').replace(START_PATH, '')
}

function expectNothingFromComponent(container) {
  expect(componentText(container).trim()).toBe('')
  for (const text of ALL_COMPONENT_TEXTS) {
    expect(screen.queryByText(text)).toBeNull()
  }
  expect(screen.queryByRole('button', { name: ES_MARK_SEEN })).toBeNull()
  expect(container.querySelector('svg')).toBeNull()
}

function expectDecorativeIcon(container) {
  const icons = [...container.querySelectorAll('svg')]
  expect(icons.length).toBeGreaterThan(0)
  for (const svg of icons) expect(svg.getAttribute('aria-hidden')).toBe('true')
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

// --- AC14: loading, 404, 401 ---------------------------------------------------------

describe('US-07 AC14 loading, not found and session expiry render nothing', () => {
  it('AC14 while the GET is pending nothing is rendered', async () => {
    const { container, fetchMock } = await renderComponent(() => new Promise(() => {}))

    expect(callsTo(fetchMock, ACK_PATH)).toHaveLength(1)
    const [, options] = callsTo(fetchMock, ACK_PATH)[0]
    expect((options?.method ?? 'GET').toUpperCase()).toBe('GET')
    expectNothingFromComponent(container)
  })

  it('AC14 a GET 404 renders nothing (no note, no error line)', async () => {
    const { container } = await renderComponent(async () =>
      jsonResponse({ detail: 'Patient not found' }, 404),
    )
    await act(async () => {})

    expectNothingFromComponent(container)
    expect(document.body.textContent).not.toContain('Patient not found')
  })

  it('AC14 a GET 401 shows nothing from the component and the session-expiry handling clears the session', async () => {
    const { container } = await renderComponent(async () =>
      jsonResponse({ detail: 'Not authenticated' }, 401),
    )
    await act(async () => {})

    expectNothingFromComponent(container)
    expect(document.body.textContent).not.toContain('Not authenticated')
    expect(getSession()).toBeNull()
  })
})

// --- AC11: no alert, not seen ----------------------------------------------------------

describe('US-07 AC11 no alert, or open and not seen', () => {
  it('AC11 {"alert": null} renders nothing', async () => {
    const { container } = await renderComponent(ackHandler({ gets: [{ alert: null }] }))
    await act(async () => {})

    expectNothingFromComponent(container)
  })

  it('AC11 not_seen + nurse shows the title and the "Marcar como visto" button', async () => {
    await renderComponent(ackHandler({ gets: [NOT_SEEN] }), NURSE)

    const button = await screen.findByRole('button', { name: ES_MARK_SEEN })
    expect(button.disabled).toBe(false)
    expect(screen.getByText(ES_TITLE)).toBeTruthy()
    expect(screen.queryByText(/Visto por/)).toBeNull()
    expect(screen.queryByText(/Atendida/)).toBeNull()
  })

  it('AC11 not_seen + doctor shows no button and no line', async () => {
    const { container } = await renderComponent(ackHandler({ gets: [NOT_SEEN] }), DOCTOR)
    await act(async () => {})

    expectNothingFromComponent(container)
  })
})

// --- AC12: seen and handled lines ------------------------------------------------------

describe('US-07 AC12 seen and handled lines', () => {
  it.each([
    ['nurse', NURSE],
    ['doctor', DOCTOR],
  ])('AC12 seen shows "Visto por Laura Gómez, <local time>" with an aria-hidden icon (%s)', async (_l, user) => {
    const { container } = await renderComponent(ackHandler({ gets: [SEEN] }), user)

    expect(await screen.findByText(`Visto por ${SEEN_NAME}, ${esTime(SEEN_AT)}`)).toBeTruthy()
    expectDecorativeIcon(container)
    expect(screen.queryByRole('button', { name: ES_MARK_SEEN })).toBeNull()
  })

  it.each([
    ['nurse', NURSE],
    ['doctor', DOCTOR],
  ])('AC12 handled shows "Atendida por <name>, <local time>" with an aria-hidden icon (%s)', async (_l, user) => {
    const { container } = await renderComponent(ackHandler({ gets: [HANDLED] }), user)

    expect(
      await screen.findByText(`Atendida por ${HANDLER_NAME}, ${esTime(HANDLED_AT)}`),
    ).toBeTruthy()
    expectDecorativeIcon(container)
    expect(screen.queryByRole('button', { name: ES_MARK_SEEN })).toBeNull()
  })

  it('AC12 (edge case) handled with by: null shows "Atendida" with an icon', async () => {
    const { container } = await renderComponent(ackHandler({ gets: [HANDLED_NO_BY] }))

    expect(await screen.findByText(ES_HANDLED)).toBeTruthy()
    expect(screen.queryByText(/Atendida por/)).toBeNull()
    expect(componentText(container)).not.toContain('null')
    expectDecorativeIcon(container)
  })
})

// --- AC13: click flow ---------------------------------------------------------------

describe('US-07 AC13 the nurse clicks "Marcar como visto"', () => {
  it('AC13 one POST to .../alerts/<id>/seen, button disabled while pending, then the seen line with no new GET and no navigation', async () => {
    let resolvePost
    const { fetchMock } = await renderComponent(
      ackHandler({
        gets: [NOT_SEEN],
        post: () =>
          new Promise((resolve) => {
            resolvePost = resolve
          }),
      }),
    )
    const button = await screen.findByRole('button', { name: ES_MARK_SEEN })

    fireEvent.click(button)
    await waitFor(() => expect(button.disabled).toBe(true))
    // A second click while pending sends nothing more.
    fireEvent.click(button)
    expect(callsTo(fetchMock, SEEN_PATH)).toHaveLength(1)
    const [, options] = callsTo(fetchMock, SEEN_PATH)[0]
    expect(isPost(options)).toBe(true)

    await act(async () => {
      resolvePost(jsonResponse(MARKED_BY_ME))
    })

    expect(
      await screen.findByText(`Visto por ${NURSE.full_name}, ${esTime(MARKED_AT)}`),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: ES_MARK_SEEN })).toBeNull()
    expect(callsTo(fetchMock, SEEN_PATH)).toHaveLength(1)
    expect(callsTo(fetchMock, ACK_PATH)).toHaveLength(1)
    expect(screen.getByTestId('path-probe').textContent).toBe(START_PATH)
  })

  it('AC13 a POST 409 shows the fixed already-handled text, then a second GET runs and its answer is shown', async () => {
    const { fetchMock } = await renderComponent(
      ackHandler({
        gets: [NOT_SEEN, SEEN],
        post: async () => jsonResponse({ detail: 'Alert already handled' }, 409),
      }),
    )
    fireEvent.click(await screen.findByRole('button', { name: ES_MARK_SEEN }))

    const message = await screen.findByText(ES_ALREADY_HANDLED)
    expect(message.closest('[role="alert"]')).toBeTruthy()
    await waitFor(() => expect(callsTo(fetchMock, ACK_PATH)).toHaveLength(2))
    expect(await screen.findByText(`Visto por ${SEEN_NAME}, ${esTime(SEEN_AT)}`)).toBeTruthy()
    expect(document.body.textContent).not.toContain('Alert already handled')
    expect(callsTo(fetchMock, SEEN_PATH)).toHaveLength(1)
  })
})

// --- AC14: marking and loading failures -------------------------------------------------

describe('US-07 AC14 failures show fixed texts', () => {
  it.each([
    ['503', async () => jsonResponse({ detail: 'Service unavailable' }, 503), 'Service unavailable'],
    ['network failure', async () => Promise.reject(new TypeError('Failed to fetch')), 'Failed to fetch'],
  ])('AC14 a POST %s shows the fixed mark-error text, never the server text, and re-enables the button', async (_l, post, raw) => {
    const { fetchMock } = await renderComponent(ackHandler({ gets: [NOT_SEEN], post }))
    fireEvent.click(await screen.findByRole('button', { name: ES_MARK_SEEN }))

    const message = await screen.findByText(ES_MARK_ERROR)
    expect(message.closest('[role="alert"]')).toBeTruthy()
    expect(document.body.textContent).not.toContain(raw)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: ES_MARK_SEEN }).disabled).toBe(false),
    )
    expect(callsTo(fetchMock, SEEN_PATH)).toHaveLength(1)
  })

  it('AC14 a POST timeout (client aborts after REQUEST_TIMEOUT_MS) shows the fixed mark-error text and re-enables the button', async () => {
    const { fetchMock } = await renderComponent(
      ackHandler({
        gets: [NOT_SEEN],
        post: (url, { signal }) =>
          new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
          }),
      }),
    )
    const button = await screen.findByRole('button', { name: ES_MARK_SEEN })

    // Only the client's timer is faked, after the GET has settled (App.test.jsx pattern).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await act(async () => {
      fireEvent.click(button)
    })
    expect(callsTo(fetchMock, SEEN_PATH)).toHaveLength(1)
    expect(screen.getByRole('button', { name: ES_MARK_SEEN }).disabled).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
    })
    expect(screen.getByText(ES_MARK_ERROR)).toBeTruthy()
    expect(document.body.textContent).not.toContain('Aborted')
    expect(screen.getByRole('button', { name: ES_MARK_SEEN }).disabled).toBe(false)
  })

  it('AC14 a GET 503 shows the fixed load-error text, never the server text', async () => {
    await renderComponent(async () => jsonResponse({ detail: 'Service unavailable' }, 503))

    expect(await screen.findByText(ES_LOAD_ERROR)).toBeTruthy()
    expect(document.body.textContent).not.toContain('Service unavailable')
    expect(screen.queryByRole('button', { name: ES_MARK_SEEN })).toBeNull()
  })
})

// --- AC15: language ------------------------------------------------------------------

describe('US-07 AC15 Spanish by default, English switch', () => {
  it('AC15 after switching to English the seen line reads "Seen by ..." with no new request', async () => {
    const { fetchMock } = await renderComponent(ackHandler({ gets: [SEEN] }))
    expect(await screen.findByText(`Visto por ${SEEN_NAME}, ${esTime(SEEN_AT)}`)).toBeTruthy()
    const before = fetchMock.mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: LANG_BUTTON }))

    expect(screen.getByText(`Seen by ${SEEN_NAME}, ${enTime(SEEN_AT)}`)).toBeTruthy()
    expect(screen.queryByText(/Visto por/)).toBeNull()
    expect(fetchMock.mock.calls.length).toBe(before)
    expect(callsTo(fetchMock, ACK_PATH)).toHaveLength(1)
  })
})

// --- AC14 page level: the rest of the detail page keeps working ------------------------

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

describe('US-07 AC14 page level', () => {
  it('AC14 on the detail page an acknowledgement 503 shows the load-error text while the patient data and record-reading button still render', async () => {
    const fetchMock = stubBackend({
      me: async () => jsonResponse(NURSE),
      patient: async () => jsonResponse(PATIENT),
      readings: async () => jsonResponse({ readings: [] }),
      triageEvents: async () => jsonResponse({ triage_events: [] }),
      alertAck: async () => jsonResponse({ detail: 'Service unavailable' }, 503),
    })
    signInForTest(NURSE)
    renderApp(['/patients/PAT-001'])
    await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))
    await act(async () => {})

    expect(await screen.findByText(PATIENT.name)).toBeTruthy()
    expect(screen.getByRole('button', { name: ES_RECORD_BUTTON })).toBeTruthy()
    expect(await screen.findByText(ES_LOAD_ERROR)).toBeTruthy()
    expect(callsTo(fetchMock, ACK_PATH)).toHaveLength(1)
  })
})
