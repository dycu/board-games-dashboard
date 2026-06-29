'use client'
import { FinishedGame, PLATFORM_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'

interface Props {
  game: FinishedGame
}

export default function FinishedGameCard({ game }: Props) {
  const badgeClass = BADGE_COLORS[game.platform] ?? 'bg-slate-800 text-slate-400'

  return (
    <div className="flex items-center justify-between py-3 px-4 rounded-lg border border-slate-700 bg-slate-900 hover:border-slate-600 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`shrink-0 text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${badgeClass}`}>
          {PLATFORM_LABELS[game.platform]}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-100 truncate">{game.gameName}</p>
          <p className="text-xs text-slate-500">Completed {game.completedAgo}</p>
        </div>
      </div>
      <a
        href={game.gameUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`View ${game.gameName}`}
        className="shrink-0 ml-4 text-xs font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 px-3 py-1 rounded-md transition-colors"
      >
        View →
      </a>
    </div>
  )
}
