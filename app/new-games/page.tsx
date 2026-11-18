'use client'
import { useEffect, useState } from 'react'
import TopNav from '@/components/TopNav'
import NewGameEventRow from '@/components/NewGameEventRow'
import { NewGameEvent } from '@/lib/newGames/diff'
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

  const navRight = (
    <button
      onClick={checkNow}
      disabled={checking}
      className="bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb] disabled:opacity-50 disabled:cursor-not-allowed px-2.5 py-1 rounded-md flex items-center gap-1">
      <span className={checking ? 'animate-spin inline-block' : ''}>↻</span>
      <span className="hidden sm:inline">{checking ? 'Checking…' : 'Check now'}</span>
    </button>
  )

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav right={navRight} />
      <div className="flex-1 overflow-y-auto p-5 max-w-2xl mx-auto w-full">
        <p className="text-xs text-[#9b9b9b] mb-3">
          New games and release-stage changes on BGA (alpha included), 18xx.games, Rally the
          Troops, Yucata, choochoo.games, Boardgamers.space and BoardTogether, plus new Yucata blog
          posts. Checked automatically twice a day and emailed — &quot;Check now&quot; runs the
          same check immediately instead of waiting.
        </p>

        {checkError && <p className="text-xs text-red-500 mb-3">⚠ {checkError}</p>}
        {lastCheck && !checkError && (
          <p className="text-xs text-[#6b6b6b] mb-3">
            {lastCheck.events.length === 0
              ? 'Just checked — nothing new.'
              : `Just checked — found ${lastCheck.events.length} new ${lastCheck.events.length === 1 ? 'item' : 'items'}.`}
          </p>
        )}

        {loadError ? (
          <div className="text-center py-12 text-red-500">⚠ {loadError}</div>
        ) : events === null ? (
          <div className="text-center py-12 text-[#9b9b9b]">Loading…</div>
        ) : events.length === 0 ? (
          <div className="text-center py-12 text-[#9b9b9b]">Nothing found yet.</div>
        ) : (
          <ul className="divide-y divide-[#f0f0f0] bg-white rounded-xl border border-[#e5e5e5] px-4">
            {events.map(e => (
              <NewGameEventRow
                key={e.id}
                event={e}
                lists={backlog.listsFor(e.platform, e.name)}
                disabled={backlog.isAdding(e.platform, e.name)}
                onToggle={list => backlog.toggleOrAdd({ platform: e.platform, gameName: e.name, playUrl: e.url, list })}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
