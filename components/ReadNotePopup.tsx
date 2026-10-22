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
        className="w-full max-w-sm bg-white rounded-lg shadow-xl border border-[#e5e5e5] p-4"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="read-note-title" className="text-sm font-semibold text-[#1a1a1a] mb-1">{gameName}</h2>
        <p className="text-sm text-[#1a1a1a] whitespace-normal break-words mb-4">✎ {note}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="text-xs font-medium px-3 py-1.5 rounded-md text-[#6b6b6b] hover:bg-[#f3f3f3]">
            Cancel
          </button>
          <button onClick={onConfirm} autoFocus className="text-xs font-medium px-3 py-1.5 rounded-md bg-[#5e6ad2] text-white hover:bg-[#4f5ab8]">
            Play →
          </button>
        </div>
      </div>
    </div>
  )
}
