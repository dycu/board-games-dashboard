'use client'
import { FinishedGame, PLATFORM_LABELS, PLATFORM_SHORT_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import { placeLabel } from '@/lib/results'
import Link from 'next/link'
import { gameHistoryHref } from '@/lib/gameStats'
import PlayerHoverCard from './PlayerHoverCard'

const RESULT_STYLE = {
  won: 'bg-green-50 text-green-700',
  lost: 'bg-[var(--bg-muted)] text-[var(--text-secondary)]',
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
  const badgeClass = BADGE_COLORS[game.platform] ?? 'bg-[var(--bg-muted)] text-[var(--text-secondary)]'

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-2 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-[var(--border-dashed)] transition-colors">
      <div className="flex items-center gap-3 min-w-[160px] flex-1">
        <span title={PLATFORM_LABELS[game.platform]} className={`shrink-0 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${badgeClass}`}>
          {PLATFORM_SHORT_LABELS[game.platform]}
        </span>
        <div className="min-w-0">
          {/* flex-wrap, not truncate: a custom table title ("Type — long
              custom title") is common enough on OBG/BoardTogether/choochoo
              that cutting it short with an ellipsis loses real information —
              wrapping (the Result pill drops to its own line when there's no
              room) costs a little vertical space instead. */}
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Link href={gameHistoryHref(game)} title="All your games of it" className="text-sm font-medium text-[var(--text-primary)] hover:text-[var(--accent)] hover:underline">{game.gameName}</Link>
            <Result game={game} />
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">
            Completed {game.completedAgo}{eloText(game) && ` · ${eloText(game)}`}{details && ` · ${details}`}
          </p>
          {/* Who you played with — so a game worth replaying has someone to
              go invite again, not just a result to look back on. */}
          {game.opponents && game.opponents.length > 0 && (
            <p className="text-xs text-[var(--text-tertiary)] truncate">
              with {game.opponents.map((o, i) => (
                <span key={o.name}>
                  {i > 0 && ', '}
                  <PlayerHoverCard platform={game.platform} name={o.name} />
                </span>
              ))}
            </p>
          )}
        </div>
      </div>
      {/* Always its own row, never sharing one with the name/opponents info
          on the left — Game/backlog-list chips plus View can add up to more
          width than this card ever has to spare (it's one column of a
          two-column grid, not the full page), and letting them compete for
          the same row as the left side squeezed it down to a sliver,
          truncating the opponents list hard. */}
      <div className="w-full flex flex-wrap items-center gap-x-2 gap-y-1">
        {action}
        <a
          href={game.gameUrl}
          target={game.platform === 'bga' ? '_self' : '_blank'}
          rel="noopener noreferrer"
          aria-label={`View ${game.gameName}`}
          className="text-xs font-medium bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-muted-hover)] px-3 py-1 rounded-md transition-colors"
        >
          View →
        </a>
      </div>
    </div>
  )
}
