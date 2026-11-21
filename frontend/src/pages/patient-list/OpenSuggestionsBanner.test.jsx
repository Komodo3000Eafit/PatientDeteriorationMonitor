// Open re-triage suggestions banner tests (US-04 CR1): AC21, AC22, FR-018-FR-020, following
// specs/020-retriage-suggestion-alerts/contracts/retriage-api.md ("GET /api/suggestions") and
// contracts/ui.md. The whole app runs in an in-memory router (renderApp) on the patient list page
// (/patients), where the banner is mounted; fetch is stubbed (stubBackend with the openSuggestions
// handler), no backend and no network. Synthetic data only (PAT-NNN codes, demo users).
//
// Exact texts copied from frontend/src/i18n/translations.js:
//   retriage.listTitle 'Sugerencias de retriage abiertas' / 'Open re-triage suggestions'
//   retriage.listEmpty 'No hay sugerencias abiertas.' / 'No open suggestions.'
//   retriage.listError 'No se pudieron cargar las sugerencias.' / 'Could not load suggestions.'
//   retriage.patient   'Paciente {code}' / 'Patient {code}'
//   retriage.severity.high 'Severidad alta' / 'High severity'
//   retriage.severity.medium 'Severidad media' / 'Medium severity'
//   triageLevel.1 'Triage I'; triageLevel.2 'Triage II'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import { currentPath, renderApp } from '../../testing/renderApp.jsx'
import {
  DOCTOR,
  callsTo,
  jsonResponse,
  resetSession,
  signInForTest,
  stubBackend,
} from '../../testing/fakeBackend.js'

const ES_TITLE = 'Sugerencias de retriage abiertas'
const ES_EMPTY = 'No hay sugerencias abiertas.'
const ES_ERROR = 'No se pudieron cargar las sugerencias.'
const OPEN_PATH = '/api/suggestions'

// Two open suggestions across patients, newest first (as the backend returns them). CR2: reason is
// the structured list, but the banner never shows the reason (detail page only).
const HIGH_ITEM = {
  id: 9,
  severity: 'high',
  message: 'Risk is high. Suggest re-triage from Triage III to Triage I.',
  reason: [{ parameter: 'respiratory_rate', points: 3 }],
  current_level: 3,
  suggested_level: 1,
  status: 'open',
  created_at: '2026-11-21T15:10:00.000000Z',
  patient_code: 'PAT-010',
}
const MEDIUM_ITEM = {
  id: 4,
  severity: 'medium',
  message: 'Risk is medium. Suggest re-triage from Triage III to Triage II.',
  reason: [{ parameter: 'spo2', points: 2 }],
  current_level: 3,
  suggested_level: 2,
  status: 'open',
  created_at: '2026-11-21T15:05:00.000000Z',
  patient_code: 'PAT-020',
}

function openSuggestionsHandler({ list = [HIGH_ITEM, MEDIUM_ITEM], status = 200 } = {}) {
  return async () => {
    if (status !== 200) return jsonResponse({ detail: 'Service unavailable' }, status)
    return jsonResponse({ suggestions: list })
  }
}

async function openList(handlerOptions, user = DOCTOR) {
  const fetchMock = stubBackend({
    me: async () => jsonResponse(user),
    openSuggestions: openSuggestionsHandler(handlerOptions),
  })
  signInForTest(user)
  renderApp(['/patients'])
  await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))
  await waitFor(() => expect(callsTo(fetchMock, OPEN_PATH).length).toBeGreaterThan(0))
  await act(async () => {})
  return fetchMock
}

// The severity chip element for a given row (the <li> that contains the patient link).
function rowFor(code) {
  return screen.getByText(`Paciente ${code}`).closest('li')
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

// --- AC21 / AC22: open suggestions listed with code, severity, suggested level, link ----------

describe('US-04 AC21/AC22 the banner lists open suggestions', () => {
  it('AC21 lists each open suggestion with the patient code, severity label and suggested level', async () => {
    await openList()

    expect(screen.getByRole('heading', { name: ES_TITLE })).toBeTruthy()

    const highRow = rowFor('PAT-010')
    // Severity: color + icon + text label (color never the only cue).
    expect(within(highRow).getByText('Severidad alta')).toBeTruthy()
    const highChip = within(highRow).getByText('Severidad alta').parentElement
    expect(highChip.className).toContain('high')   // critical/red tokens via the .high class
    const highIcon = highRow.querySelector('svg')
    expect(highIcon).not.toBeNull()
    expect(highIcon.getAttribute('aria-hidden')).toBe('true')
    expect(highIcon.getAttribute('class')).toContain('octagon-x')
    // Suggested triage level badge.
    expect(within(highRow).getByText('Triage I')).toBeTruthy()

    const medRow = rowFor('PAT-020')
    expect(within(medRow).getByText('Severidad media')).toBeTruthy()
    const medChip = within(medRow).getByText('Severidad media').parentElement
    expect(medChip.className).toContain('medium')   // warning/yellow tokens via the .medium class
    expect(medRow.querySelector('svg').getAttribute('class')).toContain('triangle-alert')
    expect(within(medRow).getByText('Triage II')).toBeTruthy()
  })

  it('AC22 each row links to that patient detail page and navigates there on click', async () => {
    await openList()

    const highRow = rowFor('PAT-010')
    const link = within(highRow).getByRole('link', { name: /PAT-010/ })
    expect(link.getAttribute('href')).toBe('/patients/PAT-010')

    fireEvent.click(link)
    await waitFor(() => expect(currentPath()).toBe('/patients/PAT-010'))
  })

  it('AC22 the banner offers no accept or dismiss action', async () => {
    await openList()
    expect(screen.queryByRole('button', { name: 'Aceptar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Descartar' })).toBeNull()
  })
})

// --- AC21: empty and error states ------------------------------------------------------------

describe('US-04 AC21 empty and error states', () => {
  it('AC21 an empty result shows the "no open suggestions" message and no rows', async () => {
    await openList({ list: [] })

    expect(screen.getByText(ES_EMPTY)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Paciente/ })).toBeNull()
  })

  it('AC21 a load error (503) shows the fixed error message and no rows', async () => {
    await openList({ status: 503 })

    expect(await screen.findByText(ES_ERROR)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Paciente/ })).toBeNull()
  })

  it('AC21 a 401 renders nothing from the banner (session-expiry handling)', async () => {
    // The banner swallows a 401 (the API client handles session expiry). The banner shows no
    // title, no rows and no error of its own.
    await openList({ status: 401 })

    expect(screen.queryByRole('heading', { name: ES_TITLE })).toBeNull()
    expect(screen.queryByText(ES_ERROR)).toBeNull()
    expect(screen.queryByText(ES_EMPTY)).toBeNull()
  })
})

// --- AC21: Spanish by default, English after the switch --------------------------------------

describe('US-04 AC21 language', () => {
  it('shows English texts after the language switch and keeps the rows', async () => {
    await openList()

    expect(screen.getByRole('heading', { name: ES_TITLE })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    expect(screen.getByRole('heading', { name: 'Open re-triage suggestions' })).toBeTruthy()
    const highRow = screen.getByText('Patient PAT-010').closest('li')
    expect(within(highRow).getByText('High severity')).toBeTruthy()
    expect(within(highRow).getByText('Triage I')).toBeTruthy()
    // Spanish gone.
    expect(screen.queryByText(ES_TITLE)).toBeNull()
  })

  it('shows the English empty message after the switch', async () => {
    await openList({ list: [] })
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(screen.getByText('No open suggestions.')).toBeTruthy()
  })
})
