// TS-06 sign-in tests: AC7, AC8, AC9 and FR-011 to FR-014, following
// specs/006-authentication/contracts/auth-ui.md (../../../specs/006-authentication/contracts/auth-ui.md).
// Synthetic users and tokens only; fetch is stubbed, no backend and no network.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import App from '../App.jsx'
import {
  DOCTOR,
  NURSE,
  callsTo,
  jsonResponse,
  resetSession,
  signInForTest,
  stubBackend,
} from '../testing/fakeBackend.js'

const ES_BANNER = 'Prototipo académico: no es un dispositivo médico certificado.'
const ES_TITLE = 'Monitor de Deterioro del Paciente'
const ES_LOGIN = 'Iniciar sesión'
const ES_INVALID = 'Usuario o contraseña incorrectos.'
const EN_INVALID = 'Incorrect username or password.'
const ES_UNREACHABLE = 'No se puede conectar con el servidor. Inténtalo de nuevo.'
const EN_UNREACHABLE = 'Cannot connect to the server. Please try again.'
const ES_EXPIRED = 'Tu sesión ha terminado. Inicia sesión de nuevo.'
const EN_EXPIRED = 'Your session has ended. Please sign in again.'

function englishButton() {
  return screen.getByRole('button', { name: 'English' })
}

function loginHeading(name = ES_LOGIN) {
  return screen.queryByRole('heading', { name })
}

function fillAndSubmit(username = 'demo.doctor', password = 'pw-123456') {
  fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: username } })
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
}

function storedSession() {
  return sessionStorage.getItem('pdm.session')
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

describe('TS-06 sign-in', () => {
  it('AC7 signed out shows the login page and no clinical content', () => {
    const fetchMock = stubBackend()
    render(<App />)

    expect(loginHeading()).toBeTruthy()
    expect(screen.getByRole('heading', { name: ES_TITLE })).toBeTruthy()
    expect(screen.getByText(ES_BANNER)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Español' })).toBeTruthy()
    expect(englishButton()).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).toBeNull()
    expect(screen.queryByText('API: funcionando')).toBeNull()
    // FR-011: no backend call until the user submits.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('AC7 login page in English', () => {
    stubBackend()
    render(<App />)

    fireEvent.click(englishButton())

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(screen.getByLabelText('Username')).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })

  it('AC8 successful sign-in as the doctor', async () => {
    const fetchMock = stubBackend()
    render(<App />)

    fillAndSubmit('demo.doctor', 'pw-123456')

    expect(await screen.findByText('API: funcionando')).toBeTruthy()

    const loginCalls = callsTo(fetchMock, '/auth/login')
    expect(loginCalls).toHaveLength(1)
    const [, loginOptions] = loginCalls[0]
    expect(loginOptions.method).toBe('POST')
    expect(loginOptions.body).toBe('{"username":"demo.doctor","password":"pw-123456"}')
    expect(loginOptions.headers.Authorization).toBeUndefined()

    const meCalls = callsTo(fetchMock, '/me')
    expect(meCalls).toHaveLength(1)
    expect(meCalls[0][1].headers.Authorization).toBe('Bearer test-token')
    // /me comes after the login call.
    expect(fetchMock.mock.calls.findIndex(([url]) => url.endsWith('/me'))).toBeGreaterThan(
      fetchMock.mock.calls.findIndex(([url]) => url.endsWith('/auth/login')),
    )

    expect(screen.getByText('Dra. Ana Demo')).toBeTruthy()
    expect(screen.getByText('Médico')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Sesión iniciada' })).toBeTruthy()
    expect(loginHeading()).toBeNull()
    expect(callsTo(fetchMock, '/health')).toHaveLength(1)
    expect(JSON.parse(storedSession())).toEqual({ token: 'test-token', user: DOCTOR })

    fireEvent.click(englishButton())

    expect(screen.getByText('Doctor')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
  })

  it('AC8 nurse role is translated', async () => {
    stubBackend({ me: async () => jsonResponse(NURSE) })
    render(<App />)

    fillAndSubmit('demo.nurse', 'pw-nurse-1')

    expect(await screen.findByText('Enf. Luis Demo')).toBeTruthy()
    expect(screen.getByText('Enfermero(a)')).toBeTruthy()

    fireEvent.click(englishButton())

    expect(screen.getByText('Nurse')).toBeTruthy()
  })

  it('AC8 wrong credentials', async () => {
    stubBackend({
      login: async () => jsonResponse({ detail: 'Incorrect username or password' }, 401),
    })
    render(<App />)

    fillAndSubmit('demo.doctor', 'wrong-pass')

    expect((await screen.findByRole('alert')).textContent).toBe(ES_INVALID)
    expect(screen.getByLabelText('Usuario').value).toBe('demo.doctor')
    expect(screen.getByLabelText('Contraseña').value).toBe('')
    expect(storedSession()).toBeNull()

    fireEvent.click(englishButton())

    expect(screen.getByRole('alert').textContent).toBe(EN_INVALID)
    expect(screen.getByLabelText('Username').value).toBe('demo.doctor')
  })

  it.each([
    {
      name: 'network error',
      login: async () => {
        throw new TypeError('Failed to fetch')
      },
    },
    { name: 'status 503', login: async () => jsonResponse({ detail: 'Service unavailable' }, 503) },
  ])('AC8 server unreachable ($name)', async ({ login }) => {
    stubBackend({ login })
    render(<App />)

    fillAndSubmit()

    expect((await screen.findByRole('alert')).textContent).toBe(ES_UNREACHABLE)
    // Both fields are kept; the raw error is never shown.
    expect(screen.getByLabelText('Usuario').value).toBe('demo.doctor')
    expect(screen.getByLabelText('Contraseña').value).toBe('pw-123456')
    expect(screen.queryByText(/Failed to fetch|Service unavailable/)).toBeNull()

    fireEvent.click(englishButton())

    expect(screen.getByRole('alert').textContent).toBe(EN_UNREACHABLE)
  })

  it.each([
    { name: '/me returns 401', me: async () => jsonResponse({ detail: 'Not authenticated' }, 401) },
    {
      name: '/me rejects',
      me: async () => {
        throw new TypeError('Failed to fetch')
      },
    },
  ])('edge case: login ok but /me fails shows cannot connect ($name)', async ({ me }) => {
    const fetchMock = stubBackend({ me })
    render(<App />)

    fillAndSubmit()

    expect((await screen.findByRole('alert')).textContent).toBe(ES_UNREACHABLE)
    expect(screen.queryByText(ES_INVALID)).toBeNull()
    expect(storedSession()).toBeNull()
    expect(loginHeading()).toBeTruthy()
    expect(callsTo(fetchMock, '/health')).toHaveLength(0)
  })

  it('edge case: double submit sends one request', async () => {
    const fetchMock = stubBackend({ login: () => new Promise(() => {}) })
    render(<App />)

    fillAndSubmit()
    const button = screen.getByRole('button', { name: 'Entrando…' })
    fireEvent.click(button)
    fireEvent.submit(button.closest('form'))

    expect(button.disabled).toBe(true)
    expect(callsTo(fetchMock, '/auth/login')).toHaveLength(1)
  })

  it('AC9 logout', async () => {
    const fetchMock = stubBackend()
    signInForTest()
    render(<App />)
    await screen.findByText('API: funcionando')

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(loginHeading()).toBeTruthy()
    expect(storedSession()).toBeNull()
    expect(screen.queryByText(ES_EXPIRED)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText('Dra. Ana Demo')).toBeNull()
    expect(screen.queryByText('API: funcionando')).toBeNull()
    // Logout is client-side only: no backend call.
    expect(callsTo(fetchMock, '/auth/login')).toHaveLength(0)
  })

  it('AC9 logout keeps English', async () => {
    stubBackend()
    signInForTest()
    render(<App />)
    await screen.findByText('API: funcionando')
    fireEvent.click(englishButton())

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(document.documentElement.lang).toBe('en')
    expect(screen.queryByText(EN_EXPIRED)).toBeNull()
  })

  it('AC9 reload keeps the session', async () => {
    const fetchMock = stubBackend()
    signInForTest()
    render(<App />)

    expect(screen.getByText('Dra. Ana Demo')).toBeTruthy()
    expect(loginHeading()).toBeNull()

    await waitFor(() => expect(callsTo(fetchMock, '/me')).toHaveLength(1))
    expect(callsTo(fetchMock, '/me')[0][1].headers.Authorization).toBe('Bearer test-token')
    expect(await screen.findByText('API: funcionando')).toBeTruthy()
    expect(callsTo(fetchMock, '/me')).toHaveLength(1)
  })

  it('AC9 stored session rejected shows session expired', async () => {
    stubBackend({ me: async () => jsonResponse({ detail: 'Not authenticated' }, 401) })
    signInForTest()
    render(<App />)

    expect(await screen.findByText(ES_EXPIRED)).toBeTruthy()
    expect(loginHeading()).toBeTruthy()
    expect(storedSession()).toBeNull()
    expect(screen.queryByText('Dra. Ana Demo')).toBeNull()

    fireEvent.click(englishButton())

    expect(screen.getByText(EN_EXPIRED)).toBeTruthy()
  })

  it('edge case: corrupted stored session is signed out', () => {
    const fetchMock = stubBackend()
    sessionStorage.setItem('pdm.session', '{bad')
    render(<App />)

    expect(loginHeading()).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText(ES_EXPIRED)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('edge case: blocked storage still signs in', async () => {
    for (const method of ['getItem', 'setItem', 'removeItem']) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new Error('blocked')
      })
    }
    stubBackend()

    expect(() => render(<App />)).not.toThrow()
    expect(loginHeading()).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()

    fillAndSubmit()

    expect(await screen.findByText('Dra. Ana Demo')).toBeTruthy()
    expect(await screen.findByText('API: funcionando')).toBeTruthy()
  })

  it('edge case: network error on the /me check keeps the user', async () => {
    const fetchMock = stubBackend({
      me: async () => {
        throw new TypeError('Failed to fetch')
      },
    })
    signInForTest()
    render(<App />)

    await waitFor(() => expect(callsTo(fetchMock, '/me')).toHaveLength(1))
    await act(async () => {})

    expect(screen.getByText('Dra. Ana Demo')).toBeTruthy()
    expect(loginHeading()).toBeNull()
    expect(screen.queryByText(ES_EXPIRED)).toBeNull()
    expect(JSON.parse(storedSession())).toEqual({ token: 'test-token', user: DOCTOR })
  })
})
