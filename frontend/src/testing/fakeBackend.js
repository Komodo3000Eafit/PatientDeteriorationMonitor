// Test helpers (TS-06): fetch mock routed by URL, and a signed-in session. Synthetic data only.
import { vi } from 'vitest'
import { clearSession, saveSession } from '../auth/session.js'

// Same shape as the TS-04 tests: what the API client reads from a fetch Response.
export function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

export const DOCTOR = { username: 'demo.doctor', full_name: 'Dra. Ana Demo', role: 'doctor' }
export const NURSE = { username: 'demo.nurse', full_name: 'Enf. Luis Demo', role: 'nurse' }

// Starts the test signed in. saveSession also sets the in-memory copy, so blocked storage still works.
export function signInForTest(user = DOCTOR, token = 'test-token') {
  saveSession({ token, user })
}

export function resetSession() {
  clearSession()
  try {
    sessionStorage.clear()
  } catch {
    // Storage blocked by a spy: the in-memory copy is already cleared.
  }
}

// Stubs the global fetch with a mock that answers by path. Each handler gets (url, options).
export function stubBackend({ health, me, login } = {}) {
  const routes = {
    '/health': health ?? (async () => jsonResponse({ status: 'ok', version: '0.1.0', database: 'ok' })),
    '/me': me ?? (async () => jsonResponse(DOCTOR)),
    '/auth/login':
      login ??
      (async () => jsonResponse({ access_token: 'test-token', token_type: 'bearer', expires_in: 28800 })),
  }
  const mock = vi.fn(async (url, options) => {
    const handler = routes[new URL(url).pathname]
    return handler ? handler(url, options) : jsonResponse({}, 404)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

// The calls of a fetch mock whose URL path equals path.
export function callsTo(mock, path) {
  return mock.mock.calls.filter(([url]) => new URL(url).pathname === path)
}
