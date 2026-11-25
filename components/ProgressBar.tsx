'use client'
import { Game, Platform } from '@/lib/types'
import { sampleTier } from '@/lib/sampleConfidence'
import { formatDuration } from '@/lib/connectors/utils'
import HoldTooltip from './HoldTooltip'

// What we're actually counting differs by platform: BGA's data calls it a
// turn, but 18xx's and Rally's numbers are each an action log length (every
// bid, placement, card play, etc.) — calling that a "turn" reads as wrong,
// especially since 18xx separately has its own much coarser "turn" (a whole
// stock + operating round cycle) that this isn't, and several Rally games
// (e.g. Julius Caesar's Years) have their own turn count that resets
// mid-game, which is exactly why we count log entries there instead.
const UNIT_WORD: Partial<Record<Platform, string>> = { eighteenxx: 'move', rally: 'move' }
function unitWord(platform: Platform, capitalize = false): string {
  const word = UNIT_WORD[platform] ?? 'turn'
  return capitalize ? word[0].toUpperCase() + word.slice(1) : word
}

// Full sentence for screen readers — the visible tooltip (below) says the
// same thing more concisely, with the basis broken out as a bulleted list
// instead of folded into one sentence.
export function progressLabel(platform: Platform, progress: NonNullable<Game['progress']>): string {
  const { turnsSoFar, estimatedTotalTurns, sampleCount, sameSizeOnly, exact, timeBased, selfTimed, actualTurnsSoFar } = progress
  const basis = sampleCount === 1 ? '1 finished game' : `${sampleCount} finished games`
  const qualifier = sameSizeOnly ? ' with the same player count' : ''
  if (timeBased) {
    const unit = unitWord(platform)
    const turnNote = actualTurnsSoFar !== undefined ? `, ${unit} ${actualTurnsSoFar} so far` : ''
    const label = selfTimed ? 'Self-timed estimate (this site never reports a start time, so the clock started when we first saw this game, not when it really began)' : 'Time-based estimate'
    return `${label}: ~${formatDuration(turnsSoFar)} in${turnNote}, typically takes about ${formatDuration(estimatedTotalTurns)} (median of ${basis}${qualifier})`
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
  const { sampleCount, sameSizeOnly, timeBased, selfTimed, sameSizeSampleCount, totalSampleCount } = progress
  const total = totalSampleCount ?? sampleCount
  const sameSize = sameSizeSampleCount ?? (sameSizeOnly ? sampleCount : 0)
  const unit = unitWord(platform, true)
  const timeLabel = selfTimed ? 'Self-timed estimate' : 'Time-based estimate'

  return (
    <div className="mt-1 text-left space-y-0.5">
      <BasisLine label={timeBased ? timeLabel : `${unit}-based estimate`} strong={!timeBased} />
      <BasisLine
        label={sameSizeOnly ? `${sameSize} with the same player count` : `${total} game${total === 1 ? '' : 's'} of this type`}
        strong={sameSizeOnly}
      />
      {selfTimed && <BasisLine label="Clock started when we first saw this game, not its real start" strong={false} />}
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
      <span className={`text-[var(--icon-muted)] ${compact ? 'text-[10px]' : 'text-xs'}`}>
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
          <span className="w-8 h-1 rounded-full bg-[var(--border-subtle)] overflow-hidden">
            <span className="block h-full bg-[var(--accent)]" style={{ width: `${progress.percent}%` }} />
          </span>
          <span className="text-[10px] tabular-nums text-[var(--text-tertiary)]">{percentText}</span>
        </span>
      </HoldTooltip>
    )
  }

  return (
    <HoldTooltip ariaLabel={ariaLabel} tooltip={tooltip}>
      <span className={`flex items-center gap-1.5 ${fade}`}>
        <span className="flex-1 h-1.5 rounded-full bg-[var(--border-subtle)] overflow-hidden min-w-[60px]">
          <span className="block h-full bg-[var(--accent)]" style={{ width: `${progress.percent}%` }} />
        </span>
        <span className="text-[10px] tabular-nums text-[var(--text-tertiary)]">{percentText}</span>
      </span>
    </HoldTooltip>
  )
}
