'use client'
import { Game, PLATFORM_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'

interface Props {
  game: Game
  pinned: boolean
  onTogglePin: (id: string) => void
  onDismiss: () => void
  opened: boolean
  onOpen: () => void
  opponentSlowDays: number
}

export default function GameCard({ game, pinned, onTogglePin, onDismiss, opened, onOpen, opponentSlowDays }: Props) {
  const badgeClass = BADGE_COLORS[game.platform] ?? 'bg-[#f3f3f3] text-[#6b6b6b]'
  const opponentSlow = !game.myTurn &&
    (Date.now() - game.lastMoveAt.getTime()) > opponentSlowDays * 86_400_000

  return (
    <div className={`rounded-lg border p-3.5 flex flex-col gap-2.5 transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.05)]
      ${game.myTurn
        ? 'bg-white border-[#e5e5e5] border-l-[3px] border-l-[#5e6ad2]'
        : 'bg-[#fafafa] border-[#e5e5e5] hover:border-[#d5d5d5]'}
      ${opened ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between">
        <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${badgeClass}`}>
          {PLATFORM_LABELS[game.platform]}
        </span>
        <div className="flex items-center gap-2">
          {game.myTurn
            ? <span className="text-[11px] font-semibold text-[#5e6ad2]">Your turn</span>
            : <span className="text-[11px] text-[#9b9b9b]">
                {game.currentPlayer ? `Waiting for ${game.currentPlayer}` : 'Waiting'}
              </span>
          }
          <button
            aria-label={pinned ? 'Unpin game' : 'Pin game'}
            onClick={() => onTogglePin(game.id)}
            className={`text-sm transition-colors ${pinned ? 'text-amber-400' : 'text-[#9b9b9b] hover:text-amber-400'}`}>
            {pinned ? '★' : '☆'}
          </button>
        </div>
      </div>

      <div className="font-semibold text-[14px] text-[#1a1a1a]">{game.gameName}</div>

      {game.players.length > 0 && (
        <div className="text-xs text-[#9b9b9b] hidden sm:block">
          with {game.players.join(', ')}
        </div>
      )}

      <div className="flex items-center justify-between mt-0.5">
        <span className={`text-xs ${(game.urgent || opponentSlow) ? 'text-amber-500 font-medium' : 'text-[#9b9b9b]'}`}>
          {(game.urgent || opponentSlow) ? '⏱ ' : ''}{game.lastMoveAgo}
        </span>
        <div className="flex items-center gap-2">
          {game.myTurn && (
            <button
              onClick={onDismiss}
              title="Dismiss until next refresh"
              className="text-xs text-[#9b9b9b] hover:text-[#6b6b6b] transition-colors px-2 py-1 rounded-md hover:bg-[#f3f3f3]">
              ✓ Done
            </button>
          )}
          <a
            href={game.gameUrl}
            target={game.platform === 'bga' ? '_self' : '_blank'}
            rel="noopener noreferrer"
            aria-label="Open game"
            onClick={onOpen}
            className={`text-xs font-medium px-3 py-1 rounded-md transition-colors
              ${game.myTurn
                ? 'bg-[#5e6ad2] text-white hover:bg-[#4f5ab8]'
                : 'bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb]'}`}>
            {opened ? '↗ Open' : 'Open →'}
          </a>
        </div>
      </div>
    </div>
  )
}
