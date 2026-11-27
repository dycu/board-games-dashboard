'use client'
import { ReactNode } from 'react'

// The one corner for every ambient, passive notice on the dashboard —
// refresh status, new-games alerts, "your turn"/"finished" toasts — stacked
// here instead of each owning its own scattered fixed position. The note
// prompt is deliberately not one of these: it's the one notice that asks
// for an actual decision rather than just FYI, which is exactly the
// standard toast/snackbar-vs-banner split — see NotePromptPopup's own
// comment — so it renders as its own banner elsewhere (app/page.tsx), not
// in this tray. An item here that still needs to escape the corner once
// expanded (NewGamesPopup's list) still can: a fixed descendant positions
// against the viewport regardless of this wrapper also being fixed, so
// nesting it here doesn't trap it in the corner.
export default function NotificationTray({ children }: { children: ReactNode }) {
  return (
    <div className="fixed bottom-3 right-3 z-50 flex flex-col items-end gap-2 max-w-[calc(100vw-1.5rem)]">
      {children}
    </div>
  )
}
