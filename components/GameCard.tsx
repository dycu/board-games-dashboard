'use client'
import { useRef, useState } from 'react'
import { Game, PLATFORM_LABELS, PLATFORM_SHORT_LABELS } from '@/lib/types'
import { BacklogList, SHORT_LIST_LABELS } from '@/lib/backlog/list'
import { BADGE_COLORS } from '@/lib/platform-colors'
import { formatTimeRemaining } from '@/lib/connectors/utils'
import { deadlineSoon } from '@/lib/sort-filter'
import { useNoteConfirmedOpen } from '@/hooks/useNoteConfirmedOpen'
import HistoryLink from './HistoryLink'
import PlayerHoverCard from './PlayerHoverCard'
import ProgressBar from './ProgressBar'
import ReadNotePopup from './ReadNotePopup'
import TableMovesPopup from './TableMovesPopup'

// Pin (always first in its section) and sink (always last) are opposite
// ends of one priority scale, not two independent flags — null is neither.
export type Priority = 'pinned' | 'sunk' | null

export interface GameItemProps {
  game: Game
  priority: Priority
  onCyclePriority: (id: string) => void
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
  backlogLists: BacklogList[] // the backlog list(s) this title is tracked under, if any — see BacklogBadge
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

// Cycles neutral -> pinned -> sunk -> neutral. One control instead of two
// independent buttons, so a game can't end up both pinned and sunk at
// once — a real contradiction (always-first and always-last) the old
// pair of buttons allowed.
function PriorityButton({ game, priority, onCyclePriority }: Pick<GameItemProps, 'game' | 'priority' | 'onCyclePriority'>) {
  const label = priority === 'pinned' ? 'Pinned to the top — click to sink to the end instead'
    : priority === 'sunk' ? 'Sunk to the end — click to clear'
    : 'Pin to the top'
  const glyph = priority === 'pinned' ? '★' : priority === 'sunk' ? '▼' : '☆'
  const color = priority === 'pinned' ? 'text-amber-400'
    : priority === 'sunk' ? 'text-slate-400'
    : 'text-[var(--icon-muted)] hover:text-amber-400'
  return (
    <button
      aria-label={label}
      title={label}
      onClick={() => onCyclePriority(game.id)}
      className={`relative z-10 text-sm transition-colors ${color}`}>
      {glyph}
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

// A comma-joined list of player names, each hoverable/tappable (see
// PlayerHoverCard) and clickable through to their Players page entry.
// `highlight` (the resolved currentPlayer, if any) picks one name out to
// bold — used by GameRow's "waiting for" line so it shows the whole
// table, not just whoever's turn it is.
function PlayerNames({ platform, names, avatars, highlight }: {
  platform: Game['platform']; names: string[]; avatars?: Record<string, string>; highlight?: string
}) {
  return (
    <>
      {names.map((name, i) => (
        <span key={name}>
          {i > 0 && ', '}
          <PlayerHoverCard platform={platform} name={name} avatarUrl={avatars?.[name]} highlighted={highlight !== undefined && name === highlight} />
        </span>
      ))}
    </>
  )
}

const DOT_GROUP_SIZE = 5

// Today's moves on this game, one dot each — grouped in fives (a glance
// reads "two full rows and three" instead of counting dots one by one),
// and never capped: a very active day just grows another row rather than
// losing moves to a "+N" overflow. Whichever dots are new since the last
// render pop in (see .dot-pop in globals.css) — the point is to feel the
// count move, not just read a bigger number.
// Only shown once something actually happened today — a game you're not
// actively grinding on looks exactly like it did before this existed.
function MoveCountBadge({ game, small }: { game: Game; small?: boolean }) {
  const count = game.moveCountToday ?? 0
  // The previous render's count, to tell which dots are new — React's own
  // "adjust state during render" pattern (not a ref: reading one during
  // render isn't allowed) for deriving a previous value from a prop change.
  const [trackedCount, setTrackedCount] = useState(count)
  const [prevCount, setPrevCount] = useState(0)
  if (count !== trackedCount) {
    setPrevCount(trackedCount)
    setTrackedCount(count)
  }
  // The popup this opens (TableMovesPopup) is its own trigger — the dots
  // are the only entry point into it, so there's no separate way to see a
  // table's move history on a day it hasn't had any moves yet. It anchors
  // itself to this button (btnRef), the same way ProgressBar's own tooltip
  // anchors to the progress bar, rather than a page-centered dialog.
  const [historyOpen, setHistoryOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  if (!count) return null

  const dotSize = small ? 'w-1.5 h-1.5' : 'w-2 h-2'
  const groups = Math.ceil(count / DOT_GROUP_SIZE)

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setHistoryOpen(true)}
        aria-label={`Move history for ${game.gameName}`}
        title={`${count} move${count === 1 ? '' : 's'} today`}
        className="relative z-10 inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 -m-1.5 p-1.5 rounded hover:bg-[var(--bg-muted)]">
        {Array.from({ length: groups }, (_, gi) => {
          const start = gi * DOT_GROUP_SIZE
          const inGroup = Math.min(DOT_GROUP_SIZE, count - start)
          return (
            <span key={gi} className="inline-flex gap-0.5">
              {Array.from({ length: inGroup }, (_, i) => {
                const idx = start + i
                return (
                  <span
                    key={idx}
                    className={`inline-block rounded-full ${dotSize} ${gi % 2 === 0 ? 'bg-orange-500' : 'bg-orange-300'} ${idx >= prevCount ? 'dot-pop' : ''}`}
                  />
                )
              })}
            </span>
          )
        })}
      </button>
      {historyOpen && <TableMovesPopup game={game} anchorRef={btnRef} onClose={() => setHistoryOpen(false)} />}
    </>
  )
}

// Only shown when this title is actually tracked somewhere in the backlog
// — an untracked game's card looks exactly like it did before this
// existed. Muted on purpose: this is a cross-reference, not a status that
// needs attention the way the heat or deadline badges do.
function BacklogBadge({ lists, small }: { lists: BacklogList[]; small?: boolean }) {
  if (lists.length === 0) return null
  const labels = lists.map(l => SHORT_LIST_LABELS[l])
  const text = labels.length === 1 ? labels[0] : `${labels[0]} +${labels.length - 1}`
  return (
    <span
      title={`In your backlog: ${labels.join(', ')}`}
      className={`shrink-0 font-medium rounded-full bg-[var(--bg-muted)] text-[var(--text-secondary)] ${small ? 'text-[10px] px-1.5 py-px' : 'text-[11px] px-2 py-0.5'}`}>
      🔖 {text}
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

// A game waiting for my move: a full card. `highlight` gives it the same
// gentle accent tint as the priority layout's active compact cards — used
// only for that layout's top strip; the classic grid never passes it, so
// its cards look exactly as they did before.
export default function GameCard({ game, priority, onCyclePriority, onOpen, opponentSlowDays, deadlineSoonHours, note, onSaveNote, tableLabel, onSaveTableLabel, now, opened, backlogLists, highlight }: GameItemProps & { highlight?: boolean }) {
  const soon = deadlineSoon(game, now, deadlineSoonHours * 3600_000)
  const slow = isOpponentSlow(game, opponentSlowDays, now)

  return (
    <div className={`relative rounded-lg border p-3.5 flex flex-col gap-2 transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:border-[var(--accent-border-hover)]
      ${highlight && !opened ? 'bg-[var(--accent-tint)]' : 'bg-[var(--bg-surface)]'}
      ${opened ? 'opacity-55 hover:opacity-100 border-[var(--border-default)]' : soon !== null ? 'border-[var(--border-default)] border-l-[3px] border-l-red-500' : 'border-[var(--border-default)] border-l-[3px] border-l-[var(--accent)]'}`}>
      <CoverLink game={game} onOpen={onOpen} note={note} />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Badge game={game} />
          <MoveCountBadge game={game} />
          <BacklogBadge lists={backlogLists} />
        </div>
        <div className="flex items-center gap-2">
          {opened && <span className="text-[11px] text-[var(--text-tertiary)]">opened</span>}
          {soon !== null && !opened && (
            <span className="text-[11px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
              ⏱ {formatTimeRemaining(Math.round(soon / 1000))}
            </span>
          )}
          <HistoryLink game={game} />
          <PriorityButton game={game} priority={priority} onCyclePriority={onCyclePriority} />
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="font-semibold text-[14px] text-[var(--text-primary)] truncate">{game.gameName}</div>
        <TableLabelEditor game={game} label={tableLabel} onSaveLabel={onSaveTableLabel} />
      </div>

      {game.players.length > 0 && (
        <div className="text-xs text-[var(--text-tertiary)] truncate">
          with <PlayerNames platform={game.platform} names={game.players} avatars={game.playerAvatars} />
        </div>
      )}

      <NoteEditor game={game} note={note} onSaveNote={onSaveNote} />

      <ProgressBar game={game} />

      <span className={`text-xs ${(game.urgent || slow) && soon === null ? 'text-amber-500 font-medium' : 'text-[var(--text-tertiary)]'}`}>
        {game.lastMoveAgo}
      </span>
    </div>
  )
}

// One card in the "priority" layout's dense everything-else grid (see
// GameGrid) — a smaller GameCard with a rank number instead of the usual
// red/accent left border, covering both overflow your-turn games and
// waiting games alike so the two read as one continuous, ordered list.
// `waiting` (and `opened`) mark it as nothing-to-do-here with a plain
// background and a hollow rank badge instead; an active card (still your
// move) gets a gentle accent tint instead — the opposite of making the
// inactive ones fade out, which competed with the real urgency/slow-
// opponent indicators for attention.
export function GameCardCompact({ game, priority, onCyclePriority, onOpen, opponentSlowDays, deadlineSoonHours, note, onSaveNote, tableLabel, onSaveTableLabel, now, opened, backlogLists, rank, waiting }: GameItemProps & { rank: number; waiting?: boolean }) {
  const soon = deadlineSoon(game, now, deadlineSoonHours * 3600_000)
  const slow = isOpponentSlow(game, opponentSlowDays, now)
  const inactive = waiting || opened

  return (
    <div className={`relative rounded-lg border p-2.5 flex flex-col gap-1.5 transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:border-[var(--accent-border-hover)]
      ${inactive ? 'bg-[var(--bg-surface)] border-[var(--border-default)]' : 'bg-[var(--accent-tint)] border-[var(--accent-border-hover)]'}
      ${!inactive && soon !== null ? 'border-l-[3px] border-l-red-500' : ''}`}>
      <span aria-label={`#${rank}`} className={`absolute -top-2 -left-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold leading-none
        ${inactive ? 'bg-transparent border border-[var(--border-default)] text-[var(--text-tertiary)]' : 'bg-[var(--accent)] text-white'}`}>
        {rank}
      </span>
      <CoverLink game={game} onOpen={onOpen} note={note} />
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1 min-w-0">
          <Badge game={game} small />
          <MoveCountBadge game={game} small />
          <BacklogBadge lists={backlogLists} small />
        </div>
        <div className="flex items-center gap-1.5">
          {opened && <span className="text-[10px] text-[var(--text-tertiary)]">opened</span>}
          {soon !== null && !opened && (
            <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1 py-0.5 rounded">
              ⏱ {formatTimeRemaining(Math.round(soon / 1000))}
            </span>
          )}
          <HistoryLink game={game} />
          <PriorityButton game={game} priority={priority} onCyclePriority={onCyclePriority} />
        </div>
      </div>

      <div className="flex items-center gap-1 min-w-0">
        <div className="font-medium text-xs text-[var(--text-primary)] truncate">{game.gameName}</div>
        <TableLabelEditor game={game} label={tableLabel} onSaveLabel={onSaveTableLabel} compact />
      </div>

      {game.players.length > 0 && (
        <div className="text-[11px] text-[var(--text-tertiary)] whitespace-normal break-words">
          {waiting ? 'waiting for ' : 'with '}
          <PlayerNames platform={game.platform} names={game.players} avatars={game.playerAvatars} highlight={waiting ? game.currentPlayer : undefined} />
        </div>
      )}

      <NoteEditor game={game} note={note} onSaveNote={onSaveNote} />

      <div className="flex items-center justify-between gap-2">
        <ProgressBar game={game} compact />
        <span className={`shrink-0 text-[10px] ${waiting && slow ? 'text-amber-500 font-medium' : 'text-[var(--text-tertiary)]'}`}>
          {waiting && slow ? '⏱ ' : ''}{game.lastMoveAgo}
        </span>
      </div>
    </div>
  )
}

// A game waiting for someone else: one compact row
export function GameRow({ game, priority, onCyclePriority, onOpen, opponentSlowDays, note, onSaveNote, tableLabel, onSaveTableLabel, now, opened, backlogLists }: GameItemProps) {
  const slow = isOpponentSlow(game, opponentSlowDays, now)
  return (
    <div className={`relative flex flex-wrap items-center gap-2 px-3 py-2 rounded-md border hover:border-[var(--accent-border-hover)] transition-colors
      ${slow ? 'bg-amber-50/40' : 'bg-[var(--bg-surface)]'} ${slow ? 'border-amber-200' : 'border-[var(--border-subtle)]'} ${opened ? 'opacity-55 hover:opacity-100' : ''}`}>
      <CoverLink game={game} onOpen={onOpen} note={note} />
      <Badge game={game} small />
      <MoveCountBadge game={game} small />
      <BacklogBadge lists={backlogLists} small />
      {/* A floor instead of min-w-0: once every shrink-0 sibling after this
          (timestamp, progress, icon buttons) no longer fits alongside a
          readable name, they wrap to their own line below — rather than
          this zone shrinking the name down past legibility to keep everyone
          on one line, as it did when it only had overflow-hidden */}
      <div className="min-w-[140px] flex-1 overflow-hidden">
        <div className="flex items-baseline gap-2">
          <span className="text-sm text-[var(--text-primary)] truncate">{game.gameName}</span>
          <TableLabelEditor game={game} label={tableLabel} onSaveLabel={onSaveTableLabel} compact />
          {/* Just the text here — its own edit/delete icons are the compact
              NoteEditor below, shown at every width, not only md:inline */}
          {note && <span className="hidden md:inline text-xs text-[var(--text-secondary)] italic whitespace-normal break-words">{note}</span>}
        </div>
        {game.players.length > 0 && (
          <div className="text-xs text-[var(--text-tertiary)] truncate">
            waiting for <PlayerNames platform={game.platform} names={game.players} avatars={game.playerAvatars} highlight={game.currentPlayer} />
          </div>
        )}
      </div>
      <span className={`shrink-0 text-xs ${slow ? 'text-amber-600 font-medium' : 'text-[var(--text-tertiary)]'}`}>
        {slow ? '⏱ ' : ''}{game.lastMoveAgo}
      </span>
      <ProgressBar game={game} compact />
      <NoteEditor game={game} note={note} onSaveNote={onSaveNote} compact />
      <HistoryLink game={game} />
      <PriorityButton game={game} priority={priority} onCyclePriority={onCyclePriority} />
    </div>
  )
}
