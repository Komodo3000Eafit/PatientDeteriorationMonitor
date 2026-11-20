// TS-12 Button: AC8 — token button, default non-submit, variants, focusable native button, disabled, pass-through props, ignores caller className/style.
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import Button from './Button'

describe('Button (TS-12 AC8)', () => {
  // AC8: default type is a non-submit 'button'
  it('defaults type to "button"', () => {
    render(<Button>Save</Button>)
    const button = screen.getByRole('button')
    expect(button.getAttribute('type')).toBe('button')
  })

  // AC8: an explicit type="submit" is respected
  it('respects type="submit"', () => {
    render(<Button type="submit">Save</Button>)
    const button = screen.getByRole('button')
    expect(button.getAttribute('type')).toBe('submit')
  })

  // AC8: primary is the default variant and an unknown variant falls back to primary
  it('uses primary by default and falls back to primary for an unknown variant', () => {
    render(<Button>Default</Button>)
    render(<Button variant="nonsense">Unknown</Button>)
    render(<Button variant="secondary">Secondary</Button>)

    const buttons = screen.getAllByRole('button')
    const defaultButton = buttons[0]
    const unknownButton = buttons[1]
    const secondaryButton = buttons[2]

    expect(defaultButton.className).toContain('primary')
    expect(defaultButton.className).not.toContain('secondary')

    expect(unknownButton.className).toContain('primary')
    expect(unknownButton.className).not.toContain('secondary')

    // control: an explicit secondary variant carries the secondary class
    expect(secondaryButton.className).toContain('secondary')
  })

  // AC8: onClick fires on click
  it('fires onClick when clicked', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  // AC8: renders a real, focusable native <button>
  it('renders a focusable native button', () => {
    render(<Button>Save</Button>)
    const button = screen.getByRole('button')
    button.focus()
    expect(document.activeElement).toBe(button)
    expect(button.tagName).toBe('BUTTON')
  })

  // AC8: a disabled button is disabled and runs no onClick
  it('does not fire onClick and is disabled when disabled', () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    )
    const button = screen.getByRole('button')
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  // AC8: aria-pressed and aria-label pass through
  it('passes through aria-pressed and aria-label', () => {
    render(
      <Button aria-pressed={true} aria-label="Español">
        ES
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Español' })
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.getAttribute('aria-label')).toBe('Español')
  })

  // AC8: caller className and style are ignored (rest-first spread order)
  it('ignores caller className and style', () => {
    render(
      <Button className="caller-xyz" style={{ color: 'red' }}>
        Save
      </Button>,
    )
    const button = screen.getByRole('button')
    expect(button.className).not.toContain('caller-xyz')
    const style = button.getAttribute('style')
    expect(style === null || style === '').toBe(true)
  })
})
