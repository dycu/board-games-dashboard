import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util'
import { webcrypto } from 'crypto'
Object.assign(global, { TextEncoder, TextDecoder })
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true, writable: true })

// jsdom doesn't implement matchMedia at all — components that branch on
// pointer/color-scheme media queries (PlayerHoverCard's touch detection,
// among others) would throw without this. Defaults to "doesn't match"
// (mouse/desktop, light scheme); tests that need the other branch call
// window.matchMedia(...).matches = true themselves via a spy. Guarded:
// this file runs for every test file regardless of its own
// testEnvironment, and connector/route tests run under 'node', which has
// no window at all.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}
