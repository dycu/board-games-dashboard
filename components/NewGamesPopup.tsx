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
        className="w-full max-w-lg max-h-[80vh] flex flex-col bg-white rounded-lg shadow-xl border border-[#e5e5e5]"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="new-games-title" className="px-4 pt-4 pb-2 text-sm font-semibold text-[#1a1a1a]">
          🆕 Something new ({events.length})
        </h2>
        <ul className="flex-1 overflow-y-auto px-4 divide-y divide-[#f0f0f0]">
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
        <div className="flex justify-end px-4 py-3 border-t border-[#f0f0f0]">
          <button
            onClick={onDismiss}
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-[#5e6ad2] text-white hover:bg-[#4f5bc4]"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
