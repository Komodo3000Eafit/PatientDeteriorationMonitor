import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

// jsdom has no canvas: its getContext logs "Not implemented" and returns null, so any test that
// renders a real chart (US-06, D-53) would print errors. This minimal stub returns a no-op 2D
// context: every method does nothing, measureText reports width 0. Test setup only.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function getContext() {
    const canvas = this
    return new Proxy(
      {},
      {
        get(target, prop) {
          if (typeof prop !== 'string' || prop in target) return target[prop]
          if (prop === 'canvas') return canvas
          if (prop === 'then') return undefined
          if (prop === 'measureText') return () => ({ width: 0 })
          return () => {}
        },
        set(target, prop, value) {
          target[prop] = value
          return true
        },
      },
    )
  }
}
