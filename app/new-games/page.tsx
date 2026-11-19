'use client'
import { useEffect, useState } from 'react'
import TopNav from '@/components/TopNav'
import NewGameEventRow from '@/components/NewGameEventRow'
import { NewGameEvent, groupEventsByDay, formatEventsForCopy } from '@/lib/newGames/diff'
import { CheckResult } from '@/lib/newGames/check'
import { useBacklog } from '@/hooks/useBacklog'

// A persistent view of what the twice-daily check has found, so a new game
// doesn't go unnoticed just because the popup was dismissed unseen or the
// email hasn't arrived yet — everything already found is browsable here any
// time, and "Check now" runs the real check on demand instead of waiting.
export default function NewGamesPage() {
  const [events, setEvents] = useState<NewGameEvent[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [lastCheck, setLastCheck] = useState<CheckResult | null>(null)
  const [copied, setCopied] = useState(false)
  const backlog = useBacklog()

  const load = () => fetch('/api/new-games?all=1')
    .then(res => res.json())
    .then(json => {
      if (json.error) throw new Error(json.error)
      setEvents(json.events)
      setLoadError(null)
      // Visiting this page is as good as seeing the popup — don't ask again
      // about anything already shown here.
      if (json.events.length > 0) {
        const seenUpTo = json.events.reduce((max: string, e: NewGameEvent) => (e.at > max ? e.at : max), json.events[0].at)
        fetch('/api/new-games', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seenUpTo }),
        }).catch(() => {})
      }
    })
    .catch(e => setLoadError(e instanceof Error ? e.message : 'Failed to load'))

  useEffect(() => { load() }, [])

  const checkNow = async () => {
    setChecking(true)
    setCheckError(null)
    try {
      const res = await fetch('/api/new-games/sync', { method: 'POST' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setLastCheck(data)
      await load()
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : 'Check failed')
    } finally {
      setChecking(false)
    }
  }

  const copyToday = async (todaysEvents: NewGameEvent[]) => {
    try {
      await navigator.clipboard.writeText(formatEventsForCopy(todaysEvents))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard access denied/unavailable — nothing more to do here
    }
  }

  const navRight = (
    <button
      onClick={checkNow}
      disabled={checking}
      className="bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-muted-hover)] disabled:opacity-50 disabled:cursor-not-allowed px-2.5 py-1 rounded-md flex items-center gap-1">
      <span className={checking ? 'animate-spin inline-block' : ''}>↻</span>
      <span className="hidden sm:inline">{checking ? 'Checking…' : 'Check now'}</span>
    </button>
  )

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav right={navRight} />
      <div className="flex-1 overflow-y-auto p-5 max-w-2xl mx-auto w-full">
        {checkError && <p className="text-xs text-red-500 mb-3">⚠ {checkError}</p>}
        {lastCheck && !checkError && (
          <p className="text-xs text-[var(--text-secondary)] mb-3">
            {lastCheck.events.length === 0
              ? 'Just checked — nothing new.'
              : `Just checked — found ${lastCheck.events.length} new ${lastCheck.events.length === 1 ? 'item' : 'items'}.`}
          </p>
        )}

        {loadError ? (
          <div className="text-center py-12 text-red-500">⚠ {loadError}</div>
        ) : events === null ? (
          <div className="text-center py-12 text-[var(--text-tertiary)]">Loading…</div>
        ) : events.length === 0 ? (
          <div className="text-center py-12 text-[var(--text-tertiary)]">Nothing found yet.</div>
        ) : (
          <div className="flex flex-col gap-4">
            {groupEventsByDay(events).map(group => (
              <div key={group.dateKey}>
                <div className="flex items-center justify-between gap-2 mb-1.5 px-1">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--text-tertiary)]">
                    {group.label}
                  </h2>
                  {group.label === 'Today' && (
                    <button
                      onClick={() => copyToday(group.events)}
                      className="text-[11px] font-medium text-[var(--accent)] hover:underline"
                    >
                      {copied ? 'Copied!' : 'Copy list'}
                    </button>
                  )}
                </div>
                <ul className="divide-y divide-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)] px-4">
                  {group.events.map(e => (
                    <NewGameEventRow
                      key={e.id}
                      event={e}
                      lists={backlog.listsFor(e.platform, e.name)}
                      disabled={backlog.isAdding(e.platform, e.name)}
                      onToggle={list => backlog.toggleOrAdd({ platform: e.platform, gameName: e.name, playUrl: e.url, list })}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
