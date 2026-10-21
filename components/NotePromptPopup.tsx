'use client'
import { useEffect, useRef, useState } from 'react'
import { Game } from '@/lib/types'

// Shown once a fetch made while actually back on the dashboard confirms a
// move landed (see lib/dismissal.ts's nextNotePrompt) — the moment the plan
// for next round is still fresh, and the one moment that's reliably true
// regardless of whether the game opened in this tab or a new one.
export default function NotePromptPopup({ game, note, onSave, onDelete, onDismiss }: {
  game: Game
  note?: string
  onSave: (text: string) => void
  onDelete: () => void
  onDismiss: () => void
}) {
  const [draft, setDraft] = useState(note ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  // Resets the draft when the popup switches to a different game, and fills
  // in the note if it's still loading (useNotes) when the popup first opens
  // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing to the game/note identity, not derivable without one
  useEffect(() => { setDraft(note ?? '') }, [note, game.id])
  useEffect(() => { inputRef.current?.focus() }, [game.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  const save = () => onSave(draft)
  // Just clears the saved note, without also closing the popup the way
  // Skip/Save do — deleting an old plan is a reason to write a fresh one,
  // not to walk away from the prompt entirely.
  const remove = () => { onDelete(); setDraft('') }

  // Top-aligned rather than centered: on a tablet in landscape, the
  // on-screen keyboard eats the bottom half of the viewport, and a
  // vertically centered dialog ends up right behind it.
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-16 sm:pt-24" onClick={onDismiss}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-prompt-title"
        className="w-full max-w-sm bg-white rounded-lg shadow-xl border border-[#e5e5e5] p-4"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="note-prompt-title" className="text-sm font-semibold text-[#1a1a1a] mb-1">{game.gameName}</h2>
        <p className="text-xs text-[#9b9b9b] mb-3">Plan for next round?</p>
        <input
          ref={inputRef}
          value={draft}
          maxLength={300}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save() }}
          placeholder="Note for this game…"
          aria-label={`Note for ${game.gameName}`}
          className="w-full text-sm bg-white text-[#1a1a1a] px-2.5 py-1.5 rounded border border-[#5e6ad2] mb-3"
        />
        <div className="flex items-center justify-between gap-2">
          {note ? (
            <button
              onClick={remove}
              aria-label={`Delete the note on ${game.gameName}`}
              title="Delete note"
              className="text-xs text-[#c5c5c5] hover:text-red-500">
              ✕
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onDismiss} className="text-xs font-medium px-3 py-1.5 rounded-md text-[#6b6b6b] hover:bg-[#f3f3f3]">
              Skip
            </button>
            <button onClick={save} className="text-xs font-medium px-3 py-1.5 rounded-md bg-[#5e6ad2] text-white hover:bg-[#4f5bc4]">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
