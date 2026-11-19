'use client'
import { useEffect } from 'react'

// Shown when opening a game that has a note — see hooks/useNoteConfirmedOpen.
export default function ReadNotePopup({ gameName, note, onConfirm, onCancel }: {
  gameName: string
  note: string
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-16 sm:pt-24" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="read-note-title"
        className="w-full max-w-sm bg-[var(--bg-surface)] rounded-lg shadow-xl border border-[var(--border-default)] p-4"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="read-note-title" className="text-sm font-semibold text-[var(--text-primary)] mb-1">{gameName}</h2>
        <p className="text-sm text-[var(--text-primary)] whitespace-normal break-words mb-4">✎ {note}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="text-xs font-medium px-3 py-1.5 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]">
            Cancel
          </button>
          <button onClick={onConfirm} autoFocus className="text-xs font-medium px-3 py-1.5 rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]">
            Play →
          </button>
        </div>
      </div>
    </div>
  )
}
