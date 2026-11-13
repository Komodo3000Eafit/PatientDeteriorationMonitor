// TS-04 API client tests: AC5 and FR-004 (one shared client, base URL configured only here).
// The test run sets no VITE_API_BASE_URL, so the local default applies. fetch is mocked.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { API_BASE_URL, REQUEST_TIMEOUT_MS, apiGet, getHealth } from './client.js'

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('api client', () => {
  it('AC5 default base URL is http://localhost:8000', () => {
    expect(API_BASE_URL).toBe('http://localhost:8000')
  })

  it('AC4 request timeout is 10000 ms', () => {
    expect(REQUEST_TIMEOUT_MS).toBe(10000)
  })

  it('AC5 getHealth calls fetch once with the base URL + /health and an AbortSignal', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ status: 'ok', version: '0.1.0', database: 'ok' }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const health = await getHealth()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:8000/health')
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(health).toEqual({ status: 'ok', version: '0.1.0', database: 'ok' })
  })

  it('FR-004 apiGet returns the parsed JSON for a 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ value: 42 })))

    await expect(apiGet('/anything')).resolves.toEqual({ value: 42 })
  })

  it('FR-004 apiGet throws for a 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ detail: 'Not Found' }, 404)))

    await expect(apiGet('/missing')).rejects.toThrow()
  })
})
