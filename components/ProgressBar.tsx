'use client'
import { useRef, useState } from 'react'
import { Game, Platform } from '@/lib/types'

// What we're actually counting differs by platform: BGA's and Rally's own
// data calls it a turn, but 18xx's number is its action log length (every
// bid, placement, etc.) — calling that a "turn" reads as wrong, especially
// since 18xx separately has its own much coarser "turn" (a whole stock +
// operating round cycle) that this isn't.
const UNIT_WORD: Partial<Record<Platform, string>> = { eighteenxx: 'move' }
function unitWord(platform: Platform, capitalize = false): string {
  const word = UNIT_WORD[platform] ?? 'turn'
  return capitalize ? word[0].toUpperCase() + word.slice(1) : word
}

const LONG_PRESS_MS = 350

function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'}`
  const hours = Math.floor(seconds / 3600)
  if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'}`
  const minutes = Math.max(1, Math.floor(seconds / 60))
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}

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

export function progressLabel(platform: Platform, progress: NonNullable<Game['progress']>): string {
  const { turnsSoFar, estimatedTotalTurns, sampleCount, sameSizeOnly, exact, timeBased } = progress
  const basis = sampleCount === 1 ? '1 finished game' : `${sampleCount} finished games`
  const qualifier = sameSizeOnly ? ' with the same player count' : ''
  if (timeBased) {
    return `Time-based estimate: ~${formatDuration(turnsSoFar)} in, typically takes about ${formatDuration(estimatedTotalTurns)} (median of ${basis}${qualifier})`
  }
  const unit = unitWord(platform, true)
  if (exact) return `${unit} ${turnsSoFar} of ${estimatedTotalTurns} (reported by the game itself)`
  return `${unit} ${turnsSoFar} of an estimated ${estimatedTotalTurns} (median of ${basis} of this type${qualifier})`
}

// Muted — this isn't an alert, just a quiet way to tell "no estimate yet"
// (nothing shown, the normal case while samples build up) apart from "the
// last attempt to read this game's state actually failed" for whoever goes
// looking for why a bar isn't there.
function ProgressErrorHint({ platform, error, compact }: { platform: Platform; error: string; compact?: boolean }) {
  return (
    <HoldTooltip label={`Couldn't read this game's ${unitWord(platform)} count: ${error}`}>
      <span className={`text-[#c5c5c5] ${compact ? 'text-[10px]' : 'text-xs'}`}>
        ⚠
      </span>
    </HoldTooltip>
  )
}

// Full-width bar for cards. `compact` renders a slim inline version for rows.
export default function ProgressBar({ game, compact }: { game: Game; compact?: boolean }) {
  const progress = game.progress
  if (!progress) return game.progressError ? <ProgressErrorHint platform={game.platform} error={game.progressError} compact={compact} /> : null
  const label = progressLabel(game.platform, progress)

  // A time-based estimate is a weaker signal than an actual turn/move count —
  // faded rather than full-strength, so it still reads as "roughly this far
  // along" without looking as certain as a real count. The tooltip is the
  // one place that has to say so outright; this is just a visual nudge.
  const fade = progress.timeBased ? 'opacity-60' : ''

  if (compact) {
    return (
      <HoldTooltip label={label}>
        <span className={`flex items-center gap-1 shrink-0 ${fade}`}>
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
      <span className={`flex items-center gap-1.5 ${fade}`}>
        <span className="flex-1 h-1.5 rounded-full bg-[#ececec] overflow-hidden min-w-[60px]">
          <span className="block h-full bg-[#5e6ad2]" style={{ width: `${progress.percent}%` }} />
        </span>
        <span className="text-[10px] tabular-nums text-[#9b9b9b]">{progress.percent}%</span>
      </span>
    </HoldTooltip>
  )
}
