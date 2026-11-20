// TS-12 StatusBadge: AC5 (color+icon+label, icon aria-hidden, distinct icons), AC6 (unknown->no_data), AC12 (es/en labels).
// Synthetic data only; no backend and no network. LanguageProvider reads the initial language
// from localStorage['pdm.language'] at mount ('es' or 'en', else Spanish), matching
// i18n/language.test.jsx and auth/auth.test.jsx.
import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { LanguageProvider } from '../i18n/LanguageContext.jsx'
import StatusBadge from './StatusBadge.jsx'

const STATUSES = ['stable', 'warning', 'critical', 'no_data']
const ES_LABELS = ['Estable', 'Vigilar', 'Crítico', 'Sin datos']
const EN_LABELS = ['Stable', 'Watch', 'Critical', 'No data']

// Renders the badge inside LanguageProvider and returns { container, badge } where badge is the
// outer <span>. The language is taken from localStorage at mount, so callers set it beforehand.
function renderBadge(status) {
  const { container } = render(
    <LanguageProvider>
      <StatusBadge monitoringStatus={status} />
    </LanguageProvider>,
  )
  return { container, badge: container.querySelector('span') }
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('TS-12 StatusBadge', () => {
  // AC5 / AC12: Spanish is the default (localStorage cleared); each status shows its es label.
  it.each(STATUSES.map((status, i) => [status, ES_LABELS[i]]))(
    'AC5 AC12 Spanish label for %s is %s',
    (status, label) => {
      renderBadge(status)
      expect(screen.getByText(label)).toBeTruthy()
    },
  )

  // AC5: exactly one decorative icon per badge; the svg is aria-hidden so it stays out of the
  // accessibility tree and meaning comes from the label.
  it.each(STATUSES)('AC5 %s renders exactly one aria-hidden svg icon', (status) => {
    const { container } = renderBadge(status)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelectorAll('svg')).toHaveLength(1)
  })

  // AC5: each status must use a visually distinct icon. Compare the svg markup across all four.
  it('AC5 the four statuses use distinct icons', () => {
    const markups = STATUSES.map((status) => {
      const { container } = renderBadge(status)
      return container.querySelector('svg').outerHTML
    })
    expect(markups).toHaveLength(4)
    expect(new Set(markups).size).toBe(4)
  })

  // AC12: switching to English via localStorage before mount yields the English labels.
  it.each(STATUSES.map((status, i) => [status, EN_LABELS[i]]))(
    'AC12 English label for %s is %s',
    (status, label) => {
      localStorage.setItem('pdm.language', 'en')
      renderBadge(status)
      expect(screen.getByText(label)).toBeTruthy()
    },
  )

  // AC6: any value that is not one of the four statuses falls back to 'no_data' (Sin datos in
  // Spanish) and must never show 'Estable' nor crash.
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
    ['uppercase STABLE', 'STABLE'],
    ['arbitrary unknown', 'unknown'],
  ])('AC6 %s falls back to Sin datos (never Estable)', (_name, value) => {
    expect(() => renderBadge(value)).not.toThrow()
    expect(screen.getByText('Sin datos')).toBeTruthy()
    expect(screen.queryByText('Estable')).toBeNull()
  })
})
