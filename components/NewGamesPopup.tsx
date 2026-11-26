'use client'
import { useEffect, useState } from 'react'
import { NewGameEvent } from '@/lib/newGames/diff'
import { useBacklog } from '@/hooks/useBacklog'
import { reportNotice } from '@/lib/notify'
import NewGameEventRow from './NewGameEventRow'

// Shows what the twice-daily check found since the last dismissal. Starts
// collapsed to a small chip in the shared NotificationTray (app/page.tsx) —
// it used to pop up as a full-screen blocking modal the instant it had
// anything to show, which (like the old NotePromptPopup) interrupted
// something that's never actually urgent; the list itself only needs the
// full modal treatment once you've asked to see it.
export default function NewGamesPopup() {
  const [events, setEvents] = useState<NewGameEvent[]>([])
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/new-games')
      .then(res => (res.ok ? res.json() : null))
      .then(json => { if (!cancelled && Array.isArray(json?.events)) setEvents(json.events) })
      .catch(() => { /* the popup is optional; the dashboard works without it */ })
    return () => { cancelled = true }
  }, [])

  if (events.length === 0) return null

  const dismiss = () => {
    const seenUpTo = events.reduce((max, e) => (e.at > max ? e.at : max), events[0].at)
    setEvents([])
    setExpanded(false)
    fetch('/api/new-games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seenUpTo }),
    }).catch(() => {})
  }

  if (!expanded) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setExpanded(true)}
          aria-label={`${events.length} new ${events.length === 1 ? 'item' : 'items'} found`}
          className="text-xs bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-xl px-3 py-1.5 shadow-sm hover:border-[var(--accent)]"
        >
          🆕 {events.length} new {events.length === 1 ? 'item' : 'items'}
        </button>
        <button
          onClick={dismiss}
          aria-label="Dismiss new games notice"
          title="Dismiss"
          className="shrink-0 text-[var(--icon-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-full w-6 h-6 flex items-center justify-center shadow-sm text-xs leading-none"
        >
          ✕
        </button>
      </div>
    )
  }

  return <PopupBody events={events} onDismiss={dismiss} />
}

function PopupBody({ events, onDismiss }: { events: NewGameEvent[]; onDismiss: () => void }) {
  const { listsFor, isAdding, toggleOrAdd, error } = useBacklog()

  // listsFor/toggleOrAdd's own errors would otherwise vanish silently —
  // this popup has nowhere inline to show them (unlike /backlog, which
  // already renders `error` itself), so route them to the shared toasts.
  useEffect(() => { if (error) reportNotice('error', error) }, [error])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onDismiss}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-games-title"
        className="w-full max-w-lg max-h-[80vh] flex flex-col bg-[var(--bg-surface)] rounded-lg shadow-xl border border-[var(--border-default)]"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="new-games-title" className="px-4 pt-4 pb-2 text-sm font-semibold text-[var(--text-primary)]">
          🆕 Something new ({events.length})
        </h2>
        <ul className="flex-1 overflow-y-auto px-4 divide-y divide-[var(--border-subtle)]">
          {events.map(e => (
            <NewGameEventRow
              key={e.id}
              event={e}
              lists={listsFor(e.platform, e.name)}
              disabled={isAdding(e.platform, e.name)}
              onToggle={list => toggleOrAdd({ platform: e.platform, gameName: e.name, playUrl: e.url, list })}
            />
          ))}
        </ul>
        <div className="flex justify-end px-4 py-3 border-t border-[var(--border-subtle)]">
          <button
            onClick={onDismiss}
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
