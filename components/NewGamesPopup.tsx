'use client'
import { useEffect, useState } from 'react'
import { NewGameEvent } from '@/lib/newGames/diff'
import { useBacklog } from '@/hooks/useBacklog'
import NewGameEventRow from './NewGameEventRow'

// Shows what the twice-daily check found since the last dismissal
export default function NewGamesPopup() {
  const [events, setEvents] = useState<NewGameEvent[]>([])

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
    fetch('/api/new-games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seenUpTo }),
    }).catch(() => {})
  }

  return <PopupBody events={events} onDismiss={dismiss} />
}

function PopupBody({ events, onDismiss }: { events: NewGameEvent[]; onDismiss: () => void }) {
  const { listsFor, isAdding, toggleOrAdd } = useBacklog()

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
