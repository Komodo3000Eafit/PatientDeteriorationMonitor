// US-03 change request 2026-11-20: RiskBandBadge shows the stored risk band with color, a
// decorative icon and a text label (AC21, AC20, FR-023), following
// specs/017-vital-signs-scoring/contracts/ui.md "Risk band badge". Synthetic band values only.
//
// Exact texts copied from frontend/src/i18n/translations.js:
//   riskBand.low / low-medium / medium / high / unknown
//     es 'Baja' / 'Baja-media' / 'Media' / 'Alta' / 'Desconocida'
//     en 'Low' / 'Low-medium' / 'Medium' / 'High' / 'Unknown'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext.jsx'
import RiskBandBadge from './RiskBandBadge.jsx'

const BANDS = ['low', 'low-medium', 'medium', 'high']
const ES_LABELS = ['Baja', 'Baja-media', 'Media', 'Alta']
const EN_LABELS = ['Low', 'Low-medium', 'Medium', 'High']

function SwitchToEnglish() {
  const { setLang } = useLanguage()
  return (
    <button type="button" onClick={() => setLang('en')}>
      switch-en
    </button>
  )
}

function renderBadge(band) {
  const { container } = render(
    <LanguageProvider>
      <SwitchToEnglish />
      <RiskBandBadge band={band} />
    </LanguageProvider>,
  )
  // The outer badge span is the only top-level span in the container.
  return container.querySelector(':scope > span')
}

afterEach(() => {
  localStorage.clear()
  document.documentElement.lang = 'es'
})

describe('US-03 AC21 RiskBandBadge', () => {
  it.each(BANDS.map((band, i) => [band, ES_LABELS[i]]))(
    'AC21 band "%s" shows the Spanish label "%s" and one aria-hidden svg',
    (band, label) => {
      const badge = renderBadge(band)

      expect(badge.textContent).toBe(label)
      expect(screen.getByText(label)).toBeTruthy()
      const svgs = badge.querySelectorAll('svg')
      expect(svgs).toHaveLength(1)
      expect(svgs[0].getAttribute('aria-hidden')).toBe('true')
      expect(svgs[0].getAttribute('focusable')).toBe('false')
    },
  )

  it('AC21 each band has a distinct class and a distinct icon', () => {
    const classes = []
    const icons = []
    for (const band of BANDS) {
      const { container, unmount } = render(
        <LanguageProvider>
          <RiskBandBadge band={band} />
        </LanguageProvider>,
      )
      const badge = container.querySelector(':scope > span')
      classes.push(badge.className)
      icons.push(badge.querySelector('svg').getAttribute('class'))
      unmount()
    }
    expect(new Set(classes).size).toBe(4)
    expect(new Set(icons).size).toBe(4)
  })

  it.each([
    ['undefined', undefined],
    ['"x"', 'x'],
  ])('AC21 unknown band %s shows "Desconocida" with an aria-hidden svg', (_label, band) => {
    const badge = renderBadge(band)

    expect(badge.textContent).toBe('Desconocida')
    const svg = badge.querySelector('svg')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
  })

  it('AC21 the unknown style differs from every band style', () => {
    const unknownClass = renderBadge('x').className
    for (const band of BANDS) {
      const { container, unmount } = render(
        <LanguageProvider>
          <RiskBandBadge band={band} />
        </LanguageProvider>,
      )
      expect(container.querySelector(':scope > span').className).not.toBe(unknownClass)
      unmount()
    }
  })

  it('AC21 the svg has no accessible text; the label is the only text', () => {
    const badge = renderBadge('high')
    const svg = badge.querySelector('svg')
    expect(svg.textContent).toBe('')
    expect(svg.querySelector('title')).toBeNull()
  })
})

describe('US-03 AC20/AC21 RiskBandBadge in English', () => {
  it.each(BANDS.map((band, i) => [band, ES_LABELS[i], EN_LABELS[i]]))(
    'AC20 band "%s" switches from "%s" to "%s"',
    (band, esLabel, enLabel) => {
      const badge = renderBadge(band)
      expect(badge.textContent).toBe(esLabel)

      fireEvent.click(screen.getByRole('button', { name: 'switch-en' }))

      expect(badge.textContent).toBe(enLabel)
    },
  )

  it('AC20 unknown band shows "Unknown" after switching', () => {
    const badge = renderBadge(undefined)

    fireEvent.click(screen.getByRole('button', { name: 'switch-en' }))

    expect(badge.textContent).toBe('Unknown')
  })
})
