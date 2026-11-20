// US-01 register patient page tests: AC7, AC8, AC9, AC10, AC12, AC14 (FR-010 to FR-014), following
// specs/015-register-patient/contracts/ui.md. The whole app runs in an in-memory router (renderApp);
// fetch is stubbed (stubBackend), no backend and no network. Synthetic names and demo users only.
//
// Exact Spanish texts copied from frontend/src/i18n/translations.js:
//   registerPatient.title        'Registrar paciente'
//   registerPatient.name         'Nombre (ficticio)'
//   registerPatient.nameHint     'No uses datos reales.'
//   registerPatient.age          'Edad (años)'
//   registerPatient.sex          'Sexo'
//   sex.female / male / other    'Femenino' / 'Masculino' / 'Otro'
//   registerPatient.triageLevel  'Nivel de triage'
//   triageLevel.1..5             'Triage I' .. 'Triage V'
//   registerPatient.submit       'Registrar'
//   registerPatient.submitting   'Registrando…'
//   registerPatient.required     'Este campo es obligatorio.'
//   registerPatient.ageInvalid   'Escribe una edad entera entre 0 y 130.'
//   registerPatient.errorInvalid 'Revisa los datos del formulario.'
//   registerPatient.errorConflict 'No se pudo asignar un código de paciente. Inténtalo de nuevo.'
//   registerPatient.errorFailed  'No se pudo registrar el paciente. Inténtalo de nuevo.'
//   registerPatient.nursesOnly   'Solo el personal de enfermería puede registrar pacientes.'
//   nav.backToPatients           'Volver a la lista de pacientes'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor, within, act } from '@testing-library/react'
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
import { getSession } from '../../auth/session.js'

const ES_TITLE = 'Registrar paciente'
const ES_NAME = 'Nombre (ficticio)'
const ES_NAME_HINT = 'No uses datos reales.'
const ES_AGE = 'Edad (años)'
const ES_SEX = 'Sexo'
const ES_LEVEL = 'Nivel de triage'
const ES_SUBMIT = 'Registrar'
const ES_SUBMITTING = 'Registrando…'
const ES_REQUIRED = 'Este campo es obligatorio.'
const ES_AGE_INVALID = 'Escribe una edad entera entre 0 y 130.'
const ES_ERROR_INVALID = 'Revisa los datos del formulario.'
const ES_ERROR_CONFLICT = 'No se pudo asignar un código de paciente. Inténtalo de nuevo.'
const ES_ERROR_FAILED = 'No se pudo registrar el paciente. Inténtalo de nuevo.'
const ES_NURSES_ONLY = 'Solo el personal de enfermería puede registrar pacientes.'
const ES_BACK = 'Volver a la lista de pacientes'
const ES_LOGIN = 'Iniciar sesión'
const TRIAGE_LABELS = ['Triage I', 'Triage II', 'Triage III', 'Triage IV', 'Triage V']

const SYNTHETIC_NAME = 'Paciente Demo Uno'
const CREATED = {
  identifier: 'PAT-007',
  name: SYNTHETIC_NAME,
  age: 40,
  sex: 'female',
  triage_level: 3,
  admitted_at: '2026-11-20T10:00:00Z',
}

function nameInput() {
  return screen.getByLabelText(ES_NAME)
}
function ageInput() {
  return screen.getByLabelText(ES_AGE)
}
function submitButton() {
  return screen.getByRole('button', { name: ES_SUBMIT })
}

// Signs in as a nurse, opens /patients/new and waits for the /me refresh to finish.
async function openAsNurse(patients) {
  const fetchMock = stubBackend({ me: async () => jsonResponse(NURSE), patients })
  signInForTest(NURSE)
  renderApp(['/patients', '/patients/new'])
  await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))
  await act(async () => {})
  return fetchMock
}

function fillValidForm({ name = SYNTHETIC_NAME, age = '40', sex = 'Femenino', level = 'Triage III' } = {}) {
  fireEvent.change(nameInput(), { target: { value: name } })
  fireEvent.change(ageInput(), { target: { value: age } })
  fireEvent.click(within(screen.getByRole('group', { name: ES_SEX })).getByLabelText(sex))
  fireEvent.click(within(screen.getByRole('group', { name: ES_LEVEL })).getByLabelText(level))
}

function expectValuesKept() {
  expect(nameInput().value).toBe(SYNTHETIC_NAME)
  expect(ageInput().value).toBe('40')
  expect(within(screen.getByRole('group', { name: ES_SEX })).getByLabelText('Femenino').checked).toBe(true)
  expect(within(screen.getByRole('group', { name: ES_LEVEL })).getByLabelText('Triage III').checked).toBe(true)
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

describe('US-01 AC7 registration page', () => {
  it('AC7 nurse sees the form in a card with the fictitious-name label and hint', async () => {
    await openAsNurse()

    expect(currentPath()).toBe('/patients/new')
    expect(screen.getByRole('heading', { level: 1, name: ES_TITLE })).toBeTruthy()
    const form = nameInput().closest('form')
    expect(form).toBeTruthy()
    expect(form.parentElement.className).toMatch(/card/)

    const name = nameInput()
    expect(name.id).toBe('register-name')
    expect(screen.getByText(ES_NAME_HINT)).toBeTruthy()
    const hintId = screen.getByText(ES_NAME_HINT).id
    expect(name.getAttribute('aria-describedby').split(' ')).toContain(hintId)
    expect(ageInput().id).toBe('register-age')
  })

  it('AC7 sex options and the five triage levels Triage I to Triage V, none checked', async () => {
    await openAsNurse()

    const sexGroup = screen.getByRole('group', { name: ES_SEX })
    expect(within(sexGroup).getAllByRole('radio').map((r) => r.value)).toEqual(['female', 'male', 'other'])
    for (const label of ['Femenino', 'Masculino', 'Otro']) expect(within(sexGroup).getByLabelText(label)).toBeTruthy()

    const levelGroup = screen.getByRole('group', { name: ES_LEVEL })
    const levels = within(levelGroup).getAllByRole('radio')
    expect(levels.map((r) => r.value)).toEqual(['1', '2', '3', '4', '5'])
    for (const label of TRIAGE_LABELS) expect(within(levelGroup).getByLabelText(label)).toBeTruthy()

    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(8)
    expect(radios.every((r) => !r.checked)).toBe(true)
    expect(radios.filter((r) => r.name === 'sex')).toHaveLength(3)
    expect(radios.filter((r) => r.name === 'triage_level')).toHaveLength(5)
  })

  it('AC7 no patient code field and no time field; nothing pre-filled', async () => {
    await openAsNurse()

    const form = nameInput().closest('form')
    const inputs = Array.from(form.querySelectorAll('input, select, textarea'))
    // Exactly: one name text input, one age number input, eight radios.
    expect(inputs).toHaveLength(10)
    expect(inputs.filter((i) => i.type === 'text').map((i) => i.id)).toEqual(['register-name'])
    expect(inputs.filter((i) => i.type === 'number').map((i) => i.id)).toEqual(['register-age'])
    expect(inputs.filter((i) => ['time', 'date', 'datetime-local'].includes(i.type))).toHaveLength(0)
    expect(within(form).queryByLabelText(/código|hora|fecha/i)).toBeNull()
    expect(nameInput().value).toBe('')
    expect(ageInput().value).toBe('')
  })
})

describe('US-01 AC8 form checks before sending', () => {
  it('AC8 empty submit shows a message next to each field and sends nothing', async () => {
    const fetchMock = await openAsNurse(async () => jsonResponse(CREATED, 201))

    fireEvent.click(submitButton())

    expect(screen.getAllByText(ES_REQUIRED)).toHaveLength(4)
    const nameError = document.getElementById('register-name-error')
    expect(nameError.textContent).toBe(ES_REQUIRED)
    expect(nameInput().getAttribute('aria-invalid')).toBe('true')
    expect(nameInput().getAttribute('aria-describedby').split(' ')).toContain('register-name-error')
    expect(ageInput().getAttribute('aria-invalid')).toBe('true')
    expect(ageInput().getAttribute('aria-describedby')).toBe('register-age-error')
    expect(within(screen.getByRole('group', { name: ES_SEX })).getByText(ES_REQUIRED)).toBeTruthy()
    expect(within(screen.getByRole('group', { name: ES_LEVEL })).getByText(ES_REQUIRED)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()

    await act(async () => {})
    expect(callsTo(fetchMock, '/api/patients')).toHaveLength(0)
    expect(currentPath()).toBe('/patients/new')
  })

  it('AC8 a name of only spaces counts as empty', async () => {
    const fetchMock = await openAsNurse(async () => jsonResponse(CREATED, 201))
    fillValidForm({ name: '   ' })

    fireEvent.click(submitButton())

    expect(document.getElementById('register-name-error').textContent).toBe(ES_REQUIRED)
    expect(screen.getAllByText(ES_REQUIRED)).toHaveLength(1)
    await act(async () => {})
    expect(callsTo(fetchMock, '/api/patients')).toHaveLength(0)
  })

  it.each([['131'], ['-1'], ['40.5']])('AC8 age %s shows the age message and sends nothing', async (age) => {
    const fetchMock = await openAsNurse(async () => jsonResponse(CREATED, 201))
    fillValidForm({ age })

    fireEvent.click(submitButton())

    expect(document.getElementById('register-age-error').textContent).toBe(ES_AGE_INVALID)
    expect(screen.queryByText(ES_REQUIRED)).toBeNull()
    await act(async () => {})
    expect(callsTo(fetchMock, '/api/patients')).toHaveLength(0)
    // Typed values stay.
    expect(nameInput().value).toBe(SYNTHETIC_NAME)
    expect(ageInput().value).toBe(age)
    expect(within(screen.getByRole('group', { name: ES_LEVEL })).getByLabelText('Triage III').checked).toBe(true)
  })

  it.each([['0'], ['130']])('AC8 boundary age %s is accepted and sent', async (age) => {
    const fetchMock = await openAsNurse(async () => jsonResponse(CREATED, 201))
    fillValidForm({ age })

    fireEvent.click(submitButton())

    await waitFor(() => expect(callsTo(fetchMock, '/api/patients')).toHaveLength(1))
    expect(JSON.parse(callsTo(fetchMock, '/api/patients')[0][1].body).age).toBe(Number(age))
  })

  it('AC8 a field message clears when that field is edited', async () => {
    await openAsNurse()
    fireEvent.click(submitButton())
    expect(screen.getAllByText(ES_REQUIRED)).toHaveLength(4)

    fireEvent.change(nameInput(), { target: { value: SYNTHETIC_NAME } })

    expect(document.getElementById('register-name-error')).toBeNull()
    expect(nameInput().getAttribute('aria-invalid')).toBeNull()
    expect(screen.getAllByText(ES_REQUIRED)).toHaveLength(3)
  })
})

describe('US-01 AC9 navigation after saving', () => {
  it('AC9 valid submit sends trimmed name and numbers, then opens /patients/PAT-007', async () => {
    const fetchMock = await openAsNurse(async () => jsonResponse(CREATED, 201))
    fillValidForm({ name: `  ${SYNTHETIC_NAME}  ` })

    fireEvent.click(submitButton())

    await waitFor(() => expect(currentPath()).toBe('/patients/PAT-007'))
    const calls = callsTo(fetchMock, '/api/patients')
    expect(calls).toHaveLength(1)
    const [, options] = calls[0]
    expect(options.method).toBe('POST')
    expect(options.headers.Authorization).toBe('Bearer test-token')
    expect(JSON.parse(options.body)).toEqual({ name: SYNTHETIC_NAME, age: 40, sex: 'female', triage_level: 3 })
    expect(screen.getByRole('heading', { level: 1, name: 'Paciente PAT-007' })).toBeTruthy()
  })
})

describe('US-01 AC10 failed save keeps the form', () => {
  it.each([
    ['422', async () => jsonResponse({ detail: [{ loc: ['body', 'age'], msg: 'SERVER-TEXT' }] }, 422), ES_ERROR_INVALID],
    ['409', async () => jsonResponse({ detail: 'SERVER-TEXT' }, 409), ES_ERROR_CONFLICT],
    ['500', async () => jsonResponse({ detail: 'SERVER-TEXT' }, 500), ES_ERROR_FAILED],
    ['503', async () => jsonResponse({ detail: 'SERVER-TEXT' }, 503), ES_ERROR_FAILED],
    [
      'rejected fetch',
      async () => {
        throw new TypeError('Failed to fetch')
      },
      ES_ERROR_FAILED,
    ],
  ])('AC10 answer %s shows the mapped alert, keeps values, re-enables the button', async (_label, handler, text) => {
    const fetchMock = await openAsNurse(handler)
    fillValidForm()

    fireEvent.click(submitButton())

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(text)
    expect(screen.queryByText(/SERVER-TEXT/)).toBeNull()
    expect(currentPath()).toBe('/patients/new')
    expectValuesKept()
    expect(submitButton().disabled).toBe(false)
    expect(callsTo(fetchMock, '/api/patients')).toHaveLength(1)
  })

  it('AC10 the button is disabled while saving and a second click sends nothing', async () => {
    let answer
    const fetchMock = await openAsNurse(
      () =>
        new Promise((resolve) => {
          answer = resolve
        }),
    )
    fillValidForm()

    fireEvent.click(submitButton())

    const pending = await screen.findByRole('button', { name: ES_SUBMITTING })
    expect(pending.disabled).toBe(true)
    fireEvent.click(pending)
    fireEvent.submit(pending.closest('form'))
    expect(callsTo(fetchMock, '/api/patients')).toHaveLength(1)

    await act(async () => answer(jsonResponse({}, 500)))

    expect((await screen.findByRole('alert')).textContent).toBe(ES_ERROR_FAILED)
    expect(submitButton().disabled).toBe(false)
    expect(callsTo(fetchMock, '/api/patients')).toHaveLength(1)
  })

  it('AC10 a new submit clears the previous alert', async () => {
    let status = 409
    const fetchMock = await openAsNurse(async () => (status === 409 ? jsonResponse({}, 409) : jsonResponse(CREATED, 201)))
    fillValidForm()
    fireEvent.click(submitButton())
    expect((await screen.findByRole('alert')).textContent).toBe(ES_ERROR_CONFLICT)

    status = 201
    fireEvent.click(submitButton())

    await waitFor(() => expect(currentPath()).toBe('/patients/PAT-007'))
    expect(callsTo(fetchMock, '/api/patients')).toHaveLength(2)
  })

  it('AC10 a 403 answer shows the nurses-only message in the alert', async () => {
    await openAsNurse(async () => jsonResponse({ detail: 'Only nurses can register patients' }, 403))
    fillValidForm()

    fireEvent.click(submitButton())

    expect((await screen.findByRole('alert')).textContent).toBe(ES_NURSES_ONLY)
    expectValuesKept()
    expect(submitButton().disabled).toBe(false)
  })

  it('AC10 a 401 answer with the stored token clears the session and goes to /login', async () => {
    await openAsNurse(async () => jsonResponse({ detail: 'Not authenticated' }, 401))
    fillValidForm()

    fireEvent.click(submitButton())

    await waitFor(() => expect(currentPath()).toBe('/login'))
    expect(getSession()).toBeNull()
    expect(screen.getByRole('heading', { name: ES_LOGIN })).toBeTruthy()
    expect(screen.queryByLabelText(ES_NAME)).toBeNull()
  })
})

describe('US-01 AC12 page protected and role-aware', () => {
  it('AC12 signed out /patients/new redirects to /login with no form', async () => {
    const fetchMock = stubBackend()
    renderApp(['/patients/new'])

    expect(currentPath()).toBe('/login')
    expect(screen.getByRole('heading', { name: ES_LOGIN })).toBeTruthy()
    expect(screen.queryByLabelText(ES_NAME)).toBeNull()
    await act(async () => {})
    expect(callsTo(fetchMock, '/api/patients')).toHaveLength(0)
  })

  it('AC12 doctor sees the nurses-only message and the back link, no form', async () => {
    const fetchMock = stubBackend({ me: async () => jsonResponse(DOCTOR) })
    signInForTest(DOCTOR)
    renderApp(['/patients/new'])
    await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))
    await act(async () => {})

    expect(currentPath()).toBe('/patients/new')
    expect(screen.getByRole('heading', { level: 1, name: ES_TITLE })).toBeTruthy()
    expect(screen.getByText(ES_NURSES_ONLY)).toBeTruthy()
    const link = screen.getByRole('link', { name: ES_BACK })
    expect(link.getAttribute('href')).toBe('/patients')
    expect(document.querySelector('form')).toBeNull()
    expect(screen.queryByLabelText(ES_NAME)).toBeNull()
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: ES_SUBMIT })).toBeNull()
    expect(callsTo(fetchMock, '/api/patients')).toHaveLength(0)

    fireEvent.click(link)
    expect(currentPath()).toBe('/patients')
  })
})

describe('US-01 AC14 Spanish by default, English switch', () => {
  it('AC14 switching to English translates the page and keeps typed values', async () => {
    await openAsNurse()
    fireEvent.change(nameInput(), { target: { value: SYNTHETIC_NAME } })
    fireEvent.change(ageInput(), { target: { value: '40' } })
    fireEvent.click(within(screen.getByRole('group', { name: ES_SEX })).getByLabelText('Otro'))
    fireEvent.click(submitButton())
    // Only the triage level is missing now.
    expect(within(screen.getByRole('group', { name: ES_LEVEL })).getByText(ES_REQUIRED)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Register patient' })).toBeTruthy()
    const name = screen.getByLabelText('Name (fictitious)')
    expect(screen.getByText('Do not use real data.')).toBeTruthy()
    expect(name.value).toBe(SYNTHETIC_NAME)
    expect(screen.getByLabelText('Age (years)').value).toBe('40')
    const sexGroup = screen.getByRole('group', { name: 'Sex' })
    expect(within(sexGroup).getByLabelText('Other').checked).toBe(true)
    expect(within(sexGroup).getByLabelText('Female')).toBeTruthy()
    expect(within(sexGroup).getByLabelText('Male')).toBeTruthy()
    const levelGroup = screen.getByRole('group', { name: 'Triage level' })
    expect(within(levelGroup).getByText('This field is required.')).toBeTruthy()
    expect(screen.getByText('The level assigned at the triage already done.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Register' })).toBeTruthy()
    expect(screen.queryByText(ES_NAME)).toBeNull()
    expect(screen.queryByText(ES_REQUIRED)).toBeNull()
  })

  it('AC14 the error alert is shown in English after the switch', async () => {
    await openAsNurse(async () => jsonResponse({}, 409))
    fillValidForm()
    fireEvent.click(submitButton())
    expect((await screen.findByRole('alert')).textContent).toBe(ES_ERROR_CONFLICT)

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    expect(screen.getByRole('alert').textContent).toBe('Could not assign a patient code. Try again.')
    expect(screen.getByLabelText('Name (fictitious)').value).toBe(SYNTHETIC_NAME)
  })

  it('AC14 doctor sees the nurses-only message in English', async () => {
    const fetchMock = stubBackend({ me: async () => jsonResponse(DOCTOR) })
    signInForTest(DOCTOR)
    localStorage.setItem('pdm.language', 'en')
    renderApp(['/patients/new'])
    await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))

    expect(screen.getByText('Only nurses can register patients.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to the patient list' })).toBeTruthy()
  })
})
