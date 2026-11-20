// TS-12 TriageLevelBadge: AC7 (levels 1-5 as Triage I-V, invalid->no level, neutral, no icon), AC12 (es/en).
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LanguageProvider } from '../i18n/LanguageContext.jsx'
import TriageLevelBadge from './TriageLevelBadge.jsx'

// Triage I..V are identical in Spanish and English; the "no level" text differs.
const LEVEL_LABELS = ['Triage I', 'Triage II', 'Triage III', 'Triage IV', 'Triage V']
const INVALID_VALUES = [0, 6, 2.5, '3', null, undefined, NaN]

// LanguageProvider reads localStorage['pdm.language'] at mount: 'en' for English, cleared for Spanish.
function renderBadge(level) {
  const { container } = render(
    <LanguageProvider>
      <TriageLevelBadge level={level} />
    </LanguageProvider>,
  )
  return container
}

describe('TS-12 TriageLevelBadge (AC7, AC12)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  // AC7 + AC12: valid levels 1..5 render Triage I..V in Spanish (default, no stored language).
  LEVEL_LABELS.forEach((expected, index) => {
    const level = index + 1
    it(`AC7/AC12: level ${level} shows "${expected}" in Spanish`, () => {
      renderBadge(level)
      expect(screen.getByText(expected)).not.toBeNull()
    })
  })

  // AC7 + AC12: valid levels 1..5 render the same Triage I..V labels in English.
  LEVEL_LABELS.forEach((expected, index) => {
    const level = index + 1
    it(`AC7/AC12: level ${level} shows "${expected}" in English`, () => {
      localStorage.setItem('pdm.language', 'en')
      renderBadge(level)
      expect(screen.getByText(expected)).not.toBeNull()
    })
  })

  // AC7 + AC12: invalid values fall back to the "no level" text in Spanish and show no Triage label.
  INVALID_VALUES.forEach((value) => {
    it(`AC7/AC12: invalid value ${String(value)} shows "Sin nivel" (es) and no Triage label`, () => {
      renderBadge(value)
      expect(screen.getByText('Sin nivel')).not.toBeNull()
      expect(screen.queryByText(/^Triage/)).toBeNull()
    })
  })

  // AC12: invalid values fall back to the "no level" text in English.
  INVALID_VALUES.forEach((value) => {
    it(`AC12: invalid value ${String(value)} shows "No level" in English`, () => {
      localStorage.setItem('pdm.language', 'en')
      renderBadge(value)
      expect(screen.getByText('No level')).not.toBeNull()
    })
  })

  // AC7: the badge is neutral and renders no icon.
  it('AC7: a valid badge (level 3) renders no svg icon', () => {
    const container = renderBadge(3)
    expect(container.querySelector('svg')).toBeNull()
  })
})
