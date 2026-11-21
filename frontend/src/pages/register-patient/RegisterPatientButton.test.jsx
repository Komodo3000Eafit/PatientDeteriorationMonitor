// US-01 "Register patient" button tests: AC11 and AC14 (FR-015), following
// specs/015-register-patient/contracts/ui.md. The whole app runs in an in-memory router (renderApp);
// fetch is stubbed (stubBackend), no backend and no network. Demo users only.
//
// Exact Spanish texts copied from frontend/src/i18n/translations.js:
//   registerPatient.button  'Registrar paciente'
//   registerPatient.title   'Registrar paciente'
//   registerPatient.name    'Nombre'
//   patients.title          'Pacientes'
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

const ES_BUTTON = 'Registrar paciente'
const ES_NAME = 'Nombre'
const ES_LIST_PLACEHOLDER = 'Pacientes'

async function openList(user) {
  const fetchMock = stubBackend({ me: async () => jsonResponse(user) })
  signInForTest(user)
  renderApp(['/patients'])
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

describe('US-01 AC11 Register patient button for nurses only', () => {
  it('AC11 nurse sees "Registrar paciente" with one decorative icon', async () => {
    await openList(NURSE)

    expect(screen.getByText(ES_LIST_PLACEHOLDER)).toBeTruthy()
    const buttons = screen.getAllByRole('button', { name: ES_BUTTON })
    expect(buttons).toHaveLength(1)
    const svgs = buttons[0].querySelectorAll('svg')
    expect(svgs).toHaveLength(1)
    expect(svgs[0].getAttribute('aria-hidden')).toBe('true')
  })

  it('AC11 clicking the button opens /patients/new with the form', async () => {
    const fetchMock = await openList(NURSE)

    fireEvent.click(screen.getByRole('button', { name: ES_BUTTON }))

    expect(currentPath()).toBe('/patients/new')
    expect(screen.getByRole('heading', { level: 1, name: ES_BUTTON })).toBeTruthy()
    expect(screen.getByLabelText(ES_NAME)).toBeTruthy()
    expect(callsTo(fetchMock, '/api/patients').filter(([, o]) => o?.method === 'POST')).toHaveLength(0)
  })

  it('AC11 doctor does not see the button', async () => {
    await openList(DOCTOR)

    expect(screen.getByText(ES_LIST_PLACEHOLDER)).toBeTruthy()
    expect(screen.queryByRole('button', { name: ES_BUTTON })).toBeNull()
    expect(screen.queryByText(ES_BUTTON)).toBeNull()
  })

  it('AC11 the button disappears if /me says the user is a doctor', async () => {
    // Stored role nurse, refreshed role doctor: the button follows the current user.
    const fetchMock = stubBackend({ me: async () => jsonResponse(DOCTOR) })
    signInForTest(NURSE)
    renderApp(['/patients'])
    await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))

    await waitFor(() => expect(screen.queryByRole('button', { name: ES_BUTTON })).toBeNull())
  })
})

describe('US-01 AC14 button language', () => {
  it('AC14 the button text is English after switching to EN', async () => {
    await openList(NURSE)

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    expect(screen.getByRole('button', { name: 'Register patient' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: ES_BUTTON })).toBeNull()
  })
})
