// @formkit/auto-animate ships ESM-only, which Jest can't load as-is (see
// next/jest's default transformIgnorePatterns) — and its actual animation
// is irrelevant under jsdom anyway, since nothing there measures layout.
// A manual mock (this file, auto-applied for every test since it's a
// node_modules package — see Jest's docs on manual mocks) keeps the real
// hook's shape (a ref tuple) without needing the real implementation.
import { useRef, type RefObject } from 'react'

export function useAutoAnimate<T extends Element = Element>(): [RefObject<T | null>, () => void] {
  const ref = useRef<T | null>(null)
  return [ref, () => {}]
}
