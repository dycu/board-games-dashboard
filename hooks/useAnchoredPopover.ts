'use client'
import { useEffect, useRef, useState, type RefObject } from 'react'

const MARGIN = 8

export interface AnchoredPopoverOptions {
  width?: number
  // No real content height to measure against yet at the point this
  // decides whether to flip above the trigger — a generous estimate errs
  // toward flipping a little too early rather than too late, which would
  // run the panel off the bottom of the screen instead.
  heightEstimate?: number
}

// Positions a popover panel against a trigger element (anchorRef) — below
// it by default, flipped above when it wouldn't fit, clamped horizontally
// to stay on screen — and closes it on Escape, a click anywhere outside
// both the trigger and the panel, or scrolling (simpler and more correct
// than continuously tracking the trigger to a new position). Shared by
// every anchored popover in this app (TableMovesPopup, TodayMovesPopup)
// instead of each re-implementing the same positioning/closing logic.
export function useAnchoredPopover(anchorRef: RefObject<HTMLElement | null>, onClose: () => void, options: AnchoredPopoverOptions = {}) {
  const width = options.width ?? 320
  const heightEstimate = options.heightEstimate ?? 260
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const left = Math.min(Math.max(rect.left, MARGIN), window.innerWidth - width - MARGIN)
    const fitsBelow = rect.bottom + 6 + heightEstimate <= window.innerHeight
    const top = fitsBelow ? rect.bottom + 6 : Math.max(MARGIN, rect.top - heightEstimate - 6)
    setPos({ top, left })
  }, [anchorRef, width, heightEstimate])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }
    // A scrollable panel (TodayMovesPopup's own list) fires 'scroll' events
    // that capture through window just like the page behind it would — only
    // the latter means the trigger moved out from under the panel, so only
    // that one should close it.
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && panelRef.current?.contains(e.target)) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('scroll', onScroll, { capture: true })
    }
  }, [onClose, anchorRef])

  return { panelRef, pos, width, margin: MARGIN }
}
