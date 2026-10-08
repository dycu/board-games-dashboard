'use client'
import { FinishedGame, PLATFORM_LABELS, PLATFORM_SHORT_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import { placeLabel } from '@/lib/results'

const RESULT_STYLE = {
  won: 'bg-green-50 text-green-700',
  lost: 'bg-[#f3f3f3] text-[#6b6b6b]',
  draw: 'bg-sky-50 text-sky-700',
  coop: 'bg-violet-50 text-violet-700',
} as const

function Result({ game }: { game: FinishedGame }) {
  const place = placeLabel(game)
  if (!game.result || !place) return null
  return (
    <span className={`shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded ${RESULT_STYLE[game.result]}`}>
      {game.result === 'won' ? '🏆 ' : ''}{place}
    </span>
  )
}

function eloText(game: FinishedGame): string | null {
  if (game.elo === undefined) return null
  const d = game.eloDelta
  return `ELO ${game.elo}${d ? ` (${d > 0 ? '+' : ''}${d})` : ''}`
}

interface Props {
  game: FinishedGame
  action?: React.ReactNode // shown before the View link
  details?: string         // shown after the completion time
}

export default function FinishedGameCard({ game, action, details }: Props) {
  const badgeClass = BADGE_COLORS[game.platform] ?? 'bg-[#f3f3f3] text-[#6b6b6b]'

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg border border-[#e5e5e5] bg-white hover:border-[#d5d5d5] transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <span title={PLATFORM_LABELS[game.platform]} className={`shrink-0 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${badgeClass}`}>
          {PLATFORM_SHORT_LABELS[game.platform]}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-medium text-[#1a1a1a] truncate">{game.gameName}</p>
            <Result game={game} />
          </div>
          <p className="text-xs text-[#9b9b9b]">
            Completed {game.completedAgo}{eloText(game) && ` · ${eloText(game)}`}{details && ` · ${details}`}
          </p>
        </div>
      </div>
      <div className="shrink-0 ml-4 flex items-center gap-2">
        {action}
        <a
          href={game.gameUrl}
          target={game.platform === 'bga' ? '_self' : '_blank'}
          rel="noopener noreferrer"
          aria-label={`View ${game.gameName}`}
          className="text-xs font-medium bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb] px-3 py-1 rounded-md transition-colors"
        >
          View →
        </a>
      </div>
    </div>
  )
}
