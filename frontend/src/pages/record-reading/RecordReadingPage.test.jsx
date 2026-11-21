// US-03 reading entry page tests: AC12 to AC17 and AC20, following
// specs/017-vital-signs-scoring/contracts/ui.md. The whole app runs in an in-memory router
// (renderApp); fetch is stubbed (stubBackend with the readings handler), no backend and no network.
// Demo users and synthetic vital signs only.
//
// Exact Spanish texts copied from frontend/src/i18n/translations.js:
//   recordReading.title           'Registrar signos vitales · {code}'
//   recordReading.submit          'Guardar lectura'
//   recordReading.nursesOnly      'Solo el personal de enfermería puede registrar signos vitales.'
//   recordReading.backToPatient   'Volver al paciente'
//   recordReading.required        'Campo obligatorio.'
//   recordReading.wholeNumber     'Escribe un número entero.'
//   recordReading.oneDecimal      'Escribe un número con máximo un decimal.'
//   recordReading.valueRejected   'Valor no aceptado. Revisa el dato.'
//   recordReading.errorInvalid    'Algunos datos no son válidos. Revisa el formulario.'
//   recordReading.errorNotFound   'No se encontró el paciente.'
//   recordReading.errorDischarged 'El paciente está dado de alta; no se pueden registrar lecturas.'
//   recordReading.errorFailed     'No se pudo guardar la lectura. Inténtalo de nuevo.'
//   recordReading.resultTitle     'Lectura guardada'
//   recordReading.score / band    'Puntaje NEWS2' / 'Banda de riesgo'
//   recordReading.another         'Registrar otra lectura'
//   parameter.*                   see ES_LABELS below
//   yesNo.true / false            'Sí' / 'No'
//   consciousness.A..U            'Alerta', 'Confusión nueva', 'Responde a la voz',
//                                 'Responde al dolor', 'No responde'
//   riskBand.medium               'Media'
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

const PATH = '/patients/PAT-001/readings/new'
const READINGS_PATH = '/api/patients/PAT-001/readings'

const ES_TITLE = 'Registrar signos vitales · PAT-001'
const ES_SUBMIT = 'Guardar lectura'
const ES_NURSES_ONLY = 'Solo el personal de enfermería puede registrar signos vitales.'
const ES_BACK = 'Volver al paciente'
const ES_REQUIRED = 'Campo obligatorio.'
const ES_WHOLE = 'Escribe un número entero.'
const ES_ONE_DECIMAL = 'Escribe un número con máximo un decimal.'
const ES_REJECTED = 'Valor no aceptado. Revisa el dato.'
const ES_ERROR_INVALID = 'Algunos datos no son válidos. Revisa el formulario.'
const ES_ERROR_NOT_FOUND = 'No se encontró el paciente.'
const ES_ERROR_DISCHARGED = 'El paciente está dado de alta; no se pueden registrar lecturas.'
const ES_ERROR_FAILED = 'No se pudo guardar la lectura. Inténtalo de nuevo.'
const ES_RESULT_TITLE = 'Lectura guardada'
const ES_ANOTHER = 'Registrar otra lectura'
const ES_LOGIN = 'Iniciar sesión'

const ES_LABELS = {
  respiratory_rate: 'Frecuencia respiratoria (resp/min)',
  spo2: 'Saturación de oxígeno SpO2 (%)',
  on_oxygen: 'Oxígeno suplementario',
  systolic_bp: 'Presión arterial sistólica (mmHg)',
  heart_rate: 'Frecuencia cardiaca (lpm)',
  consciousness: 'Nivel de conciencia (ACVPU)',
  temperature: 'Temperatura (°C)',
}
const EN_LABELS = {
  respiratory_rate: 'Respiratory rate (breaths/min)',
  spo2: 'Oxygen saturation SpO2 (%)',
  on_oxygen: 'Supplemental oxygen',
  systolic_bp: 'Systolic blood pressure (mmHg)',
  heart_rate: 'Heart rate (bpm)',
  consciousness: 'Level of consciousness (ACVPU)',
  temperature: 'Temperature (°C)',
}
const ES_CONSCIOUSNESS = [
  'A — Alerta',
  'C — Confusión nueva',
  'V — Responde a la voz',
  'P — Responde al dolor',
  'U — No responde',
]
const TEXT_FIELDS = ['respiratory_rate', 'spo2', 'systolic_bp', 'heart_rate', 'temperature']

// The contract example reading (contracts/readings-api.md): total 5, band medium, seven entries.
const EXAMPLE_READING = {
  recorded_at: '2026-11-20T15:04:05.123456Z',
  respiratory_rate: 22,
  spo2: 95,
  on_oxygen: false,
  systolic_bp: 118,
  heart_rate: 96,
  consciousness: 'A',
  temperature: '38.4',
  score: {
    system: 'NEWS2',
    total: 5,
    band: 'medium',
    entries: [
      { parameter: 'respiratory_rate', value: 22, points: 2, low: 21, high: 24, category: [] },
      { parameter: 'spo2', value: 95, points: 1, low: 94, high: 95, category: [] },
      { parameter: 'on_oxygen', value: false, points: 0, low: null, high: null, category: [false] },
      { parameter: 'systolic_bp', value: 118, points: 0, low: 111, high: 219, category: [] },
      { parameter: 'heart_rate', value: 96, points: 1, low: 91, high: 110, category: [] },
      { parameter: 'consciousness', value: 'A', points: 0, low: null, high: null, category: ['A'] },
      { parameter: 'temperature', value: '38.4', points: 1, low: '38.1', high: '39.0', category: [] },
    ],
  },
}

const VALID_BODY = {
  respiratory_rate: 22,
  spo2: 95,
  on_oxygen: false,
  systolic_bp: 118,
  heart_rate: 96,
  consciousness: 'A',
  temperature: 38.4,
}

function input(field, labels = ES_LABELS) {
  return screen.getByLabelText(labels[field])
}
function group(field, labels = ES_LABELS) {
  return screen.getByRole('group', { name: labels[field] })
}
function submitButton(name = ES_SUBMIT) {
  return screen.getByRole('button', { name })
}
function allRadios() {
  return screen.getAllByRole('radio')
}

// Accessible description built from aria-describedby (no jest-dom in this repo).
function describedText(element) {
  return (element.getAttribute('aria-describedby') || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
}

// Signs in, opens the entry page (after the detail page in the history) and waits for /me.
async function openPage({ user = NURSE, readings } = {}) {
  const fetchMock = stubBackend({ me: async () => jsonResponse(user), readings })
  signInForTest(user)
  renderApp(['/patients/PAT-001', PATH])
  await waitFor(() => expect(callsTo(fetchMock, '/api/me')).toHaveLength(1))
  await act(async () => {})
  return fetchMock
}

function fill({
  respiratory_rate = '22',
  spo2 = '95',
  on_oxygen = 'No',
  systolic_bp = '118',
  heart_rate = '96',
  consciousness = 'A — Alerta',
  temperature = '38,4',
} = {}) {
  fireEvent.change(input('respiratory_rate'), { target: { value: respiratory_rate } })
  fireEvent.change(input('spo2'), { target: { value: spo2 } })
  if (on_oxygen) fireEvent.click(within(group('on_oxygen')).getByLabelText(on_oxygen))
  fireEvent.change(input('systolic_bp'), { target: { value: systolic_bp } })
  fireEvent.change(input('heart_rate'), { target: { value: heart_rate } })
  if (consciousness) fireEvent.click(within(group('consciousness')).getByLabelText(consciousness))
  fireEvent.change(input('temperature'), { target: { value: temperature } })
}

function expectValuesKept() {
  expect(input('respiratory_rate').value).toBe('22')
  expect(input('spo2').value).toBe('95')
  expect(within(group('on_oxygen')).getByLabelText('No').checked).toBe(true)
  expect(input('systolic_bp').value).toBe('118')
  expect(input('heart_rate').value).toBe('96')
  expect(within(group('consciousness')).getByLabelText('A — Alerta').checked).toBe(true)
  expect(input('temperature').value).toBe('38,4')
}

function sentBodies(fetchMock) {
  return callsTo(fetchMock, READINGS_PATH).map(([, options]) => JSON.parse(options.body))
}

// A readings handler whose answer the test releases later.
function deferredReadings() {
  let release
  const answer = new Promise((resolve) => {
    release = resolve
  })
  return { handler: () => answer, release }
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

describe('US-03 AC12 entry page for nurses', () => {
  it('AC12 nurse sees the title with the patient code and the form inside a card', async () => {
    await openPage()

    expect(currentPath()).toBe(PATH)
    expect(screen.getByRole('heading', { level: 1, name: ES_TITLE })).toBeTruthy()
    const form = submitButton().closest('form')
    expect(form).toBeTruthy()
    expect(form.parentElement.className).toMatch(/card/)
  })

  it('AC12 the seven fields are shown in order with Spanish labels', async () => {
    await openPage()

    for (const field of TEXT_FIELDS) expect(input(field).tagName).toBe('INPUT')
    expect(within(group('on_oxygen')).getAllByRole('radio')).toHaveLength(2)
    expect(within(group('on_oxygen')).getByLabelText('Sí')).toBeTruthy()
    expect(within(group('on_oxygen')).getByLabelText('No')).toBeTruthy()
    const consciousness = within(group('consciousness')).getAllByRole('radio')
    expect(consciousness.map((radio) => radio.value)).toEqual(['A', 'C', 'V', 'P', 'U'])
    for (const label of ES_CONSCIOUSNESS) {
      expect(within(group('consciousness')).getByLabelText(label)).toBeTruthy()
    }
    // Form order (contracts/ui.md table).
    const order = [
      input('respiratory_rate'),
      input('spo2'),
      group('on_oxygen'),
      input('systolic_bp'),
      input('heart_rate'),
      group('consciousness'),
      input('temperature'),
    ]
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('AC12 numeric input modes: four numeric fields, temperature decimal', async () => {
    await openPage()

    for (const field of ['respiratory_rate', 'spo2', 'systolic_bp', 'heart_rate']) {
      expect(input(field).getAttribute('inputmode')).toBe('numeric')
    }
    expect(input('temperature').getAttribute('inputmode')).toBe('decimal')
  })

  it('AC12 no radio is pre-selected and there is no time field', async () => {
    await openPage()

    expect(allRadios()).toHaveLength(7)
    expect(allRadios().every((radio) => !radio.checked)).toBe(true)
    const form = submitButton().closest('form')
    // 5 text fields + 7 radios, nothing else.
    expect(form.querySelectorAll('input')).toHaveLength(12)
    expect(form.querySelectorAll('input[type="time"], input[type="datetime-local"], input[type="date"]')).toHaveLength(0)
    expect(within(form).getAllByRole('textbox')).toHaveLength(5)
  })
})

describe('US-03 AC13 form checks before sending', () => {
  it('AC13 empty submit shows seven "Campo obligatorio." messages and sends nothing', async () => {
    const readings = vi.fn(async () => jsonResponse(EXAMPLE_READING, 201))
    const fetchMock = await openPage({ readings })

    fireEvent.click(submitButton())

    expect(screen.getAllByText(ES_REQUIRED)).toHaveLength(7)
    for (const field of TEXT_FIELDS) {
      expect(input(field).getAttribute('aria-invalid')).toBe('true')
      expect(describedText(input(field))).toBe(ES_REQUIRED)
    }
    for (const field of ['on_oxygen', 'consciousness']) {
      expect(group(field).getAttribute('aria-invalid')).toBe('true')
      expect(describedText(group(field))).toBe(ES_REQUIRED)
    }
    await act(async () => {})
    expect(readings).not.toHaveBeenCalled()
    expect(callsTo(fetchMock, READINGS_PATH)).toHaveLength(0)
  })

  it('AC13 one empty field: only that field shows the message, typed values stay', async () => {
    const readings = vi.fn(async () => jsonResponse(EXAMPLE_READING, 201))
    await openPage({ readings })
    fill({ heart_rate: '' })

    fireEvent.click(submitButton())

    expect(screen.getAllByText(ES_REQUIRED)).toHaveLength(1)
    expect(describedText(input('heart_rate'))).toBe(ES_REQUIRED)
    expect(input('respiratory_rate').getAttribute('aria-invalid')).toBeNull()
    expect(input('respiratory_rate').value).toBe('22')
    expect(input('temperature').value).toBe('38,4')
    await act(async () => {})
    expect(readings).not.toHaveBeenCalled()
  })

  it('AC13 on oxygen and consciousness not chosen show the required message', async () => {
    const readings = vi.fn(async () => jsonResponse(EXAMPLE_READING, 201))
    await openPage({ readings })
    fill({ on_oxygen: null, consciousness: null })

    fireEvent.click(submitButton())

    expect(screen.getAllByText(ES_REQUIRED)).toHaveLength(2)
    expect(describedText(group('on_oxygen'))).toBe(ES_REQUIRED)
    expect(describedText(group('consciousness'))).toBe(ES_REQUIRED)
    await act(async () => {})
    expect(readings).not.toHaveBeenCalled()
  })

  it.each(['18.5', '18,0', 'abc', '-5', '1e2'])(
    'AC13 respiratory rate "%s" shows the whole-number message and sends nothing',
    async (value) => {
      const readings = vi.fn(async () => jsonResponse(EXAMPLE_READING, 201))
      await openPage({ readings })
      fill({ respiratory_rate: value })

      fireEvent.click(submitButton())

      expect(describedText(input('respiratory_rate'))).toBe(ES_WHOLE)
      expect(screen.getAllByText(ES_WHOLE)).toHaveLength(1)
      expect(input('respiratory_rate').value).toBe(value)
      await act(async () => {})
      expect(readings).not.toHaveBeenCalled()
    },
  )

  it.each(['37.25', '37,25', '37.', 'x'])(
    'AC13 temperature "%s" shows the one-decimal message and sends nothing',
    async (value) => {
      const readings = vi.fn(async () => jsonResponse(EXAMPLE_READING, 201))
      await openPage({ readings })
      fill({ temperature: value })

      fireEvent.click(submitButton())

      expect(describedText(input('temperature'))).toBe(ES_ONE_DECIMAL)
      expect(input('temperature').value).toBe(value)
      await act(async () => {})
      expect(readings).not.toHaveBeenCalled()
    },
  )

  it('AC13 no range check in the browser: spo2 = 150 is sent', async () => {
    const readings = vi.fn(async () => jsonResponse(EXAMPLE_READING, 201))
    const fetchMock = await openPage({ readings })
    fill({ spo2: '150' })

    fireEvent.click(submitButton())

    await waitFor(() => expect(readings).toHaveBeenCalledTimes(1))
    expect(sentBodies(fetchMock)[0].spo2).toBe(150)
  })

  it('AC13 correcting a field clears its message', async () => {
    await openPage()
    fireEvent.click(submitButton())
    expect(screen.getAllByText(ES_REQUIRED)).toHaveLength(7)

    fireEvent.change(input('spo2'), { target: { value: '95' } })

    expect(screen.getAllByText(ES_REQUIRED)).toHaveLength(6)
    expect(input('spo2').getAttribute('aria-invalid')).toBeNull()
  })
})

describe('US-03 AC14 valid submit and the stored result', () => {
  it('AC14 sends numbers, a boolean, the letter and 38.4 from "38,4" to the readings path', async () => {
    const readings = vi.fn(async () => jsonResponse(EXAMPLE_READING, 201))
    const fetchMock = await openPage({ readings })
    fill()

    fireEvent.click(submitButton())

    await waitFor(() => expect(readings).toHaveBeenCalledTimes(1))
    const [[url, options]] = callsTo(fetchMock, READINGS_PATH)
    expect(url).toBe('http://localhost:8000' + READINGS_PATH)
    expect(options.method).toBe('POST')
    expect(options.headers.Authorization).toBe('Bearer test-token')
    expect(JSON.parse(options.body)).toEqual(VALID_BODY)
  })

  it('AC14 on oxygen "Sí", consciousness "V" and an integer temperature are sent typed', async () => {
    const readings = vi.fn(async () => jsonResponse(EXAMPLE_READING, 201))
    const fetchMock = await openPage({ readings })
    fill({ on_oxygen: 'Sí', consciousness: 'V — Responde a la voz', temperature: '37' })

    fireEvent.click(submitButton())

    await waitFor(() => expect(readings).toHaveBeenCalledTimes(1))
    const body = sentBodies(fetchMock)[0]
    expect(body.on_oxygen).toBe(true)
    expect(body.consciousness).toBe('V')
    expect(body.temperature).toBe(37)
  })

  it('AC14 surrounding spaces are trimmed before sending', async () => {
    const readings = vi.fn(async () => jsonResponse(EXAMPLE_READING, 201))
    const fetchMock = await openPage({ readings })
    fill({ respiratory_rate: ' 22 ', temperature: ' 38.4 ' })

    fireEvent.click(submitButton())

    await waitFor(() => expect(readings).toHaveBeenCalledTimes(1))
    expect(sentBodies(fetchMock)[0]).toEqual(VALID_BODY)
  })

  it('AC14 shows the result from the answer: score, band, seven rows, another and back link', async () => {
    const readings = vi.fn(async () => jsonResponse(EXAMPLE_READING, 201))
    await openPage({ readings })
    fill()

    fireEvent.click(submitButton())

    expect(await screen.findByRole('heading', { level: 2, name: ES_RESULT_TITLE })).toBeTruthy()
    expect(screen.getByText('Puntaje NEWS2: 5')).toBeTruthy()
    expect(screen.getByText('Banda de riesgo: Media')).toBeTruthy()
    const table = screen.getByRole('table')
    const [, body] = within(table).getAllByRole('rowgroup')
    expect(within(body).getAllByRole('row')).toHaveLength(7)
    expect(within(table).getByText('21–24')).toBeTruthy()
    expect(screen.getByRole('button', { name: ES_ANOTHER })).toBeTruthy()
    expect(screen.getByRole('link', { name: ES_BACK }).getAttribute('href')).toBe('/patients/PAT-001')
    // The form is replaced by the result; the page title stays.
    expect(screen.queryByRole('button', { name: ES_SUBMIT })).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: ES_TITLE })).toBeTruthy()
  })

  it('AC14 the result shows what the answer says, not what was typed (no client scoring)', async () => {
    const answer = { ...EXAMPLE_READING, score: { ...EXAMPLE_READING.score, total: 11, band: 'high' } }
    const readings = vi.fn(async () => jsonResponse(answer, 201))
    await openPage({ readings })
    fill()

    fireEvent.click(submitButton())

    expect(await screen.findByText('Puntaje NEWS2: 11')).toBeTruthy()
    expect(screen.getByText('Banda de riesgo: Alta')).toBeTruthy()
  })

  it('AC14 "Registrar otra lectura" clears the form and shows it again', async () => {
    const readings = vi.fn(async () => jsonResponse(EXAMPLE_READING, 201))
    await openPage({ readings })
    fill()
    fireEvent.click(submitButton())
    await screen.findByRole('heading', { level: 2, name: ES_RESULT_TITLE })

    fireEvent.click(screen.getByRole('button', { name: ES_ANOTHER }))

    expect(screen.queryByRole('heading', { level: 2, name: ES_RESULT_TITLE })).toBeNull()
    for (const field of TEXT_FIELDS) expect(input(field).value).toBe('')
    expect(allRadios().every((radio) => !radio.checked)).toBe(true)
    expect(screen.queryByText(ES_REQUIRED)).toBeNull()
    expect(submitButton().disabled).toBe(false)
    expect(currentPath()).toBe(PATH)
  })

  it('AC14 the back link goes to the patient detail page', async () => {
    const readings = vi.fn(async () => jsonResponse(EXAMPLE_READING, 201))
    await openPage({ readings })
    fill()
    fireEvent.click(submitButton())
    await screen.findByRole('heading', { level: 2, name: ES_RESULT_TITLE })

    fireEvent.click(screen.getByRole('link', { name: ES_BACK }))

    expect(currentPath()).toBe('/patients/PAT-001')
  })
})

describe('US-03 AC15 validation error from the backend (422)', () => {
  it('AC15 loc ["body","spo2"] out_of_range shows "Valor no aceptado" next to SpO2 only', async () => {
    const readings = vi.fn(async () =>
      jsonResponse({ detail: [{ type: 'out_of_range', loc: ['body', 'spo2'], msg: 'Invalid value' }] }, 422),
    )
    await openPage({ readings })
    fill()

    fireEvent.click(submitButton())

    await waitFor(() => expect(screen.getAllByText(ES_REJECTED)).toHaveLength(1))
    expect(describedText(input('spo2'))).toBe(ES_REJECTED)
    expect(input('spo2').getAttribute('aria-invalid')).toBe('true')
    for (const field of ['respiratory_rate', 'systolic_bp', 'heart_rate', 'temperature']) {
      expect(input(field).getAttribute('aria-invalid')).toBeNull()
    }
    expect(screen.queryByText(ES_ERROR_INVALID)).toBeNull()
    expect(screen.queryByText('Invalid value')).toBeNull()
    expectValuesKept()
    expect(submitButton().disabled).toBe(false)
  })

  it('AC15 a missing problem for a field shows "Campo obligatorio." next to it', async () => {
    const readings = vi.fn(async () =>
      jsonResponse({ detail: [{ type: 'missing', loc: ['body', 'consciousness'], msg: 'Invalid value' }] }, 422),
    )
    await openPage({ readings })
    fill()

    fireEvent.click(submitButton())

    await waitFor(() => expect(describedText(group('consciousness'))).toBe(ES_REQUIRED))
    expect(screen.getAllByText(ES_REQUIRED)).toHaveLength(1)
    expectValuesKept()
  })

  it('AC15 problems on two fields mark both', async () => {
    const readings = vi.fn(async () =>
      jsonResponse(
        {
          detail: [
            { type: 'out_of_range', loc: ['body', 'heart_rate'], msg: 'Invalid value' },
            { type: 'too_many_decimals', loc: ['body', 'temperature'], msg: 'Invalid value' },
          ],
        },
        422,
      ),
    )
    await openPage({ readings })
    fill()

    fireEvent.click(submitButton())

    await waitFor(() => expect(screen.getAllByText(ES_REJECTED)).toHaveLength(2))
    expect(describedText(input('heart_rate'))).toBe(ES_REJECTED)
    expect(describedText(input('temperature'))).toBe(ES_REJECTED)
  })

  it('AC15 an unknown key shows the general message and no field message', async () => {
    const readings = vi.fn(async () =>
      jsonResponse({ detail: [{ type: 'unknown', loc: ['body', 'ZZ-UNIQUE'], msg: 'Invalid value' }] }, 422),
    )
    await openPage({ readings })
    fill()

    fireEvent.click(submitButton())

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(ES_ERROR_INVALID)
    expect(screen.queryByText(ES_REJECTED)).toBeNull()
    expect(document.body.textContent).not.toContain('ZZ-UNIQUE')
    expectValuesKept()
    expect(submitButton().disabled).toBe(false)
  })

  it.each([
    ['loc without a second element', { detail: [{ type: 'wrong_type', loc: ['body'], msg: 'x' }] }],
    ['detail not an array', { detail: 'QQ-SECRET server text' }],
    ['no detail', {}],
  ])('AC15 422 with %s shows the general message', async (_label, body) => {
    const readings = vi.fn(async () => jsonResponse(body, 422))
    await openPage({ readings })
    fill()

    fireEvent.click(submitButton())

    expect((await screen.findByRole('alert')).textContent).toBe(ES_ERROR_INVALID)
    expect(document.body.textContent).not.toContain('QQ-SECRET')
    expectValuesKept()
  })

  it('AC15 a field problem plus an unknown key shows both the field and the general message', async () => {
    const readings = vi.fn(async () =>
      jsonResponse(
        {
          detail: [
            { type: 'out_of_range', loc: ['body', 'spo2'], msg: 'Invalid value' },
            { type: 'unknown', loc: ['body', 'extra'], msg: 'Invalid value' },
          ],
        },
        422,
      ),
    )
    await openPage({ readings })
    fill()

    fireEvent.click(submitButton())

    expect((await screen.findByRole('alert')).textContent).toBe(ES_ERROR_INVALID)
    expect(describedText(input('spo2'))).toBe(ES_REJECTED)
  })

  it('AC15 no submitted value and no server text appear in any message', async () => {
    // Distinctive synthetic values; the field stays filled but no message repeats them.
    const readings = vi.fn(async () =>
      jsonResponse(
        { detail: [{ type: 'out_of_range', loc: ['body', 'spo2'], msg: 'QQ-SECRET 987', input: 987 }] },
        422,
      ),
    )
    await openPage({ readings })
    fill({ spo2: '987' })

    fireEvent.click(submitButton())

    await waitFor(() => expect(describedText(input('spo2'))).toBe(ES_REJECTED))
    const error = document.getElementById(input('spo2').getAttribute('aria-describedby'))
    expect(error.textContent).not.toContain('987')
    expect(document.body.textContent).not.toContain('QQ-SECRET')
    // The only place the value appears is the input the nurse typed into.
    expect(document.body.textContent).not.toContain('987')
    expect(input('spo2').value).toBe('987')
  })
})

describe('US-03 AC16 failed save keeps the form', () => {
  it.each([
    [404, ES_ERROR_NOT_FOUND],
    [409, ES_ERROR_DISCHARGED],
    [500, ES_ERROR_FAILED],
    [503, ES_ERROR_FAILED],
    [403, ES_NURSES_ONLY],
  ])('AC16 a %i answer shows its fixed message, keeps values, re-enables the button', async (status, message) => {
    const readings = vi.fn(async () => jsonResponse({ detail: 'QQ-SECRET server text' }, status))
    await openPage({ readings })
    fill()

    fireEvent.click(submitButton())

    expect((await screen.findByRole('alert')).textContent).toBe(message)
    expect(document.body.textContent).not.toContain('QQ-SECRET')
    expectValuesKept()
    expect(submitButton().disabled).toBe(false)
    expect(currentPath()).toBe(PATH)
  })

  it.each([
    ['network failure', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['timeout (aborted request)', () => Promise.reject(new DOMException('aborted', 'AbortError'))],
  ])('AC16 %s shows the failed message and keeps values', async (_label, handler) => {
    await openPage({ readings: handler })
    fill()

    fireEvent.click(submitButton())

    expect((await screen.findByRole('alert')).textContent).toBe(ES_ERROR_FAILED)
    expect(document.body.textContent).not.toContain('Failed to fetch')
    expectValuesKept()
    expect(submitButton().disabled).toBe(false)
  })

  it('AC16 the button is disabled while saving; a double click sends one request', async () => {
    const pending = deferredReadings()
    const readings = vi.fn(pending.handler)
    await openPage({ readings })
    fill()

    fireEvent.click(submitButton())
    fireEvent.click(submitButton())
    fireEvent.submit(submitButton().closest('form'))

    await waitFor(() => expect(readings).toHaveBeenCalledTimes(1))
    // The label stays "Guardar lectura" while saving.
    expect(submitButton().disabled).toBe(true)

    await act(async () => {
      pending.release(jsonResponse({}, 500))
    })

    expect((await screen.findByRole('alert')).textContent).toBe(ES_ERROR_FAILED)
    expect(submitButton().disabled).toBe(false)
    expect(readings).toHaveBeenCalledTimes(1)
  })

  it('AC16 after a failure, a second submit sends again and can succeed', async () => {
    let calls = 0
    const readings = vi.fn(async () => {
      calls += 1
      return calls === 1 ? jsonResponse({}, 500) : jsonResponse(EXAMPLE_READING, 201)
    })
    await openPage({ readings })
    fill()

    fireEvent.click(submitButton())
    await screen.findByRole('alert')
    fireEvent.click(submitButton())

    expect(await screen.findByRole('heading', { level: 2, name: ES_RESULT_TITLE })).toBeTruthy()
    expect(readings).toHaveBeenCalledTimes(2)
  })

  it('AC16 a 401 sends the user to /login and clears the session', async () => {
    const readings = vi.fn(async () => jsonResponse({ detail: 'Not authenticated' }, 401))
    await openPage({ readings })
    fill()

    fireEvent.click(submitButton())

    await waitFor(() => expect(currentPath()).toBe('/login'))
    expect(screen.getByRole('heading', { name: ES_LOGIN })).toBeTruthy()
    expect(getSession()).toBeNull()
    expect(screen.queryByLabelText(ES_LABELS.spo2)).toBeNull()
  })
})

describe('US-03 AC17 page protected and role-aware', () => {
  it('AC17 doctor sees the nurses-only message and the back link, no form', async () => {
    const fetchMock = await openPage({ user: DOCTOR })

    expect(screen.getByRole('heading', { level: 1, name: ES_TITLE })).toBeTruthy()
    expect(screen.getByText(ES_NURSES_ONLY)).toBeTruthy()
    expect(screen.getByRole('link', { name: ES_BACK }).getAttribute('href')).toBe('/patients/PAT-001')
    expect(document.querySelector('form')).toBeNull()
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: ES_SUBMIT })).toBeNull()
    expect(callsTo(fetchMock, READINGS_PATH)).toHaveLength(0)
  })

  it('AC17 the doctor back link opens the patient detail page', async () => {
    await openPage({ user: DOCTOR })

    fireEvent.click(screen.getByRole('link', { name: ES_BACK }))

    expect(currentPath()).toBe('/patients/PAT-001')
  })

  it('AC17 signed out visitor is sent to /login with no form', () => {
    const fetchMock = stubBackend()
    renderApp([PATH])

    expect(currentPath()).toBe('/login')
    expect(screen.getByRole('heading', { name: ES_LOGIN })).toBeTruthy()
    expect(screen.queryByText(ES_TITLE)).toBeNull()
    expect(screen.queryByLabelText(ES_LABELS.spo2)).toBeNull()
    expect(callsTo(fetchMock, READINGS_PATH)).toHaveLength(0)
  })
})

describe('US-03 AC20 English switch keeps typed values and the result', () => {
  it('AC20 labels, options and the submit button switch to English; typed values stay', async () => {
    await openPage()
    fill()

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Record vital signs · PAT-001' })).toBeTruthy()
    for (const field of TEXT_FIELDS) expect(input(field, EN_LABELS)).toBeTruthy()
    expect(within(group('on_oxygen', EN_LABELS)).getByLabelText('Yes')).toBeTruthy()
    expect(within(group('on_oxygen', EN_LABELS)).getByLabelText('No').checked).toBe(true)
    expect(within(group('consciousness', EN_LABELS)).getByLabelText('A — Alert').checked).toBe(true)
    expect(within(group('consciousness', EN_LABELS)).getByLabelText('U — Unresponsive')).toBeTruthy()
    expect(submitButton('Save reading')).toBeTruthy()
    expect(input('respiratory_rate', EN_LABELS).value).toBe('22')
    expect(input('temperature', EN_LABELS).value).toBe('38,4')
    expect(screen.queryByText(ES_LABELS.spo2)).toBeNull()
  })

  it('AC20 field messages switch language and stay on their fields', async () => {
    await openPage()
    fill({ respiratory_rate: '18.5', temperature: '37.25', heart_rate: '' })
    fireEvent.click(submitButton())

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    expect(describedText(input('respiratory_rate', EN_LABELS))).toBe('Enter a whole number.')
    expect(describedText(input('temperature', EN_LABELS))).toBe('Enter a number with at most one decimal.')
    expect(describedText(input('heart_rate', EN_LABELS))).toBe('Required field.')
    expect(input('respiratory_rate', EN_LABELS).value).toBe('18.5')
  })

  it('AC20 a general error message switches language', async () => {
    const readings = vi.fn(async () => jsonResponse({}, 409))
    await openPage({ readings })
    fill()
    fireEvent.click(submitButton())
    await screen.findByRole('alert')

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    expect(screen.getByRole('alert').textContent).toBe(
      'The patient is discharged; readings cannot be recorded.',
    )
  })

  it('AC20 a shown result stays and is shown in English after switching', async () => {
    const readings = vi.fn(async () => jsonResponse(EXAMPLE_READING, 201))
    await openPage({ readings })
    fill()
    fireEvent.click(submitButton())
    await screen.findByRole('heading', { level: 2, name: ES_RESULT_TITLE })

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    expect(screen.getByRole('heading', { level: 2, name: 'Reading saved' })).toBeTruthy()
    expect(screen.getByText('NEWS2 score: 5')).toBeTruthy()
    expect(screen.getByText('Risk band: Medium')).toBeTruthy()
    expect(screen.getByText('Respiratory rate (breaths/min)')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Record another reading' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to the patient' })).toBeTruthy()
    expect(readings).toHaveBeenCalledTimes(1)
  })

  it('AC20 doctor message in English', async () => {
    await openPage({ user: DOCTOR })

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    expect(screen.getByText('Only nurses can record vital signs.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to the patient' })).toBeTruthy()
  })
})
