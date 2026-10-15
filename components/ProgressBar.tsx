'use client'
import { useRef, useState } from 'react'
import { Game, Platform } from '@/lib/types'
import { sampleTier } from '@/lib/sampleConfidence'

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
// from — a plain `title` attribute doesn't reliably show on a long press, so
// this is a small custom tooltip instead. `ariaLabel` carries the full
// sentence for screen readers; `tooltip` is whatever's shown visually, which
// can be richer (e.g. a bulleted basis) without changing what's announced.
function HoldTooltip({ ariaLabel, tooltip, children }: { ariaLabel: string; tooltip: React.ReactNode; children: React.ReactNode }) {
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
      aria-label={ariaLabel}
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
          className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-max max-w-[300px] whitespace-normal text-center text-[11px] leading-snug bg-[#1a1a1a] text-white px-2 py-1.5 rounded-md shadow-lg pointer-events-none">
          {tooltip}
        </span>
      )}
    </button>
  )
}

// Full sentence for screen readers — the visible tooltip (below) says the
// same thing more concisely, with the basis broken out as a bulleted list
// instead of folded into one sentence.
export function progressLabel(platform: Platform, progress: NonNullable<Game['progress']>): string {
  const { turnsSoFar, estimatedTotalTurns, sampleCount, sameSizeOnly, exact, timeBased, actualTurnsSoFar } = progress
  const basis = sampleCount === 1 ? '1 finished game' : `${sampleCount} finished games`
  const qualifier = sameSizeOnly ? ' with the same player count' : ''
  if (timeBased) {
    const unit = unitWord(platform)
    const turnNote = actualTurnsSoFar !== undefined ? `, ${unit} ${actualTurnsSoFar} so far` : ''
    return `Time-based estimate: ~${formatDuration(turnsSoFar)} in${turnNote}, typically takes about ${formatDuration(estimatedTotalTurns)} (median of ${basis}${qualifier})`
  }
  const unit = unitWord(platform, true)
  if (exact) return `${unit} ${turnsSoFar} of ${estimatedTotalTurns} (reported by the game itself)`
  return `${unit} ${turnsSoFar} of an estimated ${estimatedTotalTurns} (median of ${basis} of this type${qualifier})`
}

function headline(platform: Platform, progress: NonNullable<Game['progress']>): string {
  const { turnsSoFar, estimatedTotalTurns, exact, timeBased, actualTurnsSoFar } = progress
  if (timeBased) {
    const turnNote = actualTurnsSoFar !== undefined ? ` (${unitWord(platform)} ${actualTurnsSoFar})` : ''
    return `~${formatDuration(turnsSoFar)} in${turnNote}, typically takes about ${formatDuration(estimatedTotalTurns)}`
  }
  const unit = unitWord(platform, true)
  if (exact) return `${unit} ${turnsSoFar} of ${estimatedTotalTurns} (reported by the game itself)`
  return `${unit} ${turnsSoFar} of an estimated ${estimatedTotalTurns}`
}

// One row = the option actually used from one either/or choice — green for
// the stronger basis (a real turn count; a sample matched to the same
// player count), amber for the weaker fallback (time-based; this type as a
// whole), rather than naming both when only one applies here.
function BasisLine({ label, strong }: { label: string; strong: boolean }) {
  return <div className={strong ? 'text-green-400' : 'text-amber-400'}>{label}</div>
}

// What the estimate is actually based on is two separate either/or choices —
// the method (turn/move count vs. elapsed time) and the sample pool (same
// player count vs. this type as a whole) — each shown as the one option
// that applied here, not both.
function ProgressBasis({ platform, progress }: { platform: Platform; progress: NonNullable<Game['progress']> }) {
  const { sampleCount, sameSizeOnly, timeBased, sameSizeSampleCount, totalSampleCount } = progress
  const total = totalSampleCount ?? sampleCount
  const sameSize = sameSizeSampleCount ?? (sameSizeOnly ? sampleCount : 0)
  const unit = unitWord(platform, true)

  return (
    <div className="mt-1 text-left space-y-0.5">
      <BasisLine label={timeBased ? 'Time-based estimate' : `${unit}-based estimate`} strong={!timeBased} />
      <BasisLine
        label={sameSizeOnly ? `${sameSize} with the same player count` : `${total} game${total === 1 ? '' : 's'} of this type`}
        strong={sameSizeOnly}
      />
    </div>
  )
}

function ProgressTooltip({ platform, progress }: { platform: Platform; progress: NonNullable<Game['progress']> }) {
  const tier = progress.exact ? null : sampleTier(progress.sampleCount)
  return (
    <>
      <div>{headline(platform, progress)}</div>
      {progress.etaSeconds !== undefined && (
        <div className="mt-0.5 text-[#b9c0f5]">{progress.etaSeconds === 0 ? 'any time now' : `~${formatDuration(progress.etaSeconds)} left`}</div>
      )}
      {tier === 'thin' && (
        <div className="mt-1 text-amber-300">⚠ only {progress.sampleCount} game{progress.sampleCount === 1 ? '' : 's'} to compare against — rough estimate</div>
      )}
      {tier === 'moderate' && (
        <div className="mt-1 text-[#9b9b9b]">{progress.sampleCount} games to compare against — moderate sample</div>
      )}
      {!progress.exact && <ProgressBasis platform={platform} progress={progress} />}
    </>
  )
}

// Muted — this isn't an alert, just a quiet way to tell "no estimate yet"
// (nothing shown, the normal case while samples build up) apart from "the
// last attempt to read this game's state actually failed" for whoever goes
// looking for why a bar isn't there.
function ProgressErrorHint({ platform, error, compact }: { platform: Platform; error: string; compact?: boolean }) {
  const text = `Couldn't read this game's ${unitWord(platform)} count: ${error}`
  return (
    <HoldTooltip ariaLabel={text} tooltip={text}>
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
  const ariaLabel = progressLabel(game.platform, progress)
  const tooltip = <ProgressTooltip platform={game.platform} progress={progress} />

  // A time-based estimate is a weaker signal than an actual turn/move count —
  // faded rather than full-strength, so it still reads as "roughly this far
  // along" without looking as certain as a real count. The tooltip is the
  // one place that has to say so outright; this is just a visual nudge.
  const fade = progress.timeBased ? 'opacity-60' : ''
  // A "~" is a much smaller nudge than the fade, and reserved for the
  // thinnest tier only — a low sample count can happen on an otherwise-solid
  // turn-count estimate too, so it's shown independently rather than folded
  // into the same signal. The moderate tier (see lib/sampleConfidence, also
  // used by the finish-timeline chart) used to be silently lumped in with
  // "solid" once sampleCount reached 3; now it gets its own quieter note in
  // the tooltip instead of looking identical to a much larger sample.
  const tier = progress.exact ? null : sampleTier(progress.sampleCount)
  const percentText = `${tier === 'thin' ? '~' : ''}${progress.percent}%`

  if (compact) {
    return (
      <HoldTooltip ariaLabel={ariaLabel} tooltip={tooltip}>
        <span className={`flex items-center gap-1 shrink-0 ${fade}`}>
          <span className="w-8 h-1 rounded-full bg-[#ececec] overflow-hidden">
            <span className="block h-full bg-[#5e6ad2]" style={{ width: `${progress.percent}%` }} />
          </span>
          <span className="text-[10px] tabular-nums text-[#9b9b9b]">{percentText}</span>
        </span>
      </HoldTooltip>
    )
  }

  return (
    <HoldTooltip ariaLabel={ariaLabel} tooltip={tooltip}>
      <span className={`flex items-center gap-1.5 ${fade}`}>
        <span className="flex-1 h-1.5 rounded-full bg-[#ececec] overflow-hidden min-w-[60px]">
          <span className="block h-full bg-[#5e6ad2]" style={{ width: `${progress.percent}%` }} />
        </span>
        <span className="text-[10px] tabular-nums text-[#9b9b9b]">{percentText}</span>
      </span>
    </HoldTooltip>
  )
}
