// TS-04 start page tests: AC2, AC3, AC4, AC8 and FR-008, following
// specs/004-react-app-skeleton/contracts/health-ui.md. Synthetic responses only; fetch is mocked.
// TS-06 FR-018: every test starts signed in (synthetic session) and fetch is routed by path, so
// the start page behaves as before; /me answers with the synthetic doctor.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import App from './App.jsx'
import { callsTo, resetSession, signInForTest, stubBackend } from './testing/fakeBackend.js'

const CHECKING = 'Comprobando la conexión con el servidor…'
const UNREACHABLE = 'No se puede conectar con el servidor.'
const RELOAD_HINT = 'Recarga la página para volver a comprobar.'

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

beforeEach(() => signInForTest())

afterEach(resetSession)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('App start page', () => {
  it('AC2 shows checking first, then API ok, version and database available', async () => {
    const fetchMock = stubBackend({
      health: async () => jsonResponse({ status: 'ok', version: '0.1.0', database: 'ok' }),
    })

    render(<App />)
    expect(screen.getByText(CHECKING)).toBeTruthy()

    expect(await screen.findByText('API: funcionando')).toBeTruthy()
    expect(screen.getByText('Versión: 0.1.0')).toBeTruthy()
    expect(screen.getByText('Base de datos: disponible')).toBeTruthy()
    expect(screen.queryByText(CHECKING)).toBeNull()
    expect(callsTo(fetchMock, '/health')).toHaveLength(1)
  })

  it('AC3 shows database not available', async () => {
    stubBackend({
      health: async () => jsonResponse({ status: 'ok', version: '0.1.0', database: 'unavailable' }),
    })

    render(<App />)

    expect(await screen.findByText('Base de datos: no disponible')).toBeTruthy()
    expect(screen.getByText('API: funcionando')).toBeTruthy()
    expect(screen.getByText(RELOAD_HINT)).toBeTruthy()
  })

  it('edge case: unknown database value is shown as not available', async () => {
    stubBackend({
      health: async () => jsonResponse({ status: 'ok', version: '0.1.0', database: 'weird' }),
    })

    render(<App />)

    expect(await screen.findByText('Base de datos: no disponible')).toBeTruthy()
    expect(screen.queryByText('Base de datos: disponible')).toBeNull()
  })

  it('AC4 network error shows backend unreachable', async () => {
    stubBackend({
      health: async () => {
        throw new TypeError('Failed to fetch')
      },
    })

    render(<App />)

    expect(await screen.findByText(UNREACHABLE)).toBeTruthy()
    expect(screen.getByText(RELOAD_HINT)).toBeTruthy()
    expect(screen.queryByText(CHECKING)).toBeNull()
    // FR-008: the raw error text is never shown.
    expect(screen.queryByText(/Failed to fetch/)).toBeNull()
  })

  it('AC4 non-200 status shows backend unreachable', async () => {
    stubBackend({ health: async () => jsonResponse({}, 500) })

    render(<App />)

    expect(await screen.findByText(UNREACHABLE)).toBeTruthy()
    expect(screen.getByText(RELOAD_HINT)).toBeTruthy()
    expect(screen.queryByText('API: funcionando')).toBeNull()
  })

  it('AC4 unexpected body shows backend unreachable', async () => {
    stubBackend({ health: async () => jsonResponse({ foo: 'bar' }) })

    render(<App />)

    expect(await screen.findByText(UNREACHABLE)).toBeTruthy()
    // FR-008: the response body is never shown.
    expect(screen.queryByText(/\bfoo\b|\bbar\b/)).toBeNull()
  })

  it('AC4 timeout after 10 seconds shows backend unreachable', async () => {
    // Only the client's timer is faked; React's scheduler keeps working (research R5).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    stubBackend({
      health: (url, { signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    })

    render(<App />)
    expect(screen.getByText(CHECKING)).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9999)
    })
    expect(screen.getByText(CHECKING)).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(screen.getByText(UNREACHABLE)).toBeTruthy()
    expect(screen.queryByText(CHECKING)).toBeNull()
  })
})
