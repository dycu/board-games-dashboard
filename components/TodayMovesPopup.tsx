'use client'
import { type RefObject } from 'react'
import { Game, PLATFORM_SHORT_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import { useAnchoredPopover } from '@/hooks/useAnchoredPopover'

// Opened from the nav's "🔥 N today" total — every game with a move today,
// busiest first, so it reads as a quick "where did today's moves go"
// instead of just the one aggregate number.
export default function TodayMovesPopup({ games, anchorRef, onClose }: { games: Game[]; anchorRef: RefObject<HTMLElement | null>; onClose: () => void }) {
  const { panelRef, pos, width, margin } = useAnchoredPopover(anchorRef, onClose, { heightEstimate: 320 })
  if (!pos) return null

  const sorted = games
    .filter(g => (g.moveCountToday ?? 0) > 0)
    .sort((a, b) => (b.moveCountToday ?? 0) - (a.moveCountToday ?? 0))

  return (
    <div
      ref={panelRef}
      className="fixed z-50 bg-[var(--bg-surface)] rounded-lg shadow-xl border border-[var(--border-default)] p-3"
      style={{ top: pos.top, left: pos.left, width: `min(${width}px, calc(100vw - ${margin * 2}px))` }}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Moves today</h2>
        <button onClick={onClose} aria-label="Close" className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] leading-none">✕</button>
      </div>
      {sorted.length === 0 ? (
        <p className="text-xs text-[var(--text-tertiary)] py-4 text-center">No moves yet today.</p>
      ) : (
        <ul className="flex flex-col gap-1 max-h-80 overflow-y-auto">
          {sorted.map(g => (
            <li key={g.id}>
              <a
                href={g.gameUrl}
                target={g.platform === 'bga' ? '_self' : '_blank'}
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 text-xs px-1.5 py-1 rounded hover:bg-[var(--bg-muted)]"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded-full ${BADGE_COLORS[g.platform] ?? 'bg-[var(--bg-muted)] text-[var(--text-secondary)]'}`}>
                    {PLATFORM_SHORT_LABELS[g.platform]}
                  </span>
                  <span className="truncate text-[var(--text-primary)]">{g.gameName}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-orange-600">{g.moveCountToday}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
