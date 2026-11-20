// TS-12 Card: AC8 — token surface with optional heading; headingLevel 2 default and clamp;
// no heading without title. Synthetic props only; no network/backend.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Card from './Card.jsx'

describe('TS-12 Card (AC8)', () => {
  it('AC8: with a title renders a default level-2 heading and shows the content', () => {
    render(
      <Card title="Resumen">
        <p>Contenido</p>
      </Card>,
    )

    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading.textContent).toBe('Resumen')

    const content = screen.getByText('Contenido')
    expect(content).not.toBeNull()
    // Content sits inside the card container (same div as the heading).
    expect(heading.parentElement).toBe(content.parentElement)
  })

  it('AC8: headingLevel={3} renders a level-3 heading and no level-2 heading', () => {
    render(
      <Card title="T" headingLevel={3}>
        <p>Contenido</p>
      </Card>,
    )

    expect(screen.getByRole('heading', { level: 3 }).tagName).toBe('H3')
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
  })

  it('AC8: invalid headingLevel={1} falls back to level 2', () => {
    render(<Card title="T" headingLevel={1} />)

    expect(screen.getByRole('heading', { level: 2 }).tagName).toBe('H2')
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  it('AC8: invalid headingLevel={7} falls back to level 2', () => {
    render(<Card title="T" headingLevel={7} />)

    // 7 is not valid HTML; the single rendered heading must be an h2.
    const headings = screen.getAllByRole('heading')
    expect(headings).toHaveLength(1)
    expect(headings[0]).toBe(screen.getByRole('heading', { level: 2 }))
    expect(headings[0].tagName).toBe('H2')
  })

  it("AC8: invalid headingLevel={'x'} falls back to level 2", () => {
    render(<Card title="T" headingLevel="x" />)

    expect(screen.getByRole('heading', { level: 2 }).tagName).toBe('H2')
  })

  it('AC8: without a title renders no heading but still shows the content', () => {
    render(
      <Card>
        <p>Solo contenido</p>
      </Card>,
    )

    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.getByText('Solo contenido')).not.toBeNull()
  })
})
