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
  const onTouchStart = () => { timer.current = setTimeout(() => setShow(true), LONG_PRESS_MS) }
  const onTouchEnd = () => { clearTimer(); setShow(false) }

  return (
    <span
      className="relative z-10 inline-block"
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
    </span>
  )
}

export function progressLabel(progress: NonNullable<Game['progress']>): string {
  const { turnsSoFar, estimatedTotalTurns, sampleCount } = progress
  const basis = sampleCount === 1 ? '1 finished game' : `${sampleCount} finished games`
  return `Turn ${turnsSoFar} of an estimated ${estimatedTotalTurns} (median of ${basis} of this type)`
}

// Full-width bar for cards. `compact` renders a slim inline version for rows.
export default function ProgressBar({ game, compact }: { game: Game; compact?: boolean }) {
  const progress = game.progress
  if (!progress) return null
  const label = progressLabel(progress)

  if (compact) {
    return (
      <HoldTooltip label={label}>
        <span aria-label={label} className="flex items-center gap-1 shrink-0">
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
      <span aria-label={label} className="flex items-center gap-1.5">
        <span className="flex-1 h-1.5 rounded-full bg-[#ececec] overflow-hidden min-w-[60px]">
          <span className="block h-full bg-[#5e6ad2]" style={{ width: `${progress.percent}%` }} />
        </span>
        <span className="text-[10px] tabular-nums text-[#9b9b9b]">{progress.percent}%</span>
      </span>
    </HoldTooltip>
  )
}
