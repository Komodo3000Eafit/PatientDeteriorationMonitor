// Alert acknowledgement component tests (US-07): AC11-AC15, following
// specs/023-alert-acknowledgement/contracts/ui.md and contracts/alert-ack-api.md. The component is
// rendered on its own inside the real LanguageProvider and AuthProvider (signed in), with a
// test-only language switch and a location probe; fetch is stubbed (stubBackend with the alertAck
// handler, dispatching on method and path), no backend and no network. One page-level test renders
// the whole app at /patients/PAT-001 (renderApp). Synthetic data only (PAT-NNN codes, made-up
// clinician names, made-up times).
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
  callsTo,
  jsonResponse,
  resetSession,
  signInForTest,
  stubBackend,
} from '../../testing/fakeBackend.js'
import AlertAcknowledgement from './AlertAcknowledgement.jsx'

const ACK_PATH = '/api/patients/PAT-001/alerts/acknowledgement'
const ALERT_ID = 42
const SEEN_PATH = `/api/patients/PAT-001/alerts/${ALERT_ID}/seen`
const START_PATH = '/patients/PAT-001'

const ES_TITLE = 'Seguimiento de la sugerencia'
const ES_MARK_SEEN = 'Marcar como visto'
const ES_HANDLED = 'Atendida'
const ES_ALREADY_HANDLED = 'Esta sugerencia ya fue vista o atendida.'
const ES_LOAD_ERROR = 'No se pudo cargar el seguimiento de la sugerencia.'
const ES_MARK_ERROR = 'No se pudo marcar como visto. Intente de nuevo.'
const ES_RECORD_BUTTON = 'Registrar signos vitales'
const LANG_BUTTON = 'test-english'

// Every fixed text the component may show; none may appear while loading or on 404 / 401.
const ALL_COMPONENT_TEXTS = [
  ES_TITLE,
  ES_MARK_SEEN,
  ES_HANDLED,
  ES_ALREADY_HANDLED,
  ES_LOAD_ERROR,
  ES_MARK_ERROR,
]

// Synthetic clinicians (same shape as fakeBackend's DOCTOR / NURSE).
const NURSE_LAURA = { username: 'laura.gomez', full_name: 'Laura Gómez', role: 'nurse' }
const DOCTOR_ANDRES = { username: 'andres.ruiz', full_name: 'Dr. Andrés Ruiz', role: 'doctor' }

const SEEN_AT = '2026-11-23T10:12:00Z'
const HANDLED_AT = '2026-11-23T11:30:00Z'

// Contract answers (contracts/alert-ack-api.md).
const NO_ALERT = { alert: null }
const NOT_SEEN = { alert: { id: ALERT_ID, status: 'open', state: 'not_seen', by: null, at: null } }
const SEEN_BY_LAURA = {
  alert: { id: ALERT_ID, status: 'open', state: 'seen', by: 'Laura Gómez', at: SEEN_AT },
}
const SEEN_BY_MARTA = {
  alert: { id: ALERT_ID, status: 'open', state: 'seen', by: 'Marta Ríos', at: SEEN_AT },
}
const HANDLED_BY_ANDRES = {
  alert: {
    id: ALERT_ID,
    status: 'acknowledged',
    state: 'handled',
    by: 'Dr. Andrés Ruiz',
    at: HANDLED_AT,
  },
}
const HANDLED_NO_PERSON = {
  alert: { id: ALERT_ID, status: 'acknowledged', state: 'handled', by: null, at: null },
}

const esTime = (at) => new Date(at).toLocaleString('es')
const enTime = (at) => new Date(at).toLocaleString('en')

// Builds an alertAck handler: GET answers come from `get` (a function called with the 1-based GET
// count, or a fixed response function), POST answers from `post`.
function ackHandler({ get = async () => jsonResponse(NOT_SEEN), post } = {}) {
  let gets = 0
  return (url, options = {}) => {
    const method = (options.method ?? 'GET').toUpperCase()
    const path = new URL(url).pathname
    if (method === 'GET' && path === ACK_PATH) {
      gets += 1
      return get(url, options, gets)
    }
    if (method === 'POST' && post) return post(url, options)
    return jsonResponse({}, 404)
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

// Prints the current path so a test can check the component never navigates.
function LocationProbe() {
  const location = useLocation()
  return <output data-testid="ack-location">{location.pathname}</output>
}

// Signs in, renders the component alone with the given alertAck handler, and waits for the first
// GET to be sent. Returns { fetchMock, container }.
async function renderComponent(alertAck, user = NURSE_LAURA) {
  const fetchMock = stubBackend({ me: async () => jsonResponse(user), alertAck })
  signInForTest(user)
  const { container } = render(
    <MemoryRouter initialEntries={[START_PATH]}>
      <LanguageProvider>
        <AuthProvider>
          <EnglishButton />
          <LocationProbe />
          <div data-testid="ack-root">
            <AlertAcknowledgement identifier="PAT-001" />
          </div>
        </AuthProvider>
      </LanguageProvider>
    </MemoryRouter>,
  )
  await waitFor(() => expect(callsTo(fetchMock, ACK_PATH).length).toBeGreaterThan(0))
  await act(async () => {})
  return { fetchMock, container }
}

// The component's own rendered element (excludes the language button and the location probe).
function root() {
  return screen.getByTestId('ack-root')
}

function componentText() {
  return root().textContent
}

function expectNothingFromComponent() {
  expect(componentText().trim()).toBe('')
  for (const text of ALL_COMPONENT_TEXTS) {
    expect(screen.queryByText(text)).toBeNull()
  }
  expect(root().querySelector('svg')).toBeNull()
  expect(screen.queryByRole('button', { name: ES_MARK_SEEN })).toBeNull()
}

function expectAriaHiddenIcon() {
  const icons = [...root().querySelectorAll('svg')]
  expect(icons.length).toBeGreaterThan(0)
  for (const svg of icons) expect(svg.getAttribute('aria-hidden')).toBe('true')
}

function postCalls(fetchMock) {
  return callsTo(fetchMock, SEEN_PATH).filter(
    ([, options]) => (options?.method ?? 'GET').toUpperCase() === 'POST',
  )
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

// --- AC14: loading, 404 and 401 render nothing -------------------------------------

describe('US-07 AC14 nothing before the first successful answer', () => {
  it('AC14 while the GET is pending nothing is rendered (no title, button, line or icon)', async () => {
    const { fetchMock } = await renderComponent(ackHandler({ get: () => new Promise(() => {}) }))

    expect(callsTo(fetchMock, ACK_PATH)).toHaveLength(1)
    const [, options] = callsTo(fetchMock, ACK_PATH)[0]
    expect((options?.method ?? 'GET').toUpperCase()).toBe('GET')
    expectNothingFromComponent()
  })

  it('AC14 a GET 404 renders nothing (the page shows its own not-found card)', async () => {
    await renderComponent(
      ackHandler({ get: async () => jsonResponse({ detail: 'Patient not found' }, 404) }),
    )
    await act(async () => {})

    expectNothingFromComponent()
    expect(document.body.textContent).not.toContain('Patient not found')
  })

  it('AC14 a GET 401 shows nothing from the component and the session-expiry handling clears the session', async () => {
    await renderComponent(
      ackHandler({ get: async () => jsonResponse({ detail: 'Not authenticated' }, 401) }),
    )
    await act(async () => {})

    expectNothingFromComponent()
    expect(document.body.textContent).not.toContain('Not authenticated')
    expect(getSession()).toBeNull()
  })
})

// --- AC11: no alert, not seen -----------------------------------------------------

describe('US-07 AC11 no alert, or open and not seen', () => {
  it('AC11 {"alert": null} renders nothing', async () => {
    await renderComponent(ackHandler({ get: async () => jsonResponse(NO_ALERT) }))
    await act(async () => {})

    expectNothingFromComponent()
  })

  it('AC11 not_seen + nurse shows the title and the "Marcar como visto" button', async () => {
    await renderComponent(ackHandler({ get: async () => jsonResponse(NOT_SEEN) }), NURSE_LAURA)

    const button = await screen.findByRole('button', { name: ES_MARK_SEEN })
    expect(button.disabled).toBe(false)
    expect(screen.getByText(ES_TITLE)).toBeTruthy()
    expect(componentText()).not.toContain('Visto por')
    expect(componentText()).not.toContain('Atendida')
  })

  it('AC11 not_seen + doctor shows no button and no seen/handled line', async () => {
    await renderComponent(ackHandler({ get: async () => jsonResponse(NOT_SEEN) }), DOCTOR_ANDRES)
    await act(async () => {})

    expect(screen.queryByRole('button', { name: ES_MARK_SEEN })).toBeNull()
    expect(componentText()).not.toContain('Visto por')
    expect(componentText()).not.toContain('Atendida')
    expectNothingFromComponent()
  })
})

// --- AC12: seen and handled lines --------------------------------------------------

describe('US-07 AC12 seen and handled lines', () => {
  it.each([
    ['nurse', NURSE_LAURA],
    ['doctor', DOCTOR_ANDRES],
  ])('AC12 seen (%s) shows "Visto por Laura Gómez, <local time>" with an aria-hidden icon and no button', async (_label, user) => {
    await renderComponent(ackHandler({ get: async () => jsonResponse(SEEN_BY_LAURA) }), user)

    const expected = `Visto por Laura Gómez, ${esTime(SEEN_AT)}`
    await waitFor(() => expect(componentText()).toContain(expected))
    expectAriaHiddenIcon()
    expect(screen.queryByRole('button', { name: ES_MARK_SEEN })).toBeNull()
  })

  it.each([
    ['nurse', NURSE_LAURA],
    ['doctor', DOCTOR_ANDRES],
  ])('AC12 handled (%s) shows "Atendida por Dr. Andrés Ruiz, <local time>" with an aria-hidden icon and no button', async (_label, user) => {
    await renderComponent(ackHandler({ get: async () => jsonResponse(HANDLED_BY_ANDRES) }), user)

    const expected = `Atendida por Dr. Andrés Ruiz, ${esTime(HANDLED_AT)}`
    await waitFor(() => expect(componentText()).toContain(expected))
    expectAriaHiddenIcon()
    expect(screen.queryByRole('button', { name: ES_MARK_SEEN })).toBeNull()
  })

  it('AC12 (edge case) handled with by: null shows "Atendida" alone, with an icon, never an error', async () => {
    await renderComponent(ackHandler({ get: async () => jsonResponse(HANDLED_NO_PERSON) }))

    expect(await screen.findByText(ES_HANDLED)).toBeTruthy()
    expect(componentText()).not.toContain('Atendida por')
    expect(componentText()).not.toContain('null')
    expect(componentText()).not.toContain('Invalid Date')
    expectAriaHiddenIcon()
    expect(screen.queryByText(ES_LOAD_ERROR)).toBeNull()
  })
})

// --- AC13: the nurse clicks --------------------------------------------------------

describe('US-07 AC13 after the nurse clicks', () => {
  it('AC13 one POST to .../alerts/42/seen, button disabled while pending, then the seen line with no new GET and no navigation', async () => {
    let resolvePost
    const { fetchMock } = await renderComponent(
      ackHandler({
        get: async () => jsonResponse(NOT_SEEN),
        post: () =>
          new Promise((resolve) => {
            resolvePost = resolve
          }),
      }),
    )
    const button = await screen.findByRole('button', { name: ES_MARK_SEEN })
    const getsBefore = callsTo(fetchMock, ACK_PATH).length

    fireEvent.click(button)
    await waitFor(() => expect(postCalls(fetchMock)).toHaveLength(1))
    // Pending: the button cannot be clicked twice.
    expect(screen.getByRole('button', { name: ES_MARK_SEEN }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: ES_MARK_SEEN }))
    await act(async () => {})
    expect(postCalls(fetchMock)).toHaveLength(1)
    // No request body.
    const [, options] = postCalls(fetchMock)[0]
    expect(options.body).toBeUndefined()

    await act(async () => {
      resolvePost(jsonResponse(SEEN_BY_LAURA))
    })

    const expected = `Visto por Laura Gómez, ${esTime(SEEN_AT)}`
    await waitFor(() => expect(componentText()).toContain(expected))
    expect(screen.queryByRole('button', { name: ES_MARK_SEEN })).toBeNull()
    expectAriaHiddenIcon()
    expect(callsTo(fetchMock, ACK_PATH)).toHaveLength(getsBefore)
    expect(postCalls(fetchMock)).toHaveLength(1)
    expect(screen.getByTestId('ack-location').textContent).toBe(START_PATH)
  })

  it('AC13 a POST 409 shows the fixed "already handled" message, runs a second GET and shows its answer', async () => {
    const { fetchMock } = await renderComponent(
      ackHandler({
        get: async (_url, _options, count) =>
          jsonResponse(count === 1 ? NOT_SEEN : SEEN_BY_MARTA),
        post: async () => jsonResponse({ detail: 'Alert already handled' }, 409),
      }),
    )
    fireEvent.click(await screen.findByRole('button', { name: ES_MARK_SEEN }))

    const message = await screen.findByRole('alert')
    expect(message.textContent).toBe(ES_ALREADY_HANDLED)
    await waitFor(() => expect(callsTo(fetchMock, ACK_PATH)).toHaveLength(2))
    const expected = `Visto por Marta Ríos, ${esTime(SEEN_AT)}`
    await waitFor(() => expect(componentText()).toContain(expected))
    expect(screen.getByText(ES_ALREADY_HANDLED)).toBeTruthy()
    expect(document.body.textContent).not.toContain('Alert already handled')
    expect(postCalls(fetchMock)).toHaveLength(1)
  })

  it('AC13 (contracts/ui.md click flow step 3) after a 409 the role=alert message comes before the reloaded seen line in document order', async () => {
    await renderComponent(
      ackHandler({
        get: async (_url, _options, count) =>
          jsonResponse(count === 1 ? NOT_SEEN : SEEN_BY_MARTA),
        post: async () => jsonResponse({ detail: 'Alert already handled' }, 409),
      }),
    )
    fireEvent.click(await screen.findByRole('button', { name: ES_MARK_SEEN }))

    const message = await screen.findByRole('alert')
    const expected = `Visto por Marta Ríos, ${esTime(SEEN_AT)}`
    // Innermost element whose own text holds the seen line.
    const seenLine = await screen.findByText(
      (_content, element) =>
        element !== null &&
        element.textContent.includes(expected) &&
        Array.from(element.children).every((child) => !child.textContent.includes(expected)),
    )
    expect(message.contains(seenLine)).toBe(false)
    expect(
      message.compareDocumentPosition(seenLine) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})

// --- AC14: mark and load failures --------------------------------------------------

describe('US-07 AC14 failures show fixed texts', () => {
  it('AC14 a POST 503 shows the fixed mark-error text, never the server text, and the button is enabled again', async () => {
    const { fetchMock } = await renderComponent(
      ackHandler({ post: async () => jsonResponse({ detail: 'Service unavailable' }, 503) }),
    )
    fireEvent.click(await screen.findByRole('button', { name: ES_MARK_SEEN }))

    const message = await screen.findByRole('alert')
    expect(message.textContent).toBe(ES_MARK_ERROR)
    expect(document.body.textContent).not.toContain('Service unavailable')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: ES_MARK_SEEN }).disabled).toBe(false),
    )
    expect(postCalls(fetchMock)).toHaveLength(1)
  })

  it('AC14 a POST network failure shows the fixed mark-error text, never the raw error, and the button is enabled again', async () => {
    await renderComponent(
      ackHandler({ post: async () => Promise.reject(new TypeError('Failed to fetch')) }),
    )
    fireEvent.click(await screen.findByRole('button', { name: ES_MARK_SEEN }))

    const message = await screen.findByRole('alert')
    expect(message.textContent).toBe(ES_MARK_ERROR)
    expect(document.body.textContent).not.toContain('Failed to fetch')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: ES_MARK_SEEN }).disabled).toBe(false),
    )
  })

  it('AC14 a POST timeout (client aborts after REQUEST_TIMEOUT_MS) shows the fixed mark-error text and the button is enabled again', async () => {
    const { fetchMock } = await renderComponent(
      ackHandler({
        post: (_url, { signal }) =>
          new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
          }),
      }),
    )
    const button = await screen.findByRole('button', { name: ES_MARK_SEEN })
    // Only the client's timer is faked; React's scheduler keeps working (App.test.jsx pattern).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    await act(async () => {
      fireEvent.click(button)
    })
    expect(postCalls(fetchMock)).toHaveLength(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1)
    })
    expect(screen.getByRole('button', { name: ES_MARK_SEEN }).disabled).toBe(true)
    expect(screen.queryByText(ES_MARK_ERROR)).toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(screen.getByRole('alert').textContent).toBe(ES_MARK_ERROR)
    expect(document.body.textContent).not.toContain('Aborted')
    expect(screen.getByRole('button', { name: ES_MARK_SEEN }).disabled).toBe(false)
  })

  it('AC14 a GET 503 shows the fixed load-error text, never the server text', async () => {
    await renderComponent(
      ackHandler({ get: async () => jsonResponse({ detail: 'Service unavailable' }, 503) }),
    )

    expect(await screen.findByText(ES_LOAD_ERROR)).toBeTruthy()
    expect(document.body.textContent).not.toContain('Service unavailable')
    expect(screen.queryByRole('button', { name: ES_MARK_SEEN })).toBeNull()
  })
})

// --- AC15: language ------------------------------------------------------------------

describe('US-07 AC15 Spanish by default, English switch', () => {
  it('AC15 after switching to English the seen line reads "Seen by Laura Gómez, <local time>" with no new request', async () => {
    const { fetchMock } = await renderComponent(
      ackHandler({ get: async () => jsonResponse(SEEN_BY_LAURA) }),
    )
    await waitFor(() =>
      expect(componentText()).toContain(`Visto por Laura Gómez, ${esTime(SEEN_AT)}`),
    )
    const requestsBefore = fetchMock.mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: LANG_BUTTON }))

    await waitFor(() =>
      expect(componentText()).toContain(`Seen by Laura Gómez, ${enTime(SEEN_AT)}`),
    )
    expect(componentText()).not.toContain('Visto por')
    expect(fetchMock.mock.calls.length).toBe(requestsBefore)
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
      me: async () => jsonResponse(NURSE_LAURA),
      patient: async () => jsonResponse(PATIENT),
      readings: async () => jsonResponse({ readings: [] }),
      triageEvents: async () => jsonResponse({ triage_events: [] }),
      alertAck: async () => jsonResponse({ detail: 'Service unavailable' }, 503),
    })
    signInForTest(NURSE_LAURA)
    renderApp([START_PATH])
    await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))
    await act(async () => {})

    expect(await screen.findByText(PATIENT.name)).toBeTruthy()
    expect(screen.getByRole('button', { name: ES_RECORD_BUTTON })).toBeTruthy()
    expect(await screen.findByText(ES_LOAD_ERROR)).toBeTruthy()
    expect(document.body.textContent).not.toContain('Service unavailable')
    expect(callsTo(fetchMock, ACK_PATH)).toHaveLength(1)
  })
})
