'use client'
import { useRef, useState } from 'react'
import { Game } from '@/lib/types'

const LONG_PRESS_MS = 350

// Hover (desktop) or press-and-hold (touch) reveals where the estimate came
// from — a plain `title` attribute doesn't reliably show on a long press,
// so this is a small custom tooltip instead.
function HoldTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  const onTouchStart = (e: React.TouchEvent) => {
    // A plain span here would leave the covering card-link as the nearest
    // interactive ancestor, so a real long press opens the browser's own
    // link context menu instead of (or racing) this tooltip. A <button>
    // sidesteps that, the same way the card's other icon buttons already do.
    e.preventDefault()
    timer.current = setTimeout(() => setShow(true), LONG_PRESS_MS)
  }
  const onTouchEnd = () => { clearTimer(); setShow(false) }

  return (
    <button
      type="button"
      aria-label={label}
      className="relative z-10 inline-block cursor-default"
      onClick={e => e.preventDefault()}
      onContextMenu={e => e.preventDefault()}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {children}
      {show && (
        <span
          role="tooltip"
          className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-max max-w-[220px] whitespace-normal text-center text-[11px] leading-snug bg-[#1a1a1a] text-white px-2 py-1.5 rounded-md shadow-lg pointer-events-none">
          {label}
        </span>
      )}
    </button>
  )
}

export function progressLabel(progress: NonNullable<Game['progress']>): string {
  const { turnsSoFar, estimatedTotalTurns, sampleCount, sameSizeOnly } = progress
  const basis = sampleCount === 1 ? '1 finished game' : `${sampleCount} finished games`
  const qualifier = sameSizeOnly ? ' with the same player count' : ''
  return `Turn ${turnsSoFar} of an estimated ${estimatedTotalTurns} (median of ${basis} of this type${qualifier})`
}

// Muted — this isn't an alert, just a quiet way to tell "no estimate yet"
// (nothing shown, the normal case while samples build up) apart from "the
// last attempt to read this game's state actually failed" for whoever goes
// looking for why a bar isn't there.
function ProgressErrorHint({ error, compact }: { error: string; compact?: boolean }) {
  return (
    <HoldTooltip label={`Couldn't read this game's turn count: ${error}`}>
      <span className={`text-[#c5c5c5] ${compact ? 'text-[10px]' : 'text-xs'}`}>
        ⚠
      </span>
    </HoldTooltip>
  )
}

// Full-width bar for cards. `compact` renders a slim inline version for rows.
export default function ProgressBar({ game, compact }: { game: Game; compact?: boolean }) {
  const progress = game.progress
  if (!progress) return game.progressError ? <ProgressErrorHint error={game.progressError} compact={compact} /> : null
  const label = progressLabel(progress)

  if (compact) {
    return (
      <HoldTooltip label={label}>
        <span className="flex items-center gap-1 shrink-0">
          <span className="w-8 h-1 rounded-full bg-[#ececec] overflow-hidden">
            <span className="block h-full bg-[#5e6ad2]" style={{ width: `${progress.percent}%` }} />
          </span>
          <span className="text-[10px] tabular-nums text-[#9b9b9b]">{progress.percent}%</span>
        </span>
      </HoldTooltip>
    )
  }

  return (
    <HoldTooltip label={label}>
      <span className="flex items-center gap-1.5">
        <span className="flex-1 h-1.5 rounded-full bg-[#ececec] overflow-hidden min-w-[60px]">
          <span className="block h-full bg-[#5e6ad2]" style={{ width: `${progress.percent}%` }} />
        </span>
        <span className="text-[10px] tabular-nums text-[#9b9b9b]">{progress.percent}%</span>
      </span>
    </HoldTooltip>
  )
}
