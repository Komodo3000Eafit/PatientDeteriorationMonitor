// TS-04 API client tests: AC5 and FR-004 (one shared client, base URL configured only here).
// The test run sets no VITE_API_BASE_URL, so the local default applies. fetch is mocked.
import { describe, it, expect, vi, afterEach } from 'vitest'
// TS-06 tests (FR-012, AC9, contracts/auth-ui.md "API client"): the token goes only in the
// Authorization header, and a 401 on a request that used the stored token signs out.
import {
  API_BASE_URL,
  REQUEST_TIMEOUT_MS,
  ApiError,
  apiGet,
  apiPost,
  getHealth,
  getMe,
  login,
  onUnauthorized,
} from './client.js'
import { getSession } from '../auth/session.js'
import { DOCTOR, callsTo, resetSession, signInForTest, stubBackend } from '../testing/fakeBackend.js'

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

afterEach(resetSession)

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

describe('TS-06 api client sign-in', () => {
  it('TS-06 FR-012 no Authorization header without a session', async () => {
    const fetchMock = stubBackend()

    await getHealth()

    const [, options] = fetchMock.mock.calls[0]
    expect(options.headers.Authorization).toBeUndefined()
  })

  it('TS-06 FR-012 apiGet adds the stored token', async () => {
    signInForTest()
    const fetchMock = stubBackend()

    await apiGet('/health')

    const [url, options] = fetchMock.mock.calls[0]
    expect(options.method).toBe('GET')
    expect(options.headers.Authorization).toBe('Bearer test-token')
    expect(url).toBe('http://localhost:8000/health')
    expect(url).not.toContain('test-token')
  })

  it('TS-06 apiPost sends JSON', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ done: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiPost('/anything', { a: 1 })).resolves.toEqual({ done: true })

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:8000/anything')
    expect(options.method).toBe('POST')
    expect(options.headers['Content-Type']).toBe('application/json')
    expect(options.body).toBe(JSON.stringify({ a: 1 }))
  })

  it('TS-06 login sends credentials without Authorization', async () => {
    const fetchMock = stubBackend()

    const result = await login('demo.doctor', 'pw-123456')

    expect(result.access_token).toBe('test-token')
    const calls = callsTo(fetchMock, '/auth/login')
    expect(calls).toHaveLength(1)
    const [url, options] = calls[0]
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ username: 'demo.doctor', password: 'pw-123456' })
    expect(options.headers.Authorization).toBeUndefined()
    expect(url).not.toContain('pw-123456')
  })

  it('TS-06 getMe(token) uses the given token', async () => {
    signInForTest(DOCTOR, 'stored-token')
    const fetchMock = stubBackend()

    await expect(getMe('given-token')).resolves.toEqual(DOCTOR)

    const [url, options] = callsTo(fetchMock, '/me')[0]
    expect(options.method).toBe('GET')
    expect(options.headers.Authorization).toBe('Bearer given-token')
    expect(url).toBe('http://localhost:8000/me')
  })

  it('TS-06 AC9 401 with the stored token clears the session and calls the handler', async () => {
    const spy = vi.fn()
    const unsubscribe = onUnauthorized(spy)
    signInForTest()
    stubBackend({ me: async () => jsonResponse({ detail: 'Not authenticated' }, 401) })

    try {
      const error = await getMe().catch((err) => err)
      expect(error).toBeInstanceOf(ApiError)
      expect(error.status).toBe(401)
      expect(getSession()).toBeNull()
      expect(spy).toHaveBeenCalledTimes(1)
    } finally {
      unsubscribe()
    }
  })

  it('TS-06 login 401 does not call the handler', async () => {
    const spy = vi.fn()
    const unsubscribe = onUnauthorized(spy)
    stubBackend({
      login: async () => jsonResponse({ detail: 'Incorrect username or password' }, 401),
    })

    try {
      const error = await login('demo.doctor', 'wrong-pass').catch((err) => err)
      expect(error).toBeInstanceOf(ApiError)
      expect(error.status).toBe(401)
      expect(spy).not.toHaveBeenCalled()
    } finally {
      unsubscribe()
    }
  })

  it('TS-06 ApiError message has no response text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ detail: 'secret detail text' }, 500)))

    const error = await apiGet('/anything').catch((err) => err)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.message).toBe('HTTP 500')
    expect(error.status).toBe(500)
  })

  it('TS-06 onUnauthorized returns an unsubscribe function', async () => {
    const spy = vi.fn()
    const unsubscribe = onUnauthorized(spy)
    expect(typeof unsubscribe).toBe('function')
    unsubscribe()

    signInForTest()
    stubBackend({ me: async () => jsonResponse({}, 401) })
    await expect(getMe()).rejects.toBeInstanceOf(ApiError)

    expect(spy).not.toHaveBeenCalled()
    expect(getSession()).toBeNull()
  })
})
