'use client'
import { useState } from 'react'

// Hover (desktop) or a tap (touch) reveals extra detail behind a small
// label or badge — a plain `title` attribute doesn't reliably show on
// touch, so this is a small custom tooltip instead. `ariaLabel` carries the
// full sentence for screen readers; `tooltip` is whatever's shown visually,
// which can be richer (e.g. a bulleted basis) without changing what's
// announced.
//
// A tap toggles it, rather than the long-press this used to require: a long
// press is easy to cut short by the slightest finger movement, which cancels
// it and lets the tap fall through to whatever's underneath instead (e.g. a
// card-opening link) — the exact "I'm trying to peek at this and it opens
// the game" complaint this replaced. A plain tap/click always registers.
// stopPropagation is extra insurance alongside the z-index stacking (below)
// for a near-miss that still partly overlaps the link.
//
// Hover is gated to pointerType 'mouse' (Pointer Events, not Mouse Events) —
// a touch tap also fires synthetic mouse events afterward, which would show
// it a beat before the click's toggle immediately flips it straight back
// off. Plain mouse events can't tell a real hover from that synthetic one;
// Pointer Events can.
export default function HoldTooltip({ ariaLabel, tooltip, children }: { ariaLabel: string; tooltip: React.ReactNode; children: React.ReactNode }) {
  const [show, setShow] = useState(false)

  const toggle = (e: React.SyntheticEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShow(s => !s)
  }
  const onPointerEnter = (e: React.PointerEvent) => { if (e.pointerType === 'mouse') setShow(true) }
  const onPointerLeave = (e: React.PointerEvent) => { if (e.pointerType === 'mouse') setShow(false) }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-expanded={show}
      // Padding + matching negative margin widens the actual tap/click
      // target well past the tiny label/badge, without changing its visible
      // size or nudging the surrounding layout.
      className="relative z-10 inline-block cursor-default -m-1.5 p-1.5"
      onClick={toggle}
      onContextMenu={e => e.preventDefault()}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {children}
      {show && (
        <span
          role="tooltip"
          className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-max max-w-[300px] whitespace-normal text-center text-[11px] leading-snug bg-[#1a1a1a] text-white px-2 py-1.5 rounded-md shadow-lg pointer-events-none">
          {tooltip}
        </span>
      )}
    </button>
  )
}
