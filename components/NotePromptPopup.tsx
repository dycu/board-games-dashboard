'use client'
import { useEffect, useRef, useState } from 'react'
import { Game } from '@/lib/types'

// Shown once a fetch made while actually back on the dashboard confirms a
// move landed (see lib/dismissal.ts's nextNotePrompt) — the moment the plan
// for next round is still fresh, and the one moment that's reliably true
// regardless of whether the game opened in this tab or a new one.
export default function NotePromptPopup({ game, note, onSave, onDelete }: {
  game: Game
  note?: string
  onSave: (text: string) => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState(note ?? '')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Resets the draft when the popup switches to a different game, and fills
  // in the note if it's still loading (useNotes) when the popup first opens
  // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing to the game/note identity, not derivable without one
  useEffect(() => { setDraft(note ?? '') }, [note, game.id])
  useEffect(() => { inputRef.current?.focus() }, [game.id])

  // Every way of closing (Escape, clicking outside, the Save button) saves
  // whatever's in the field — there's no separate "discard my edit" path,
  // since that scenario doesn't come up in practice.
  const save = () => onSave(draft)
  const saveRef = useRef(save)
  useEffect(() => { saveRef.current = save })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') saveRef.current() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // Just clears the saved note, without also closing the popup the way
  // Save does — deleting an old plan is a reason to write a fresh one, not
  // to walk away from the prompt entirely. Keeps the input focused (see
  // the delete button's onMouseDown below) so a replacement can be typed
  // right away, without the on-screen keyboard closing and reopening.
  const remove = () => { onDelete(); setDraft(''); inputRef.current?.focus() }

  // Top-aligned rather than centered: on a tablet in landscape, the
  // on-screen keyboard eats the bottom half of the viewport, and a
  // vertically centered dialog ends up right behind it.
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-16 sm:pt-24" onClick={save}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-prompt-title"
        className="w-full max-w-sm bg-[var(--bg-surface)] rounded-lg shadow-xl border border-[var(--border-default)] p-4"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="note-prompt-title" className="text-sm font-semibold text-[var(--text-primary)] mb-1">{game.gameName}</h2>
        <p className="text-xs text-[var(--text-tertiary)] mb-3">Plan for next round?</p>
        <textarea
          ref={inputRef}
          value={draft}
          maxLength={300}
          rows={3}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save() } }}
          placeholder="Note for this game…"
          aria-label={`Note for ${game.gameName}`}
          className="w-full text-sm bg-[var(--bg-surface)] text-[var(--text-primary)] px-2.5 py-1.5 rounded border border-[var(--accent)] mb-3 resize-none"
        />
        <div className="flex items-center justify-between gap-2">
          {note ? (
            <button
              onClick={remove}
              onMouseDown={e => e.preventDefault()}
              aria-label={`Delete the note on ${game.gameName}`}
              title="Delete note"
              className="text-xs text-[var(--icon-muted)] hover:text-red-500">
              ✕
            </button>
          ) : <span />}
          <button onClick={save} className="text-xs font-medium px-3 py-1.5 rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]">
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
