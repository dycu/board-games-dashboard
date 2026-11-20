'use client'
import { useEffect, useState } from 'react'
import { Platform, PLATFORM_LABELS, PLATFORM_SHORT_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import TopNav from '@/components/TopNav'
import NewGameEventRow from '@/components/NewGameEventRow'
import InviteAgainPicker from '@/components/InviteAgainPicker'
import { NewGameEvent, groupEventsByDay, formatEventsForCopy } from '@/lib/newGames/diff'
import { CheckResult } from '@/lib/newGames/check'
import { useBacklog } from '@/hooks/useBacklog'

// Catalog-only platforms (search support, no live game tracking) aren't part
// of lib/types.ts's Platform union, so this page can't rely on PLATFORM_LABELS/
// PLATFORM_SHORT_LABELS having an entry for every result — these cover the gap.
const EXTRA_PLATFORM_LABELS: Record<string, string> = {
  boardtogether: 'BoardTogether',
  tabletapas: 'TableTapas',
}
const EXTRA_PLATFORM_SHORT_LABELS: Record<string, string> = {
  boardtogether: 'B2gthr',
  tabletapas: 'TblTapas',
}
const platformLabel = (p: string) => PLATFORM_LABELS[p as keyof typeof PLATFORM_LABELS] ?? EXTRA_PLATFORM_LABELS[p] ?? p
const platformShortLabel = (p: string) => PLATFORM_SHORT_LABELS[p as keyof typeof PLATFORM_SHORT_LABELS] ?? EXTRA_PLATFORM_SHORT_LABELS[p] ?? p

interface GameMatch {
  name: string
  url: string
}

interface PlatformResult {
  platform: string
  matches: GameMatch[]
}

interface SearchApiResponse {
  results: PlatformResult[]
  errors: { platform: string; error: string }[]
}

function FindGamePanel() {
  const [query, setQuery] = useState('')
  const [data, setData] = useState<SearchApiResponse | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  const runSearch = async () => {
    const q = query.trim()
    if (!q) return
    setIsSearching(true)
    try {
      const res = await fetch(`/api/game-search?q=${encodeURIComponent(q)}`)
      const json = await res.json()
      setData(json)
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div>
      <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)] p-5 mb-5">
        <p className="text-xs text-[var(--text-tertiary)] mb-3">
          Search BGA, Yucata, Rally the Troops, 18xx.games, choochoo.games, OnlineBoardGamers, BoardTogether, TableTapas and Boardgamers.space at once to see where a game is available.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runSearch() }}
            placeholder="Game name…"
            className="flex-1 bg-[var(--bg-surface)] text-[var(--text-primary)] text-sm px-3 py-1.5 rounded-md border border-[var(--border-default)]"
          />
          <button
            onClick={runSearch}
            disabled={!query.trim() || isSearching}
            className="text-xs bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] px-3 py-1.5 rounded-md disabled:opacity-50 whitespace-nowrap"
          >
            {isSearching ? 'Searching…' : 'Search'}
          </button>
        </div>
      </div>

      {data && (
        <div className="space-y-3">
          {data.results.map(r => {
            const err = data.errors.find(e => e.platform === r.platform)
            return (
              <div key={r.platform} className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)] p-5">
                <div className="flex items-center justify-between mb-2">
                  <span title={platformLabel(r.platform)} className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${BADGE_COLORS[r.platform] ?? 'bg-[var(--bg-muted)] text-[var(--text-secondary)]'}`}>
                    {platformShortLabel(r.platform)}
                  </span>
                </div>
                {err ? (
                  <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md">
                    ⚠ {platformLabel(r.platform)} unavailable
                  </span>
                ) : r.matches.length === 0 ? (
                  <p className="text-xs text-[var(--text-tertiary)]">No match found</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {r.matches.map(m => (
                      <div key={m.name} className="flex items-center justify-between gap-2">
                        <span className="text-sm text-[var(--text-primary)]">{m.name}</span>
                        <a
                          href={m.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium px-3 py-1 rounded-md bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-muted-hover)] whitespace-nowrap"
                        >
                          Open →
                        </a>
                      </div>
                    ))}
                  </div>
                )}
                <InviteAgainPicker platform={r.platform as Platform} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// A persistent view of what the twice-daily check has found, so a new game
// doesn't go unnoticed just because the popup was dismissed unseen or the
// email hasn't arrived yet — everything already found is browsable here any
// time, and "Check now" runs the real check on demand instead of waiting.
export function NewGamesPanel() {
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

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          onClick={checkNow}
          disabled={checking}
          className="text-xs bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-muted-hover)] disabled:opacity-50 disabled:cursor-not-allowed px-2.5 py-1 rounded-md flex items-center gap-1"
        >
          <span className={checking ? 'animate-spin inline-block' : ''}>↻</span>
          {checking ? 'Checking…' : 'Check now'}
        </button>
      </div>
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
  )
}

export default function SearchPage() {
  const [tab, setTab] = useState<'find' | 'new'>('find')
  const pill = (active: boolean) => `text-xs px-3 py-1 rounded-full font-medium transition-colors
    ${active ? 'bg-[var(--text-primary)] text-[var(--bg-surface)]' : 'bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-muted-hover)]'}`

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav />
      <div className="flex-1 overflow-y-auto p-5 max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-1 mb-4">
          <button onClick={() => setTab('find')} className={pill(tab === 'find')}>Find a game</button>
          <button onClick={() => setTab('new')} className={pill(tab === 'new')}>New games</button>
        </div>
        <div className={tab === 'find' ? '' : 'hidden'}><FindGamePanel /></div>
        <div className={tab === 'new' ? '' : 'hidden'}><NewGamesPanel /></div>
      </div>
    </div>
  )
}
