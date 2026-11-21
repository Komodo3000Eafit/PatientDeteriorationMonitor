// TS-13 client routing tests: AC1 to AC10 and the spec edge cases (FR-015, SC-001, SC-003),
// following specs/013-client-routing/contracts/routes.md. The app runs inside an in-memory router
// (renderApp); fetch is stubbed, no backend and no network. Synthetic codes (PAT-NNN) and demo
// users only.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor, act } from '@testing-library/react'
import { currentPath, renderApp } from './testing/renderApp.jsx'
import {
  DOCTOR,
  callsTo,
  jsonResponse,
  resetSession,
  signInForTest,
  stubBackend,
} from './testing/fakeBackend.js'

const ES_LOGIN = 'Iniciar sesión'
const ES_PATIENTS = 'Pacientes'
const ES_LIST_PLACEHOLDER = 'La lista de pacientes se mostrará aquí.'
const ES_DETAIL_PLACEHOLDER = 'El detalle del paciente se mostrará aquí.'
const ES_NOT_FOUND = 'Página no encontrada'
const ES_NOT_FOUND_MESSAGE = 'La dirección que abriste no existe en esta aplicación.'
const ES_BACK = 'Volver a la lista de pacientes'
const ES_EXPIRED = 'Tu sesión ha terminado. Inicia sesión de nuevo.'
const ES_SIGNED_IN = 'Sesión iniciada'

// US-05 replaced the detail-page placeholder with three loaded blocks. These route tests only
// prove the detail route is reached and renders the detail page (not the placeholder text, which
// no longer exists); they provide minimal patient / readings / triage-events handlers so the page
// can load. The route-ranking and redirect assertions are unchanged.
const ES_DETAIL_SECTION_PATIENT = 'Datos del paciente'
const EN_DETAIL_SECTION_PATIENT = 'Patient data'
const DETAIL_PATIENT = {
  identifier: 'PAT-001',
  name: 'Paciente de Prueba',
  age: 57,
  sex: 'male',
  triage_level: 3,
  status: 'active',
  admitted_at: '2026-11-19T08:15:00.000000Z',
  last_reading_at: null,
}
// A detail-page stub: a signed-in session plus the three read endpoints (no readings keeps it
// small; the triage history always has the initial event).
function detailHandlers() {
  return {
    patient: async () => jsonResponse(DETAIL_PATIENT),
    readings: async () => jsonResponse({ readings: [] }),
    triageEvents: async () =>
      jsonResponse({
        triage_events: [
          {
            occurred_at: '2026-11-19T08:15:00.000000Z',
            previous_level: null,
            new_level: 3,
            score: null,
            reason: 'Triage on admission',
            source: 'initial',
          },
        ],
      }),
  }
}

function loginHeading() {
  return screen.queryByRole('heading', { name: ES_LOGIN })
}

function signInThroughForm(username = 'demo.doctor', password = 'pw-123456') {
  fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: username } })
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
}

function expectNotFoundPage() {
  expect(screen.getByRole('heading', { level: 1, name: ES_NOT_FOUND })).toBeTruthy()
  expect(screen.getByText(ES_NOT_FOUND_MESSAGE)).toBeTruthy()
  const link = screen.getByRole('link', { name: ES_BACK })
  expect(link.getAttribute('href')).toBe('/patients')
}

// Records every text ever added to the page, so a test can prove that some content was never
// shown, not even for one render (AC3 "not even for an instant").
function watchAddedText() {
  const seen = []
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) seen.push(node.textContent ?? '')
      if (mutation.type === 'characterData') seen.push(mutation.target.textContent ?? '')
    }
  })
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  return {
    stop() {
      observer.takeRecords().forEach((mutation) => {
        for (const node of mutation.addedNodes) seen.push(node.textContent ?? '')
      })
      observer.disconnect()
      return seen.join('\n')
    },
  }
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

describe('TS-13 AC1 page addresses', () => {
  it('AC1 signed in /patients shows the patient list placeholder', async () => {
    stubBackend()
    signInForTest()
    renderApp(['/patients'])

    expect(currentPath()).toBe('/patients')
    expect(screen.getByRole('heading', { name: ES_PATIENTS })).toBeTruthy()
    expect(screen.getByText(ES_LIST_PLACEHOLDER)).toBeTruthy()
    // The TS-04 /health block stays on this placeholder (FR-004).
    expect(await screen.findByText('API: funcionando')).toBeTruthy()
  })

  it('AC1 signed in /patients/PAT-001 renders the detail route with the patient code in the h1', async () => {
    // US-05 replaced the placeholder with the loaded detail page; this stays a route-presence test.
    const fetchMock = stubBackend(detailHandlers())
    signInForTest()
    renderApp(['/patients/PAT-001'])
    await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))

    expect(currentPath()).toBe('/patients/PAT-001')
    expect(screen.getByRole('heading', { level: 1, name: 'Paciente PAT-001' })).toBeTruthy()
    // The detail page loaded its data (the patient data block appears), not the removed placeholder.
    expect(await screen.findByText(ES_DETAIL_SECTION_PATIENT)).toBeTruthy()
  })
})

describe('TS-13 AC2 root address', () => {
  it('AC2 signed in / ends on /patients', async () => {
    stubBackend()
    signInForTest()
    renderApp(['/'])

    expect(currentPath()).toBe('/patients')
    expect(await screen.findByText(ES_LIST_PLACEHOLDER)).toBeTruthy()
  })

  it('AC2 signed out / ends on /login', () => {
    stubBackend()
    renderApp(['/'])

    expect(currentPath()).toBe('/login')
    expect(loginHeading()).toBeTruthy()
  })

  it('AC2 the redirect from / is a replace: back does not return to /', async () => {
    stubBackend()
    signInForTest()
    renderApp(['/abc', '/'])
    expect(currentPath()).toBe('/patients')

    fireEvent.click(screen.getByTestId('go-back'))

    expect(currentPath()).toBe('/abc')
  })
})

describe('TS-13 AC3 signed-out user is sent to the login page', () => {
  it.each([
    ['/patients', ES_PATIENTS],
    ['/patients/PAT-001', 'Paciente PAT-001'],
  ])('AC3 signed out %s ends on /login with no clinical content', (path) => {
    const fetchMock = stubBackend()
    const watcher = watchAddedText()
    renderApp([path])
    const everShown = watcher.stop()

    expect(currentPath()).toBe('/login')
    expect(loginHeading()).toBeTruthy()
    expect(screen.queryByText(ES_PATIENTS)).toBeNull()
    expect(screen.queryByText('Paciente PAT-001')).toBeNull()
    expect(screen.queryByText('API: funcionando')).toBeNull()
    // SC-003: the clinical page never rendered, not even for one render (the watcher did record
    // the login page, so it works).
    expect(everShown).toContain(ES_LOGIN)
    expect(everShown).not.toContain(ES_LIST_PLACEHOLDER)
    expect(everShown).not.toContain(ES_DETAIL_PLACEHOLDER)
    expect(everShown).not.toContain('Paciente PAT-001')
    // The patient list's /health check never ran.
    expect(callsTo(fetchMock, '/health')).toHaveLength(0)
  })
})

describe('TS-13 AC4 return to the first page asked for', () => {
  it('AC4 signed out /patients/PAT-003, sign in, lands on /patients/PAT-003', async () => {
    stubBackend()
    renderApp(['/patients/PAT-003'])
    expect(currentPath()).toBe('/login')

    signInThroughForm()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Paciente PAT-003' }),
    ).toBeTruthy()
    expect(currentPath()).toBe('/patients/PAT-003')
  })

  it('AC4 signed out /login opened directly, sign in, lands on /patients', async () => {
    stubBackend()
    renderApp(['/login'])

    signInThroughForm()

    expect(await screen.findByText(ES_LIST_PLACEHOLDER)).toBeTruthy()
    expect(currentPath()).toBe('/patients')
  })
})

describe('TS-13 AC5 signed-in user opens the login page', () => {
  it('AC5 signed in /login ends on /patients with no login form', async () => {
    stubBackend()
    signInForTest()
    renderApp(['/login'])

    expect(currentPath()).toBe('/patients')
    expect(screen.queryByLabelText('Usuario')).toBeNull()
    expect(loginHeading()).toBeNull()
    expect(await screen.findByText(ES_LIST_PLACEHOLDER)).toBeTruthy()
  })
})

describe('TS-13 AC6 session expiry and logout', () => {
  it('AC6 session expires on /patients/PAT-002: /login with the message, then back to PAT-002', async () => {
    // The first /me (the load check with the stored token) answers 401; later ones succeed.
    let meCalls = 0
    stubBackend({
      me: async () => {
        meCalls += 1
        return meCalls === 1
          ? jsonResponse({ detail: 'Not authenticated' }, 401)
          : jsonResponse(DOCTOR)
      },
    })
    signInForTest()
    renderApp(['/patients/PAT-002'])

    expect(await screen.findByText(ES_EXPIRED)).toBeTruthy()
    expect(currentPath()).toBe('/login')
    expect(screen.queryByText('Paciente PAT-002')).toBeNull()

    signInThroughForm()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Paciente PAT-002' }),
    ).toBeTruthy()
    expect(currentPath()).toBe('/patients/PAT-002')
    expect(screen.queryByText(ES_EXPIRED)).toBeNull()
  })

  it('AC6 logout from /patients/PAT-002 ends on /login without the message; sign in lands on /patients', async () => {
    const fetchMock = stubBackend()
    signInForTest()
    renderApp(['/patients/PAT-002'])
    await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(currentPath()).toBe('/login')
    expect(loginHeading()).toBeTruthy()
    expect(screen.queryByText(ES_EXPIRED)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()

    // Edge case: the next user does not land on the previous user's page.
    signInThroughForm()

    expect(await screen.findByText(ES_LIST_PLACEHOLDER)).toBeTruthy()
    expect(currentPath()).toBe('/patients')
  })

  it('AC6 logout from the not-found page (/abc) ends on /login', async () => {
    const fetchMock = stubBackend()
    signInForTest()
    renderApp(['/abc'])
    await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))
    expectNotFoundPage()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(currentPath()).toBe('/login')
    expect(loginHeading()).toBeTruthy()
  })

  it('edge case: back after logout shows /login again, never the old clinical content', async () => {
    const fetchMock = stubBackend()
    signInForTest()
    renderApp(['/patients', '/patients/PAT-002'])
    await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(currentPath()).toBe('/login')

    fireEvent.click(screen.getByTestId('go-back'))

    expect(currentPath()).toBe('/login')
    expect(loginHeading()).toBeTruthy()
    expect(screen.queryByText(ES_LIST_PLACEHOLDER)).toBeNull()
    expect(screen.queryByText('Paciente PAT-002')).toBeNull()
  })
})

describe('TS-13 AC7 not-found page', () => {
  it.each([
    '/abc',
    '/patients/PAT-001/extra',
    '/login/x',
    '/api/patients',
    '/health',
    '/patients/pat-001',
    '/patients/PAT%20001',
    '/patients/%3Cscript%3E',
  ])('AC7 signed in %s shows the not-found page', async (path) => {
    const fetchMock = stubBackend()
    signInForTest()
    expect(() => renderApp([path])).not.toThrow()
    await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))

    expectNotFoundPage()
    expect(currentPath()).toBe(path)
    // The address text is never shown as markup (edge case: invalid patient code).
    expect(document.querySelector('script')).toBeNull()
  })

  it('AC7 signed out /abc shows the not-found page', () => {
    stubBackend()
    expect(() => renderApp(['/abc'])).not.toThrow()

    expectNotFoundPage()
    expect(currentPath()).toBe('/abc')
  })
})

describe('TS-13 edge case: trailing slash', () => {
  it('edge case: /patients/ shows the patient list', async () => {
    stubBackend()
    signInForTest()
    renderApp(['/patients/'])

    expect(screen.getByText(ES_LIST_PLACEHOLDER)).toBeTruthy()
    expect(await screen.findByText('API: funcionando')).toBeTruthy()
  })

  it('edge case: /patients/PAT-001/ shows the patient detail', async () => {
    const fetchMock = stubBackend(detailHandlers())
    signInForTest()
    renderApp(['/patients/PAT-001/'])
    await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))

    expect(screen.getByRole('heading', { level: 1, name: 'Paciente PAT-001' })).toBeTruthy()
    // The detail page rendered (not the not-found page).
    expect(await screen.findByText(ES_DETAIL_SECTION_PATIENT)).toBeTruthy()
    expect(screen.queryByText(ES_NOT_FOUND)).toBeNull()
  })
})

describe('TS-13 AC8 page frame on every page', () => {
  it.each([
    { path: '/login', signedIn: false },
    { path: '/abc', signedIn: false },
    { path: '/patients', signedIn: true },
    { path: '/patients/PAT-001', signedIn: true },
    { path: '/abc', signedIn: true },
  ])('AC8 $path (signed in: $signedIn) has the disclaimer, ES/EN switch and user block only when signed in', async ({ path, signedIn }) => {
    const fetchMock = stubBackend()
    if (signedIn) signInForTest()
    renderApp([path])
    if (signedIn) await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))

    expect(currentPath()).toBe(path)
    expect(screen.getByRole('note')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Español' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'English' })).toBeTruthy()
    const userBlock = screen.queryByRole('group', { name: ES_SIGNED_IN })
    if (signedIn) {
      expect(userBlock).toBeTruthy()
      expect(screen.getByText(DOCTOR.full_name)).toBeTruthy()
    } else {
      expect(userBlock).toBeNull()
    }
  })
})

describe('TS-13 AC9 language', () => {
  it('AC9 /patients in English, address unchanged', async () => {
    stubBackend()
    signInForTest()
    renderApp(['/patients'])
    await screen.findByText('API: funcionando')

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    expect(screen.getByRole('heading', { name: 'Patients' })).toBeTruthy()
    expect(screen.getByText('The patient list will be shown here.')).toBeTruthy()
    expect(screen.queryByText(ES_LIST_PLACEHOLDER)).toBeNull()
    expect(currentPath()).toBe('/patients')
  })

  it('AC9 /patients/PAT-001 in English, address unchanged', async () => {
    const fetchMock = stubBackend(detailHandlers())
    signInForTest()
    renderApp(['/patients/PAT-001'])
    await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))
    // Wait for the detail page to load before switching language.
    await screen.findByText(ES_DETAIL_SECTION_PATIENT)

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Patient PAT-001' })).toBeTruthy()
    // A stable English label on the loaded page (the placeholder text was removed in US-05).
    expect(screen.getByText(EN_DETAIL_SECTION_PATIENT)).toBeTruthy()
    expect(screen.queryByText(ES_DETAIL_SECTION_PATIENT)).toBeNull()
    expect(currentPath()).toBe('/patients/PAT-001')
  })

  it('AC9 /abc in English, address unchanged', async () => {
    const fetchMock = stubBackend()
    signInForTest()
    renderApp(['/abc'])
    await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy()
    expect(screen.getByText('The address you opened does not exist in this app.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to the patient list' })).toBeTruthy()
    expect(screen.queryByText(ES_NOT_FOUND)).toBeNull()
    expect(currentPath()).toBe('/abc')
  })
})

describe('TS-13 AC10 browser navigation', () => {
  it('AC10 the detail page link goes to /patients; back (navigate -1) shows /patients, still signed in', async () => {
    const fetchMock = stubBackend()
    signInForTest()
    const first = renderApp(['/patients', '/patients/PAT-001'])
    await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))
    expect(currentPath()).toBe('/patients/PAT-001')

    fireEvent.click(screen.getByRole('link', { name: ES_BACK }))

    expect(currentPath()).toBe('/patients')
    expect(screen.getByText(ES_LIST_PLACEHOLDER)).toBeTruthy()
    await screen.findByText('API: funcionando')
    first.unmount()

    // Start again on the detail page and use the history back step.
    const healthBefore = callsTo(fetchMock, '/health').length
    renderApp(['/patients', '/patients/PAT-001'])
    expect(currentPath()).toBe('/patients/PAT-001')

    fireEvent.click(screen.getByTestId('go-back'))

    expect(currentPath()).toBe('/patients')
    expect(screen.getByText(ES_LIST_PLACEHOLDER)).toBeTruthy()
    expect(screen.getByText(DOCTOR.full_name)).toBeTruthy()
    expect(screen.getByRole('group', { name: ES_SIGNED_IN })).toBeTruthy()
    expect(loginHeading()).toBeNull()
    await act(async () => {})
    expect(callsTo(fetchMock, '/health').length).toBe(healthBefore + 1)
  })
})

describe('US-01 AC13 /patients/new ranks above /patients/:identifier', () => {
  // Replaces the TS-13 edge case that showed the not-found page before US-01 (tasks.md T009).
  // Verifies react-router's route ranking: the fixed route wins over the dynamic one (D-45).
  it('AC13 signed in /patients/new shows the registration page, not the detail or not-found page', async () => {
    const fetchMock = stubBackend()
    signInForTest()
    renderApp(['/patients/new'])
    await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))

    expect(currentPath()).toBe('/patients/new')
    expect(screen.getByRole('heading', { level: 1, name: 'Registrar paciente' })).toBeTruthy()
    expect(screen.queryByText(ES_NOT_FOUND)).toBeNull()
    expect(screen.queryByText(ES_NOT_FOUND_MESSAGE)).toBeNull()
    expect(screen.queryByText(ES_DETAIL_PLACEHOLDER)).toBeNull()
    expect(screen.queryByText('Paciente new')).toBeNull()
  })
})

describe('US-03 AC18 /patients/:identifier/readings/new address ranking', () => {
  const ES_READING_TITLE = 'Registrar signos vitales · PAT-001'

  it('AC18 signed in /patients/PAT-001/readings/new shows the entry page, not detail or not-found', async () => {
    const fetchMock = stubBackend()
    signInForTest()
    renderApp(['/patients/PAT-001/readings/new'])
    await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))

    expect(currentPath()).toBe('/patients/PAT-001/readings/new')
    expect(screen.getByRole('heading', { level: 1, name: ES_READING_TITLE })).toBeTruthy()
    expect(screen.queryByText(ES_NOT_FOUND)).toBeNull()
    expect(screen.queryByText(ES_NOT_FOUND_MESSAGE)).toBeNull()
    expect(screen.queryByText(ES_DETAIL_PLACEHOLDER)).toBeNull()
    expect(screen.queryByText('Paciente PAT-001')).toBeNull()
  })

  it.each(['/patients/bad%20code/readings/new', '/patients/pat-001/readings/new'])(
    'AC18 signed in %s (invalid patient code) shows the not-found page',
    async (path) => {
      const fetchMock = stubBackend()
      signInForTest()
      renderApp([path])
      await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))

      expectNotFoundPage()
      expect(currentPath()).toBe(path)
      expect(screen.queryByText(/Registrar signos vitales/)).toBeNull()
    },
  )

  it('AC18 /patients/PAT-001 still shows the detail page', async () => {
    const fetchMock = stubBackend(detailHandlers())
    signInForTest()
    renderApp(['/patients/PAT-001'])
    await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))

    expect(screen.getByRole('heading', { level: 1, name: 'Paciente PAT-001' })).toBeTruthy()
    // The detail page rendered (not the not-found page).
    expect(await screen.findByText(ES_DETAIL_SECTION_PATIENT)).toBeTruthy()
    expect(screen.queryByText(ES_NOT_FOUND)).toBeNull()
  })

  it('AC18 /patients/new still shows the registration page', async () => {
    const fetchMock = stubBackend()
    signInForTest()
    renderApp(['/patients/new'])
    await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))

    expect(screen.getByRole('heading', { level: 1, name: 'Registrar paciente' })).toBeTruthy()
    expect(screen.queryByText(ES_NOT_FOUND)).toBeNull()
  })
})
