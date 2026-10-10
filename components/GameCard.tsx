'use client'
import { useState } from 'react'
import { Game, PLATFORM_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import { formatTimeRemaining } from '@/lib/connectors/utils'
import { deadlineSoon } from '@/lib/sort-filter'
import HistoryLink from './HistoryLink'

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
  now: number
  opened?: boolean // opened since the last refresh that saw me back: dimmed until then
}

const BADGE_FALLBACK = 'bg-[#f3f3f3] text-[#6b6b6b]'

export function openTarget(game: Game): string {
  // BGA opens in this tab (desktop mode on tablets); other sites in a new one
  return game.platform === 'bga' ? '_self' : '_blank'
}

export function isOpponentSlow(game: Game, opponentSlowDays: number, now: number): boolean {
  return !game.myTurn && now - game.lastMoveAt.getTime() > opponentSlowDays * 86_400_000
}

// The whole card/row is the link: an invisible layer over it, with the
// buttons raised above it so they stay clickable
function CoverLink({ game, onOpen }: { game: Game; onOpen: () => void }) {
  return (
    <a
      href={game.gameUrl}
      target={openTarget(game)}
      rel="noopener noreferrer"
      aria-label={`Open ${game.gameName}`}
      onClick={onOpen}
      onAuxClick={onOpen}
      onContextMenu={onOpen}
      className="absolute inset-0 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-[#5e6ad2]"
    />
  )
}

function PinButton({ game, pinned, onTogglePin }: Pick<GameItemProps, 'game' | 'pinned' | 'onTogglePin'>) {
  return (
    <button
      aria-label={pinned ? 'Unpin game' : 'Pin game'}
      onClick={() => onTogglePin(game.id)}
      className={`relative z-10 text-sm transition-colors ${pinned ? 'text-amber-400' : 'text-[#c5c5c5] hover:text-amber-400'}`}>
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
      className={`relative z-10 text-sm transition-colors ${sunk ? 'text-slate-400' : 'text-[#c5c5c5] hover:text-slate-400'}`}>
      {sunk ? '▼' : '▽'}
    </button>
  )
}

export function Badge({ game, small }: { game: Game; small?: boolean }) {
  return (
    <span className={`shrink-0 font-bold uppercase tracking-wide rounded-full ${small ? 'text-[10px] px-1.5 py-px' : 'text-[11px] px-2 py-0.5'} ${BADGE_COLORS[game.platform] ?? BADGE_FALLBACK}`}>
      {PLATFORM_LABELS[game.platform]}
    </span>
  )
}

export function NoteEditor({ game, note, onSaveNote, compact }: Pick<GameItemProps, 'game' | 'note' | 'onSaveNote'> & { compact?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  if (!onSaveNote) return note ? <p className="text-xs text-[#6b6b6b] italic truncate">{note}</p> : null

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
        className={`relative z-10 text-xs bg-white text-[#1a1a1a] px-2 py-1 rounded border border-[#5e6ad2] ${compact ? 'w-40 sm:w-56' : 'w-full'}`}
      />
    )
  }
  const startEditing = () => { setDraft(note ?? ''); setEditing(true) }
  if (compact) {
    // Rows show the note's text themselves; this is just the edit control
    return (
      <button
        onClick={startEditing}
        aria-label={note ? `Edit the note on ${game.gameName}` : `Add a note to ${game.gameName}`}
        title={note ?? 'Add a note'}
        className={`relative z-10 text-xs ${note ? 'text-[#6b6b6b]' : 'text-[#c5c5c5]'} hover:text-[#1a1a1a]`}>
        ✎
      </button>
    )
  }
  return note ? (
    <div className="relative z-10 flex items-center gap-1.5 min-w-0">
      <button
        onClick={startEditing}
        title="Edit note"
        className="min-w-0 text-left text-xs text-[#6b6b6b] italic truncate hover:text-[#1a1a1a]">
        ✎ {note}
      </button>
      <DeleteNote game={game} onSaveNote={onSaveNote} />
    </div>
  ) : (
    <button
      onClick={startEditing}
      aria-label={`Add a note to ${game.gameName}`}
      title="Add a note"
      className="relative z-10 self-start text-xs text-[#c5c5c5] hover:text-[#6b6b6b]">
      ✎ note
    </button>
  )
}

function DeleteNote({ game, onSaveNote }: { game: Game; onSaveNote: (id: string, text: string) => void }) {
  return (
    <button
      onClick={() => onSaveNote(game.id, '')}
      aria-label={`Delete the note on ${game.gameName}`}
      title="Delete note"
      className="relative z-10 shrink-0 text-[11px] leading-none text-[#c5c5c5] hover:text-red-500">
      ✕
    </button>
  )
}

// A game waiting for my move: a full card
export default function GameCard({ game, pinned, onTogglePin, sunk, onToggleSink, onOpen, opponentSlowDays, deadlineSoonHours, note, onSaveNote, now, opened }: GameItemProps) {
  const soon = deadlineSoon(game, now, deadlineSoonHours * 3600_000)
  const slow = isOpponentSlow(game, opponentSlowDays, now)

  return (
    <div className={`relative rounded-lg border p-3.5 flex flex-col gap-2 transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.05)] bg-white hover:border-[#c5c9f0]
      ${opened ? 'opacity-55 hover:opacity-100 border-[#e5e5e5]' : soon !== null ? 'border-[#e5e5e5] border-l-[3px] border-l-red-500' : 'border-[#e5e5e5] border-l-[3px] border-l-[#5e6ad2]'}`}>
      <CoverLink game={game} onOpen={onOpen} />
      <div className="flex items-center justify-between gap-2">
        <Badge game={game} />
        <div className="flex items-center gap-2">
          {opened && <span className="text-[11px] text-[#9b9b9b]">opened</span>}
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

      <div className="font-semibold text-[14px] text-[#1a1a1a]">{game.gameName}</div>

      {game.players.length > 0 && (
        <div className="text-xs text-[#9b9b9b] hidden sm:block truncate">
          with {game.players.join(', ')}
        </div>
      )}

      <NoteEditor game={game} note={note} onSaveNote={onSaveNote} />

      <span className={`text-xs ${(game.urgent || slow) && soon === null ? 'text-amber-500 font-medium' : 'text-[#9b9b9b]'}`}>
        {game.lastMoveAgo}
      </span>
    </div>
  )
}

// A game waiting for someone else: one compact row
export function GameRow({ game, pinned, onTogglePin, sunk, onToggleSink, onOpen, opponentSlowDays, note, onSaveNote, now, opened }: GameItemProps) {
  const slow = isOpponentSlow(game, opponentSlowDays, now)
  return (
    <div className={`relative flex items-center gap-2 px-3 py-2 rounded-md border bg-white hover:border-[#c5c9f0] transition-colors
      ${slow ? 'border-amber-200 bg-amber-50/40' : 'border-[#ececec]'} ${opened ? 'opacity-55 hover:opacity-100' : ''}`}>
      <CoverLink game={game} onOpen={onOpen} />
      <Badge game={game} small />
      <div className="min-w-0 flex-1 flex items-baseline gap-2">
        <span className="text-sm text-[#1a1a1a] truncate">{game.gameName}</span>
        {game.currentPlayer && <span className="hidden sm:inline text-xs text-[#9b9b9b] truncate">waiting for {game.currentPlayer}</span>}
        {note && <span className="hidden md:inline text-xs text-[#6b6b6b] italic truncate">✎ {note}</span>}
        {note && onSaveNote && <span className="hidden md:inline"><DeleteNote game={game} onSaveNote={onSaveNote} /></span>}
      </div>
      <span className={`shrink-0 text-xs ${slow ? 'text-amber-600 font-medium' : 'text-[#9b9b9b]'}`}>
        {slow ? '⏱ ' : ''}{game.lastMoveAgo}
      </span>
      <NoteEditor game={game} note={note} onSaveNote={onSaveNote} compact />
      <HistoryLink game={game} />
      <SinkButton game={game} sunk={sunk} onToggleSink={onToggleSink} />
      <PinButton game={game} pinned={pinned} onTogglePin={onTogglePin} />
    </div>
  )
}
