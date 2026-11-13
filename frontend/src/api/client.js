// Shared API client (TS-04). Every screen calls the backend through this module; the base URL is configured only here.

// Backend base URL from VITE_API_BASE_URL (trimmed, no trailing slash), or the local default.
export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '') || 'http://localhost:8000'

// A request that takes longer than this is aborted and treated as a failure.
export const REQUEST_TIMEOUT_MS = 10000

// GET a backend path and return the parsed JSON. Throws on network error, timeout,
// non-2xx status or invalid JSON.
export async function apiGet(path) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(API_BASE_URL + path, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
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
