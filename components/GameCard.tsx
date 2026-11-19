'use client'
import { useState } from 'react'
import { Game, PLATFORM_LABELS, PLATFORM_SHORT_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import { formatTimeRemaining } from '@/lib/connectors/utils'
import { deadlineSoon } from '@/lib/sort-filter'
import { useNoteConfirmedOpen } from '@/hooks/useNoteConfirmedOpen'
import HistoryLink from './HistoryLink'
import ProgressBar from './ProgressBar'
import ReadNotePopup from './ReadNotePopup'

export interface GameItemProps {
  game: Game
  pinned: boolean
  onTogglePin: (id: string) => void
  sunk: boolean
  onToggleSink: (id: string) => void
  onOpen: () => void // the dashboard dims an opened game until the next refresh
  opponentSlowDays: number
  deadlineSoonHours: number
  note?: string
  onSaveNote?: (id: string, text: string) => void
  // A short persistent label for the game — e.g. to tell apart several
  // simultaneous games of the same title when GMing. Separate from `note`,
  // which is for round-to-round planning and gets cleared often; a table
  // label needs to survive that.
  tableLabel?: string
  onSaveTableLabel?: (id: string, text: string) => void
  now: number
  opened?: boolean // opened since the last refresh that saw me back: dimmed until then
  showProgress: boolean // the "% through the game" bar — a settings toggle, default on
  maxMoveCountToday: number // the busiest game's moveCountToday across the board right now — see heatBg
}

const BADGE_FALLBACK = 'bg-[var(--bg-muted)] text-[var(--text-secondary)]'

export function openTarget(game: Game): string {
  // BGA opens in this tab (desktop mode on tablets); other sites in a new one
  return game.platform === 'bga' ? '_self' : '_blank'
}

export function isOpponentSlow(game: Game, opponentSlowDays: number, now: number): boolean {
  return !game.myTurn && now - game.lastMoveAt.getTime() > opponentSlowDays * 86_400_000
}

// The whole card/row is the link: an invisible layer over it, with the
// buttons raised above it so they stay clickable
function CoverLink({ game, onOpen, note }: { game: Game; onOpen: () => void; note?: string }) {
  const target = openTarget(game)
  const { onClick, onAuxClick, pendingTarget, confirm, cancel } = useNoteConfirmedOpen(game, target, note, onOpen)
  return (
    <>
      <a
        href={game.gameUrl}
        target={target}
        rel="noopener noreferrer"
        aria-label={`Open ${game.gameName}`}
        onClick={onClick}
        onAuxClick={onAuxClick}
        onContextMenu={onOpen}
        className="absolute inset-0 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      />
      {pendingTarget && note && (
        <ReadNotePopup gameName={game.gameName} note={note} onConfirm={confirm} onCancel={cancel} />
      )}
    </>
  )
}

function PinButton({ game, pinned, onTogglePin }: Pick<GameItemProps, 'game' | 'pinned' | 'onTogglePin'>) {
  return (
    <button
      aria-label={pinned ? 'Unpin game' : 'Pin game'}
      onClick={() => onTogglePin(game.id)}
      className={`relative z-10 text-sm transition-colors ${pinned ? 'text-amber-400' : 'text-[var(--icon-muted)] hover:text-amber-400'}`}>
      {pinned ? '★' : '☆'}
    </button>
  )
}

// The opposite of pinning: always sorts to the end of its section instead
// of the top (e.g. solo games you don't want competing for the top spot).
// A different glyph (filled/outline triangle, not a star) so it's never
// mistaken for the pin.
function SinkButton({ game, sunk, onToggleSink }: Pick<GameItemProps, 'game' | 'sunk' | 'onToggleSink'>) {
  return (
    <button
      aria-label={sunk ? 'Unsink game (stop sending it to the end)' : 'Sink game to the end'}
      title={sunk ? 'Stop sending to the end' : 'Send to the end'}
      onClick={() => onToggleSink(game.id)}
      className={`relative z-10 text-sm transition-colors ${sunk ? 'text-slate-400' : 'text-[var(--icon-muted)] hover:text-slate-400'}`}>
      {sunk ? '▼' : '▽'}
    </button>
  )
}

export function Badge({ game, small }: { game: Game; small?: boolean }) {
  return (
    <span title={PLATFORM_LABELS[game.platform]} className={`shrink-0 font-bold uppercase tracking-wide rounded-full ${small ? 'text-[10px] px-1.5 py-px' : 'text-[11px] px-2 py-0.5'} ${BADGE_COLORS[game.platform] ?? BADGE_FALLBACK}`}>
      {PLATFORM_SHORT_LABELS[game.platform]}
    </span>
  )
}

// Only shown once something actually happened today — a game you're not
// actively grinding on looks exactly like it did before this existed.
function MoveCountBadge({ game, small }: { game: Game; small?: boolean }) {
  const count = game.moveCountToday
  if (!count) return null
  return (
    <span className={`shrink-0 font-semibold rounded-full bg-orange-50 text-orange-600 ${small ? 'text-[10px] px-1.5 py-px' : 'text-[11px] px-2 py-0.5'}`}>
      🔥 {count} today
    </span>
  )
}

export function NoteEditor({ game, note, onSaveNote, compact }: Pick<GameItemProps, 'game' | 'note' | 'onSaveNote'> & { compact?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  if (!onSaveNote) return note ? <p className="text-xs text-[var(--text-secondary)] italic whitespace-normal break-words">{note}</p> : null

  if (editing) {
    const save = () => { onSaveNote(game.id, draft); setEditing(false) }
    return (
      <input
        autoFocus
        value={draft}
        maxLength={300}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') setEditing(false)
        }}
        onBlur={save}
        placeholder="Note for this game…"
        aria-label={`Note for ${game.gameName}`}
        className={`relative z-10 text-xs bg-[var(--bg-surface)] text-[var(--text-primary)] px-2 py-1 rounded border border-[var(--accent)] ${compact ? 'w-40 sm:w-56' : 'w-full'}`}
      />
    )
  }
  const startEditing = () => { setDraft(note ?? ''); setEditing(true) }
  if (compact) {
    // On a narrow screen, the row hides the note's text and its own
    // delete button (no room) — so without this, deleting a note here
    // meant opening the editor, clearing the text, then blurring to save,
    // which dismisses the keyboard whether or not that was wanted. A
    // direct delete button skips all of that for the common case (reading
    // a note once it's done its job) while still leaving edit available
    // for when the note should stay.
    return note && onSaveNote ? (
      <span className="flex items-center gap-1">
        <button
          onClick={startEditing}
          aria-label={`Edit the note on ${game.gameName}`}
          title={note}
          className="relative z-10 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          ✎
        </button>
        <DeleteNote game={game} onSaveNote={onSaveNote} />
      </span>
    ) : (
      <button
        onClick={startEditing}
        aria-label={`Add a note to ${game.gameName}`}
        title="Add a note"
        className="relative z-10 text-xs text-[var(--icon-muted)] hover:text-[var(--text-primary)]">
        ✎
      </button>
    )
  }
  return note ? (
    <div className="relative z-10 flex items-start gap-1.5 min-w-0">
      <button
        onClick={startEditing}
        title="Edit note"
        className="min-w-0 text-left text-xs text-[var(--text-secondary)] italic whitespace-normal break-words hover:text-[var(--text-primary)]">
        ✎ {note}
      </button>
      <DeleteNote game={game} onSaveNote={onSaveNote} />
    </div>
  ) : (
    <button
      onClick={startEditing}
      aria-label={`Add a note to ${game.gameName}`}
      title="Add a note"
      className="relative z-10 self-start text-xs text-[var(--icon-muted)] hover:text-[var(--text-secondary)]">
      ✎ note
    </button>
  )
}

// Shown on every game — not just GMed titles, since any active game can
// use a short label (opponent group, device, whatever helps tell it apart
// at a glance). onSaveLabel is still optional so a caller can opt a card
// out entirely if it ever needs to.
export function TableLabelEditor({ game, label, onSaveLabel, compact }: Pick<GameItemProps, 'game'> & { label?: string; onSaveLabel?: (id: string, text: string) => void; compact?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  if (!onSaveLabel) return null

  if (editing) {
    const save = () => { onSaveLabel(game.id, draft); setEditing(false) }
    return (
      <input
        autoFocus
        value={draft}
        maxLength={60}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') setEditing(false)
        }}
        onBlur={save}
        placeholder="Table label…"
        aria-label={`Table label for ${game.gameName}`}
        className={`relative z-10 text-xs bg-[var(--bg-surface)] text-[var(--text-primary)] px-2 py-0.5 rounded border border-[var(--accent)] ${compact ? 'w-20' : 'w-24'}`}
      />
    )
  }

  const startEditing = () => { setDraft(label ?? ''); setEditing(true) }
  return label ? (
    <button
      onClick={startEditing}
      title={compact ? label : 'Edit table label'}
      className={`relative z-10 shrink-0 font-semibold rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] ${compact ? 'text-[10px] px-1 py-px max-w-[64px] truncate' : 'text-[11px] px-1.5 py-0.5'}`}>
      {label}
    </button>
  ) : compact ? (
    <button
      onClick={startEditing}
      aria-label={`Add a table label to ${game.gameName}`}
      title="Add a table label"
      className="relative z-10 shrink-0 text-xs text-[var(--icon-muted)] hover:text-[var(--accent)]">
      🏷
    </button>
  ) : (
    <button
      onClick={startEditing}
      aria-label={`Add a table label to ${game.gameName}`}
      title="Add a table label — distinguishes this from your other parallel games of the title"
      className="relative z-10 shrink-0 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--accent)] border border-dashed border-[var(--border-dashed)] hover:border-[var(--accent)] px-1.5 py-0.5 rounded">
      + label
    </button>
  )
}

function DeleteNote({ game, onSaveNote }: { game: Game; onSaveNote: (id: string, text: string) => void }) {
  return (
    <button
      onClick={() => onSaveNote(game.id, '')}
      aria-label={`Delete the note on ${game.gameName}`}
      title="Delete note"
      className="relative z-10 shrink-0 text-[11px] leading-none text-[var(--icon-muted)] hover:text-red-500">
      ✕
    </button>
  )
}

// Background warmth scales with today's move count *relative to the busiest
// game today* (see MoveCountBadge), not a fixed scale — on a day you play a
// lot, a fixed scale would turn everything the same dark orange and lose
// exactly the signal this is for (which game got the most attention today).
// Tiers, not a continuous scale: a small difference in share rarely means
// anything, but "barely any of today's moves" vs. "most of them" does.
// Takes priority over whatever background a card would otherwise have (e.g.
// GameRow's amber tint for a slow opponent) — today's activity is the more
// specific signal.
function heatBg(count: number | undefined, maxCount: number, fallback: string): string {
  if (!count) return fallback
  const share = maxCount > 0 ? count / maxCount : 0
  if (share >= 2 / 3) return 'bg-orange-200'
  if (share >= 1 / 3) return 'bg-orange-100'
  return 'bg-orange-50'
}

// A game waiting for my move: a full card
export default function GameCard({ game, pinned, onTogglePin, sunk, onToggleSink, onOpen, opponentSlowDays, deadlineSoonHours, note, onSaveNote, tableLabel, onSaveTableLabel, now, opened, showProgress, maxMoveCountToday }: GameItemProps) {
  const soon = deadlineSoon(game, now, deadlineSoonHours * 3600_000)
  const slow = isOpponentSlow(game, opponentSlowDays, now)

  return (
    <div className={`relative rounded-lg border p-3.5 flex flex-col gap-2 transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.05)] ${heatBg(game.moveCountToday, maxMoveCountToday, 'bg-[var(--bg-surface)]')} hover:border-[var(--accent-border-hover)]
      ${opened ? 'opacity-55 hover:opacity-100 border-[var(--border-default)]' : soon !== null ? 'border-[var(--border-default)] border-l-[3px] border-l-red-500' : 'border-[var(--border-default)] border-l-[3px] border-l-[var(--accent)]'}`}>
      <CoverLink game={game} onOpen={onOpen} note={note} />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Badge game={game} />
          <MoveCountBadge game={game} />
        </div>
        <div className="flex items-center gap-2">
          {opened && <span className="text-[11px] text-[var(--text-tertiary)]">opened</span>}
          {soon !== null && !opened && (
            <span className="text-[11px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
              ⏱ {formatTimeRemaining(Math.round(soon / 1000))}
            </span>
          )}
          <HistoryLink game={game} />
          <SinkButton game={game} sunk={sunk} onToggleSink={onToggleSink} />
          <PinButton game={game} pinned={pinned} onTogglePin={onTogglePin} />
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="font-semibold text-[14px] text-[var(--text-primary)] truncate">{game.gameName}</div>
        <TableLabelEditor game={game} label={tableLabel} onSaveLabel={onSaveTableLabel} />
      </div>

      {game.players.length > 0 && (
        <div className="text-xs text-[var(--text-tertiary)] hidden sm:block truncate">
          with {game.players.join(', ')}
        </div>
      )}

      <NoteEditor game={game} note={note} onSaveNote={onSaveNote} />

      {showProgress && <ProgressBar game={game} />}

      <span className={`text-xs ${(game.urgent || slow) && soon === null ? 'text-amber-500 font-medium' : 'text-[var(--text-tertiary)]'}`}>
        {game.lastMoveAgo}
      </span>
    </div>
  )
}

// A game waiting for someone else: one compact row
export function GameRow({ game, pinned, onTogglePin, sunk, onToggleSink, onOpen, opponentSlowDays, note, onSaveNote, tableLabel, onSaveTableLabel, now, opened, showProgress, maxMoveCountToday }: GameItemProps) {
  const slow = isOpponentSlow(game, opponentSlowDays, now)
  return (
    <div className={`relative flex flex-wrap items-center gap-2 px-3 py-2 rounded-md border hover:border-[var(--accent-border-hover)] transition-colors
      ${heatBg(game.moveCountToday, maxMoveCountToday, slow ? 'bg-amber-50/40' : 'bg-[var(--bg-surface)]')} ${slow ? 'border-amber-200' : 'border-[var(--border-subtle)]'} ${opened ? 'opacity-55 hover:opacity-100' : ''}`}>
      <CoverLink game={game} onOpen={onOpen} note={note} />
      <Badge game={game} small />
      <MoveCountBadge game={game} small />
      {/* A floor instead of min-w-0: once every shrink-0 sibling after this
          (timestamp, progress, icon buttons) no longer fits alongside a
          readable name, they wrap to their own line below — rather than
          this zone shrinking the name down past legibility to keep everyone
          on one line, as it did when it only had overflow-hidden */}
      <div className="min-w-[140px] flex-1 flex items-baseline gap-2 overflow-hidden">
        <span className="text-sm text-[var(--text-primary)] truncate">{game.gameName}</span>
        <TableLabelEditor game={game} label={tableLabel} onSaveLabel={onSaveTableLabel} compact />
        {game.currentPlayer && <span className="hidden sm:inline text-xs text-[var(--text-tertiary)] truncate">waiting for {game.currentPlayer}</span>}
        {/* Just the text here — its own edit/delete icons are the compact
            NoteEditor below, shown at every width, not only md:inline */}
        {note && <span className="hidden md:inline text-xs text-[var(--text-secondary)] italic whitespace-normal break-words">{note}</span>}
      </div>
      <span className={`shrink-0 text-xs ${slow ? 'text-amber-600 font-medium' : 'text-[var(--text-tertiary)]'}`}>
        {slow ? '⏱ ' : ''}{game.lastMoveAgo}
      </span>
      {showProgress && <ProgressBar game={game} compact />}
      <NoteEditor game={game} note={note} onSaveNote={onSaveNote} compact />
      <HistoryLink game={game} />
      <SinkButton game={game} sunk={sunk} onToggleSink={onToggleSink} />
      <PinButton game={game} pinned={pinned} onTogglePin={onTogglePin} />
    </div>
  )
}
