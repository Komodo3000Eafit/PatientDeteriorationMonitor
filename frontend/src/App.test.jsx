// TS-04 start page tests: AC2, AC3, AC4, AC8 and FR-008, following
// specs/004-react-app-skeleton/contracts/health-ui.md. Synthetic responses only; fetch is mocked.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import App from './App.jsx'

const CHECKING = 'Comprobando la conexión con el servidor…'
const UNREACHABLE = 'No se puede conectar con el servidor.'
const RELOAD_HINT = 'Recarga la página para volver a comprobar.'

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('App start page', () => {
  it('AC2 shows checking first, then API ok, version and database available', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ status: 'ok', version: '0.1.0', database: 'ok' }),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    expect(screen.getByText(CHECKING)).toBeTruthy()

    expect(await screen.findByText('API: funcionando')).toBeTruthy()
    expect(screen.getByText('Versión: 0.1.0')).toBeTruthy()
    expect(screen.getByText('Base de datos: disponible')).toBeTruthy()
    expect(screen.queryByText(CHECKING)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('AC3 shows database not available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ status: 'ok', version: '0.1.0', database: 'unavailable' })),
    )

    render(<App />)

    expect(await screen.findByText('Base de datos: no disponible')).toBeTruthy()
    expect(screen.getByText('API: funcionando')).toBeTruthy()
    expect(screen.getByText(RELOAD_HINT)).toBeTruthy()
  })

  it('edge case: unknown database value is shown as not available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ status: 'ok', version: '0.1.0', database: 'weird' })),
    )

    render(<App />)

    expect(await screen.findByText('Base de datos: no disponible')).toBeTruthy()
    expect(screen.queryByText('Base de datos: disponible')).toBeNull()
  })

  it('AC4 network error shows backend unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )

    render(<App />)

    expect(await screen.findByText(UNREACHABLE)).toBeTruthy()
    expect(screen.getByText(RELOAD_HINT)).toBeTruthy()
    expect(screen.queryByText(CHECKING)).toBeNull()
    // FR-008: the raw error text is never shown.
    expect(screen.queryByText(/Failed to fetch/)).toBeNull()
  })

  it('AC4 non-200 status shows backend unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 500)))

    render(<App />)

    expect(await screen.findByText(UNREACHABLE)).toBeTruthy()
    expect(screen.getByText(RELOAD_HINT)).toBeTruthy()
    expect(screen.queryByText('API: funcionando')).toBeNull()
  })

  it('AC4 unexpected body shows backend unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ foo: 'bar' })))

    render(<App />)

    expect(await screen.findByText(UNREACHABLE)).toBeTruthy()
    // FR-008: the response body is never shown.
    expect(screen.queryByText(/\bfoo\b|\bbar\b/)).toBeNull()
  })

  it('AC4 timeout after 10 seconds shows backend unreachable', async () => {
    // Only the client's timer is faked; React's scheduler keeps working (research R5).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (url, { signal }) =>
          new Promise((_, reject) => {
            signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            )
          }),
      ),
    )

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
