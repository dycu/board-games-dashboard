'use client'
import { ReactNode } from 'react'

// The one corner for every ambient, unprompted notice on the dashboard —
// refresh status, the note prompt, new-games alerts, error toasts — stacked
// here instead of each owning its own scattered fixed position. An item
// that needs to escape this corner once expanded (NotePromptPopup's panel,
// NewGamesPopup's list) still can: a fixed descendant positions against the
// viewport regardless of this wrapper also being fixed, so nesting it here
// doesn't trap it in the corner.
export default function NotificationTray({ children }: { children: ReactNode }) {
  return (
    <div className="fixed bottom-3 right-3 z-50 flex flex-col items-end gap-2 max-w-[calc(100vw-1.5rem)]">
      {children}
    </div>
  )
}
