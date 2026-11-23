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
// patients (US-01): optional handler for /api/patients; when not given that path answers 404 as before.
// readings (US-03): optional handler for any /api/patients/<code>/readings path; when not given
// those paths answer 404 as before.
// patient (US-05): optional handler for /api/patients/<code> (patient detail); when not given that
// path answers 404 as before.
// triageEvents (US-05): optional handler for /api/patients/<code>/triage-events; when not given
// that path answers 404 as before.
// The regex order below tests the more specific paths (/readings, /triage-events) before the bare
// /api/patients/<code>, so the bare patient regex never captures a readings/triage-events path.
const READINGS_PATH = /^\/api\/patients\/[^/]+\/readings$/
const TRIAGE_EVENTS_PATH = /^\/api\/patients\/[^/]+\/triage-events$/
const PATIENT_PATH = /^\/api\/patients\/[^/]+$/
// suggestions (US-04): optional handler for any /api/patients/<code>/suggestions path (the list
// endpoint and the /accept and /dismiss actions under it); when not given those paths answer 404
// as before, so the mounted RetriageSuggestion shows its load-error message.
const SUGGESTIONS_PATH = /^\/api\/patients\/[^/]+\/suggestions/
// prediction (US-08): optional handler for /api/patients/<code>/prediction; when not given that
// path answers 404 as before, so the mounted DeteriorationPrediction renders nothing.
const PREDICTION_PATH = /^\/api\/patients\/[^/]+\/prediction$/
// alertAck (US-07): optional handler for any /api/patients/<code>/alerts/ path (the GET
// .../alerts/acknowledgement and the POST .../alerts/<id>/seen); when not given those paths answer
// 404 as before, so the mounted AlertAcknowledgement renders nothing.
const ALERT_ACK_PATH = /^\/api\/patients\/[^/]+\/alerts\//

// openSuggestions (US-04 CR1): optional handler for GET /api/suggestions (every open suggestion
// across patients, for the patient-list banner). When not given it defaults to an empty list so a
// page mounting OpenSuggestionsBanner (e.g. the patient list) never errors and simply shows the
// "no open suggestions" message, mirroring how the other optional handlers answer a quiet default.
export function stubBackend({
  health,
  me,
  login,
  patients,
  readings,
  patient,
  triageEvents,
  suggestions,
  prediction,
  alertAck,
  openSuggestions,
} = {}) {
  const routes = {
    '/health': health ?? (async () => jsonResponse({ status: 'ok', version: '0.1.0', database: 'ok' })),
    '/api/me': me ?? (async () => jsonResponse(DOCTOR)),
    '/api/auth/login':
      login ??
      (async () => jsonResponse({ access_token: 'test-token', token_type: 'bearer', expires_in: 28800 })),
    '/api/suggestions': openSuggestions ?? (async () => jsonResponse({ suggestions: [] })),
  }
  if (patients) routes['/api/patients'] = patients
  const mock = vi.fn(async (url, options) => {
    const path = new URL(url).pathname
    let handler = routes[path]
    // Match the more specific nested paths before the bare patient path.
    if (!handler && readings && READINGS_PATH.test(path)) handler = readings
    if (!handler && triageEvents && TRIAGE_EVENTS_PATH.test(path)) handler = triageEvents
    if (!handler && suggestions && SUGGESTIONS_PATH.test(path)) handler = suggestions
    if (!handler && prediction && PREDICTION_PATH.test(path)) handler = prediction
    if (!handler && alertAck && ALERT_ACK_PATH.test(path)) handler = alertAck
    if (!handler && patient && PATIENT_PATH.test(path)) handler = patient
    return handler ? handler(url, options) : jsonResponse({}, 404)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

// The calls of a fetch mock whose URL path equals path.
export function callsTo(mock, path) {
  return mock.mock.calls.filter(([url]) => new URL(url).pathname === path)
}
