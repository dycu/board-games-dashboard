'use client'
import { FinishedGame, PLATFORM_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'

interface Props {
  game: FinishedGame
}

export default function FinishedGameCard({ game }: Props) {
  const badgeClass = BADGE_COLORS[game.platform] ?? 'bg-[#f3f3f3] text-[#6b6b6b]'

  return (
    <div className="flex items-center justify-between py-3 px-4 rounded-lg border border-[#e5e5e5] bg-white hover:border-[#d5d5d5] transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`shrink-0 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${badgeClass}`}>
          {PLATFORM_LABELS[game.platform]}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#1a1a1a] truncate">{game.gameName}</p>
          <p className="text-xs text-[#9b9b9b]">Completed {game.completedAgo}</p>
        </div>
      </div>
      <a
        href={game.gameUrl}
        target={game.platform === 'bga' ? '_self' : '_blank'}
        rel="noopener noreferrer"
        aria-label={`View ${game.gameName}`}
        className="shrink-0 ml-4 text-xs font-medium bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb] px-3 py-1 rounded-md transition-colors"
      >
        View →
      </a>
    </div>
  )
}
