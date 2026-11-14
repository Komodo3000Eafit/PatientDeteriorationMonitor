// Shared API client (TS-04, sign-in from TS-06). Every screen calls the backend through this module;
// the base URL is configured only here. When a session exists, the token is sent only in the
// Authorization header (never in the URL, never in a cookie).
import { clearSession, getSession } from '../auth/session.js'

// Backend base URL from VITE_API_BASE_URL (trimmed, no trailing slash), or the local default.
export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '') || 'http://localhost:8000'

// A request that takes longer than this is aborted and treated as a failure.
export const REQUEST_TIMEOUT_MS = 10000

// Non-2xx answer from the backend. The message never includes the response text.
export class ApiError extends Error {
  constructor(status) {
    super(`HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
  }
}

// The one handler called when a request that used the stored token gets a 401.
let unauthorizedHandler = null

// Registers the 401 handler; returns a function that removes it.
export function onUnauthorized(handler) {
  unauthorizedHandler = handler
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null
  }
}

// Sends one request and returns the parsed JSON. Uses options.token, or the stored session's
// token. Throws ApiError on a non-2xx status; network errors, timeouts and invalid JSON are
// thrown as they are.
async function request(method, path, { body, token } = {}) {
  const stored = getSession()?.token
  const usedStoredToken = !token && !!stored
  const bearer = token ?? stored

  const headers = {}
  if (bearer) headers.Authorization = `Bearer ${bearer}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(API_BASE_URL + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    if (response.status === 401 && usedStoredToken) {
      clearSession()
      unauthorizedHandler?.()
    }
    if (!response.ok) throw new ApiError(response.status)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

// GET a backend path and return the parsed JSON.
export async function apiGet(path, options) {
  return request('GET', path, options)
}

// POST a JSON body to a backend path and return the parsed JSON.
export async function apiPost(path, body, options) {
  return request('POST', path, { ...options, body })
}

// POST /auth/login. Returns { access_token, token_type, expires_in }; ApiError(401) on wrong credentials.
export async function login(username, password) {
  return apiPost('/auth/login', { username, password })
}

// GET /me with the given token, or the stored one. Returns { username, full_name, role }.
export async function getMe(token) {
  return apiGet('/me', token ? { token } : undefined)
}

// GET /health. Throws unless status and version are non-empty strings.
export async function getHealth() {
  const body = await apiGet('/health')
  if (
    body === null ||
    typeof body !== 'object' ||
    typeof body.status !== 'string' ||
    body.status === '' ||
    typeof body.version !== 'string' ||
    body.version === ''
  ) {
    throw new Error('Unexpected /health response')
  }
  return { status: body.status, version: body.version, database: body.database }
}
