// US-03 ReadingResult tests: AC14 (stored result with the reason for each point) and AC20 (Spanish
// by default, English after switching), following specs/017-vital-signs-scoring/contracts/ui.md
// "Result view" and the contract example reading in contracts/readings-api.md (total 5, band
// medium, seven entries). Everything shown comes from the answer. Synthetic data only.
//
// Exact texts copied from frontend/src/i18n/translations.js:
//   recordReading.resultTitle  'Lectura guardada'      / 'Reading saved'
//   recordReading.score        'Puntaje NEWS2'         / 'NEWS2 score'
//   recordReading.band         'Banda de riesgo'       / 'Risk band'
//   recordReading.parameter    'Parámetro'             / 'Parameter'
//   recordReading.value        'Valor'                 / 'Value'
//   recordReading.points       'Puntos'                / 'Points'
//   recordReading.reason       'Motivo'                / 'Reason'
//   riskBand.medium            'Media'                 / 'Medium'
//   parameter.*                see ES_ROWS / EN_ROWS below
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext.jsx'
import ReadingResult from './ReadingResult.jsx'

// The contract example reading (contracts/readings-api.md).
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

// [parameter name, value, points, reason] per row, in contract order.
const ES_ROWS = [
  ['Frecuencia respiratoria (resp/min)', '22', '2', '21–24'],
  ['Saturación de oxígeno SpO2 (%)', '95', '1', '94–95'],
  ['Oxígeno suplementario', 'No', '0', 'No'],
  ['Presión arterial sistólica (mmHg)', '118', '0', '111–219'],
  ['Frecuencia cardiaca (lpm)', '96', '1', '91–110'],
  ['Nivel de conciencia (ACVPU)', 'A — Alerta', '0', 'A'],
  ['Temperatura (°C)', '38.4', '1', '38.1–39.0'],
]
const EN_ROWS = [
  ['Respiratory rate (breaths/min)', '22', '2', '21–24'],
  ['Oxygen saturation SpO2 (%)', '95', '1', '94–95'],
  ['Supplemental oxygen', 'No', '0', 'No'],
  ['Systolic blood pressure (mmHg)', '118', '0', '111–219'],
  ['Heart rate (bpm)', '96', '1', '91–110'],
  ['Level of consciousness (ACVPU)', 'A — Alert', '0', 'A'],
  ['Temperature (°C)', '38.4', '1', '38.1–39.0'],
]

function SwitchToEnglish() {
  const { setLang } = useLanguage()
  return (
    <button type="button" onClick={() => setLang('en')}>
      switch-en
    </button>
  )
}

function renderResult(reading = EXAMPLE_READING) {
  return render(
    <LanguageProvider>
      <SwitchToEnglish />
      <ReadingResult reading={reading} />
    </LanguageProvider>,
  )
}

function bodyRows() {
  const table = screen.getByRole('table')
  const [, body] = within(table).getAllByRole('rowgroup')
  return within(body).getAllByRole('row')
}

function rowTexts() {
  return bodyRows().map((row) => [
    within(row).getByRole('rowheader').textContent,
    ...within(row)
      .getAllByRole('cell')
      .map((cell) => cell.textContent),
  ])
}

function headerTexts() {
  return within(screen.getByRole('table'))
    .getAllByRole('columnheader')
    .map((cell) => cell.textContent)
}

afterEach(() => {
  localStorage.clear()
  document.documentElement.lang = 'es'
})

describe('US-03 AC14 result from the contract example (Spanish)', () => {
  it('AC14 shows the heading, "Puntaje NEWS2: 5" and "Banda de riesgo: Media"', () => {
    renderResult()

    expect(screen.getByRole('heading', { level: 2, name: 'Lectura guardada' })).toBeTruthy()
    expect(screen.getByText('Puntaje NEWS2: 5')).toBeTruthy()
    expect(screen.getByText('Banda de riesgo: Media')).toBeTruthy()
  })

  it('AC14 the table has the four Spanish column headers', () => {
    renderResult()

    expect(headerTexts()).toEqual(['Parámetro', 'Valor', 'Puntos', 'Motivo'])
  })

  it('AC14 seven rows in order with parameter name, value, points and reason', () => {
    renderResult()

    expect(bodyRows()).toHaveLength(7)
    expect(rowTexts()).toEqual(ES_ROWS)
  })

  it('AC14 shows the stored score and band as received, never recomputed', () => {
    // Deliberately inconsistent synthetic answer: the page must show what it received.
    renderResult({ ...EXAMPLE_READING, score: { ...EXAMPLE_READING.score, total: 9, band: 'low' } })

    expect(screen.getByText('Puntaje NEWS2: 9')).toBeTruthy()
    expect(screen.getByText('Banda de riesgo: Baja')).toBeTruthy()
    expect(screen.queryByText('Puntaje NEWS2: 5')).toBeNull()
  })

  it('AC14 shows recorded_at as a local date-time, not the raw ISO text', () => {
    renderResult()

    expect(screen.queryByText(EXAMPLE_READING.recorded_at)).toBeNull()
    const expected = new Date(EXAMPLE_READING.recorded_at).toLocaleString('es')
    expect(screen.getByText(expected)).toBeTruthy()
  })
})

describe('US-03 AC20 result in English after switching', () => {
  it('AC20 heading, score, band, headers and the seven rows are in English', () => {
    renderResult()

    fireEvent.click(screen.getByRole('button', { name: 'switch-en' }))

    expect(screen.getByRole('heading', { level: 2, name: 'Reading saved' })).toBeTruthy()
    expect(screen.getByText('NEWS2 score: 5')).toBeTruthy()
    expect(screen.getByText('Risk band: Medium')).toBeTruthy()
    expect(headerTexts()).toEqual(['Parameter', 'Value', 'Points', 'Reason'])
    expect(rowTexts()).toEqual(EN_ROWS)
    expect(screen.getByText('Respiratory rate (breaths/min)')).toBeTruthy()
    expect(screen.queryByText('Puntaje NEWS2: 5')).toBeNull()
    expect(screen.queryByText('Banda de riesgo: Media')).toBeNull()
  })

  it('AC20 on oxygen true shows "Sí" in Spanish and "Yes" in English', () => {
    const entries = EXAMPLE_READING.score.entries.map((e) =>
      e.parameter === 'on_oxygen' ? { ...e, value: true, points: 2, category: [true] } : e,
    )
    renderResult({ ...EXAMPLE_READING, on_oxygen: true, score: { ...EXAMPLE_READING.score, entries } })

    expect(rowTexts()[2]).toEqual(['Oxígeno suplementario', 'Sí', '2', 'Sí'])

    fireEvent.click(screen.getByRole('button', { name: 'switch-en' }))

    expect(rowTexts()[2]).toEqual(['Supplemental oxygen', 'Yes', '2', 'Yes'])
  })
})
