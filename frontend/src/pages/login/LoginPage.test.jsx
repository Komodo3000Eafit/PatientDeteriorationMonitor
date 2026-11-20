// TS-12 LoginPage: AC8 (native submit button, disabled in flight), AC11 (accessible error alert
// with decorative icon). Fake backend only; no network.
// TS-13 (AC12): rendered inside a router at /login (renderApp); assertions are unchanged.
// Exact es strings copied from src/i18n/translations.js:
//   login.submit             = 'Entrar'
//   login.submitting         = 'Entrando…'
//   login.invalidCredentials = 'Usuario o contraseña incorrectos.'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, fireEvent, waitFor, act } from '@testing-library/react'
import { renderApp } from '../../testing/renderApp.jsx'
import { stubBackend, resetSession, jsonResponse } from '../../testing/fakeBackend.js'

const ES_SUBMIT = 'Entrar'
const ES_INVALID = 'Usuario o contraseña incorrectos.'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  resetSession()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('TS-12 LoginPage', () => {
  // AC11: wrong credentials show the exact error text with a single decorative icon.
  it('AC11 wrong credentials show the exact error with a decorative icon', async () => {
    stubBackend({ login: async () => jsonResponse({ detail: 'invalid' }, 401) })
    renderApp(['/login'])

    fireEvent.change(document.querySelector('#login-username'), {
      target: { value: 'demo.doctor' },
    })
    fireEvent.change(document.querySelector('#login-password'), {
      target: { value: 'wrong' },
    })
    fireEvent.click(screen.getByRole('button', { name: ES_SUBMIT }))

    const alert = await screen.findByRole('alert')
    // The alert text is exactly the message; the icon is decorative and adds no text.
    expect(alert.textContent).toBe(ES_INVALID)
    // Exactly one decorative <svg>, hidden from the accessibility tree.
    expect(alert.querySelectorAll('svg')).toHaveLength(1)
    const icon = alert.querySelector('svg')
    expect(icon).not.toBeNull()
    expect(icon.getAttribute('aria-hidden')).toBe('true')
  })

  // AC8: the submit button is a native <button type="submit"> and disables while in flight.
  it('AC8 submit button is a native submit that disables while the request is in flight', async () => {
    let resolveLogin
    stubBackend({ login: () => new Promise((resolve) => { resolveLogin = resolve }) })
    renderApp(['/login'])

    const button = screen.getByRole('button', { name: ES_SUBMIT })
    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('type')).toBe('submit')
    expect(button.disabled).toBe(false)

    fireEvent.change(document.querySelector('#login-username'), {
      target: { value: 'demo.doctor' },
    })
    fireEvent.change(document.querySelector('#login-password'), {
      target: { value: 'pw-123456' },
    })
    fireEvent.submit(button.closest('form'))

    // With the login promise pending, the component is submitting: the submit button is disabled.
    await waitFor(() => expect(button.disabled).toBe(true))
    expect(button.getAttribute('type')).toBe('submit')

    // Resolve inside act so the eventual sign-in state change does not warn.
    await act(async () => {
      resolveLogin(
        jsonResponse({ access_token: 'test-token', token_type: 'bearer', expires_in: 28800 }),
      )
    })
  })
})
