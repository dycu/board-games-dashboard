'use client'
import { Game, PLATFORM_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'

interface Props {
  game: Game
  pinned: boolean
  onTogglePin: (id: string) => void
  onDismiss: () => void
}

export default function GameCard({ game, pinned, onTogglePin, onDismiss }: Props) {
  const badgeClass = BADGE_COLORS[game.platform] ?? 'bg-slate-800 text-slate-400'

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 transition-colors
      ${game.myTurn
        ? 'border-blue-600 bg-blue-950/30'
        : 'border-slate-700 bg-slate-900 hover:border-slate-600'}`}>
      <div className="flex items-start justify-between">
        <span className={`text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${badgeClass}`}>
          {PLATFORM_LABELS[game.platform]}
        </span>
        <div className="flex items-center gap-2">
          {game.myTurn
            ? <span className="text-xs font-semibold bg-blue-800 text-blue-200 px-2 py-0.5 rounded-full">Your turn</span>
            : <span className="text-xs text-slate-500">
                {game.currentPlayer ? `Waiting for ${game.currentPlayer}` : 'Waiting'}
              </span>
          }
          <button
            aria-label={pinned ? 'Unpin game' : 'Pin game'}
            onClick={() => onTogglePin(game.id)}
            className="text-slate-500 hover:text-yellow-400 transition-colors">
            {pinned ? '📌' : '📍'}
          </button>
        </div>
      </div>

      <div className="font-semibold text-slate-100">{game.gameName}</div>

      {game.players.length > 0 && (
        <div className="text-xs text-slate-400 hidden sm:block">
          with {game.players.join(', ')}
        </div>
      )}

      <div className="flex items-center justify-between mt-1">
        <span className={`text-xs ${game.urgent ? 'text-amber-400' : 'text-slate-500'}`}>
          {game.urgent ? '⏱ ' : ''}{game.lastMoveAgo}
        </span>
        <div className="flex items-center gap-2">
          {game.myTurn && (
            <button
              onClick={onDismiss}
              title="Dismiss until next refresh"
              className="text-xs text-slate-600 hover:text-slate-400 transition-colors px-2 py-1 rounded-md hover:bg-slate-800">
              ✓ Done
            </button>
          )}
          <a
            href={game.gameUrl}
            target={game.platform === 'bga' ? '_self' : '_blank'}
            rel="noopener noreferrer"
            aria-label="Open game"
            className={`text-xs font-medium px-3 py-1 rounded-md transition-colors
              ${game.myTurn
                ? 'bg-blue-700 text-white hover:bg-blue-600'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
            Open →
          </a>
        </div>
      </div>
    </div>
  )
}
