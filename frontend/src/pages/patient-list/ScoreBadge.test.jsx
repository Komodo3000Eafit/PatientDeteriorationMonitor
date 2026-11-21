// US-02 change request 2026-11-21: ScoreBadge shows the latest NEWS2 total and its stored risk band
// in one pill (AC6, FR-007, AC15), following specs/016-patient-list/contracts/ui.md
// "Score badge (ScoreBadge)". The tone comes from bandStatus (utils/bandStatus.js) and uses the same
// tone class names as RiskBandBadge (US-03). Synthetic totals and bands only.
//
// Exact texts copied from frontend/src/i18n/translations.js:
//   patientList.scoreLabel  es 'Puntaje NEWS2 {score}, riesgo {band}'  en 'NEWS2 score {score}, risk {band}'
//   riskBand.low / low-medium / medium / high / unknown
//     es 'Baja' / 'Baja-media' / 'Media' / 'Alta' / 'Desconocida'
//     en 'Low' / 'Low-medium' / 'Medium' / 'High' / 'Unknown'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext.jsx'
import ScoreBadge from './ScoreBadge.jsx'

const TONES = ['stable', 'warning', 'band-medium', 'critical', 'no-data']

// [band, total, expected tone, es label, en label]
const CASES = [
  ['low', 0, 'stable', 'Baja', 'Low'],
  ['low-medium', 3, 'warning', 'Baja-media', 'Low-medium'],
  ['medium', 6, 'band-medium', 'Media', 'Medium'],
  ['high', 19, 'critical', 'Alta', 'High'],
  ['bogus', 3, 'no-data', 'Desconocida', 'Unknown'],
  [undefined, 20, 'no-data', 'Desconocida', 'Unknown'],
]

function SwitchToEnglish() {
  const { setLang } = useLanguage()
  return (
    <button type="button" onClick={() => setLang('en')}>
      switch-en
    </button>
  )
}

function renderBadge(total, band) {
  render(
    <LanguageProvider>
      <SwitchToEnglish />
      <ScoreBadge total={total} band={band} />
    </LanguageProvider>,
  )
  return screen.getByRole('img')
}

// CSS module class names are scoped in vitest (e.g. "_critical_ab12c"), so match the tone name
// as a whole segment of a class.
function toneClasses(element) {
  return TONES.filter((tone) =>
    element.className
      .split(/\s+/)
      .some((cls) => cls === tone || new RegExp(`(^|_)${tone}(_|$)`).test(cls)),
  )
}

afterEach(() => {
  localStorage.clear()
  document.documentElement.lang = 'es'
})

describe('US-02 AC6 FR-007 ScoreBadge in Spanish', () => {
  it.each(CASES)(
    'band %s with total %s has tone "%s" and shows "{total} · %s"',
    (band, total, tone, esLabel) => {
      const badge = renderBadge(total, band)

      expect(badge.textContent).toBe(`${total} · ${esLabel}`)
      expect(badge.getAttribute('aria-label')).toBe(`Puntaje NEWS2 ${total}, riesgo ${esLabel}`)
      expect(screen.getByRole('img', { name: `Puntaje NEWS2 ${total}, riesgo ${esLabel}` })).toBe(
        badge,
      )
      expect(toneClasses(badge)).toEqual([tone])
    },
  )

  it('the example "19 · Alta" is named "Puntaje NEWS2 19, riesgo Alta"', () => {
    const badge = renderBadge(19, 'high')
    expect(badge.textContent).toBe('19 · Alta')
    expect(screen.getByRole('img', { name: 'Puntaje NEWS2 19, riesgo Alta' })).toBe(badge)
  })

  it.each(CASES)('band %s: one decorative svg, aria-hidden and not focusable', (band, total) => {
    const badge = renderBadge(total, band)

    const svgs = badge.querySelectorAll('svg')
    expect(svgs).toHaveLength(1)
    expect(svgs[0].getAttribute('aria-hidden')).toBe('true')
    expect(svgs[0].getAttribute('focusable')).toBe('false')
    expect(svgs[0].textContent).toBe('')
    expect(svgs[0].querySelector('title')).toBeNull()
  })

  it('each known band has a distinct tone class and icon; unknown differs from all of them', () => {
    const classes = []
    const icons = []
    for (const [band, total] of CASES.slice(0, 5)) {
      const { unmount } = render(
        <LanguageProvider>
          <ScoreBadge total={total} band={band} />
        </LanguageProvider>,
      )
      const badge = screen.getByRole('img')
      classes.push(badge.className)
      icons.push(badge.querySelector('svg').getAttribute('class'))
      unmount()
    }
    expect(new Set(classes).size).toBe(5)
    expect(new Set(icons).size).toBe(5)
  })
})

describe('US-02 AC15 ScoreBadge in English', () => {
  it.each(CASES)(
    'band %s with total %s switches to "{total} · %s"-style English text',
    (band, total, tone, esLabel, enLabel) => {
      const badge = renderBadge(total, band)
      expect(badge.textContent).toBe(`${total} · ${esLabel}`)

      fireEvent.click(screen.getByRole('button', { name: 'switch-en' }))

      expect(badge.textContent).toBe(`${total} · ${enLabel}`)
      expect(screen.getByRole('img', { name: `NEWS2 score ${total}, risk ${enLabel}` })).toBe(badge)
      expect(toneClasses(badge)).toEqual([tone])
      const svg = badge.querySelector('svg')
      expect(svg.getAttribute('aria-hidden')).toBe('true')
      expect(svg.getAttribute('focusable')).toBe('false')
    },
  )

  it('the example "19 · High" is named "NEWS2 score 19, risk High"', () => {
    const badge = renderBadge(19, 'high')
    fireEvent.click(screen.getByRole('button', { name: 'switch-en' }))
    expect(badge.textContent).toBe('19 · High')
    expect(screen.getByRole('img', { name: 'NEWS2 score 19, risk High' })).toBe(badge)
  })
})
