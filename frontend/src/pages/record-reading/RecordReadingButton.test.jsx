// US-03 "Registrar signos vitales" button tests: AC19 (nurse-only button on the patient detail
// page) and AC20 (English text), following specs/017-vital-signs-scoring/contracts/ui.md
// "Nurse-only button". The whole app runs in an in-memory router (renderApp); fetch is stubbed
// (stubBackend), no backend and no network. Demo users only.
//
// Exact texts copied from frontend/src/i18n/translations.js:
//   recordReading.button  'Registrar signos vitales' / 'Record vital signs'
//   recordReading.title   'Registrar signos vitales · {code}'
//   patientDetail.title   'Paciente {code}'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor, act } from '@testing-library/react'
import { currentPath, renderApp } from '../../testing/renderApp.jsx'
import {
  DOCTOR,
  NURSE,
  callsTo,
  jsonResponse,
  resetSession,
  signInForTest,
  stubBackend,
} from '../../testing/fakeBackend.js'

const ES_BUTTON = 'Registrar signos vitales'
const ES_DETAIL_TITLE = 'Paciente PAT-001'

async function openDetail(user) {
  const fetchMock = stubBackend({ me: async () => jsonResponse(user) })
  signInForTest(user)
  renderApp(['/patients/PAT-001'])
  await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))
  await act(async () => {})
  return fetchMock
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

describe('US-03 AC19 "Registrar signos vitales" button for nurses only', () => {
  it('AC19 nurse on /patients/PAT-001 sees the button with one aria-hidden svg', async () => {
    await openDetail(NURSE)

    expect(screen.getByRole('heading', { level: 1, name: ES_DETAIL_TITLE })).toBeTruthy()
    const buttons = screen.getAllByRole('button', { name: ES_BUTTON })
    expect(buttons).toHaveLength(1)
    const svgs = buttons[0].querySelectorAll('svg')
    expect(svgs).toHaveLength(1)
    expect(svgs[0].getAttribute('aria-hidden')).toBe('true')
  })

  it('AC19 clicking the button opens /patients/PAT-001/readings/new with the entry form', async () => {
    const fetchMock = await openDetail(NURSE)

    fireEvent.click(screen.getByRole('button', { name: ES_BUTTON }))

    expect(currentPath()).toBe('/patients/PAT-001/readings/new')
    expect(
      screen.getByRole('heading', { level: 1, name: 'Registrar signos vitales · PAT-001' }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Guardar lectura' })).toBeTruthy()
    // Opening the page sends nothing.
    expect(callsTo(fetchMock, '/api/patients/PAT-001/readings')).toHaveLength(0)
  })

  it('AC19 doctor does not see the button', async () => {
    await openDetail(DOCTOR)

    expect(screen.getByRole('heading', { level: 1, name: ES_DETAIL_TITLE })).toBeTruthy()
    expect(screen.queryByRole('button', { name: ES_BUTTON })).toBeNull()
    expect(screen.queryByText(ES_BUTTON)).toBeNull()
  })

  it('AC19 the button disappears if /me says the user is a doctor', async () => {
    const fetchMock = stubBackend({ me: async () => jsonResponse(DOCTOR) })
    signInForTest(NURSE)
    renderApp(['/patients/PAT-001'])
    await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))

    await waitFor(() => expect(screen.queryByRole('button', { name: ES_BUTTON })).toBeNull())
  })
})

describe('US-03 AC20 button language', () => {
  it('AC20 the button text is English after switching to EN', async () => {
    await openDetail(NURSE)

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    expect(screen.getByRole('button', { name: 'Record vital signs' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: ES_BUTTON })).toBeNull()
  })
})
