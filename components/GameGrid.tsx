'use client'
import { useEffect, useState } from 'react'
import { Game, UserPrefs, GamesApiResponse, PLATFORM_LABELS, PLATFORM_URLS } from '@/lib/types'
import { DepartedGame } from '@/hooks/useGamesData'
import { sortAndFilter } from '@/lib/sort-filter'
import { BADGE_COLORS } from '@/lib/platform-colors'
import GameCard from './GameCard'
import FilterToolbar from './FilterToolbar'
import TopNav from './TopNav'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'

interface Props {
  data: GamesApiResponse
  prefs: UserPrefs
  onPrefsChange: (p: UserPrefs) => void
  dismissed: Set<string>
  onDismiss: (id: string) => void
  onRefresh: () => void
  isRefreshing: boolean
  lastError: string | null
  cachedAt: string | null
  opened: Set<string>
  onOpen: (id: string) => void
  departedGames: DepartedGame[]
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function GameGrid({ data, prefs, onPrefsChange, dismissed, onDismiss, onRefresh, isRefreshing, lastError, cachedAt, opened, onOpen, departedGames }: Props) {
  const { games, errors, fetchedAt } = data
  const configuredPlatforms = data.platforms ?? Array.from(
    new Set([...games.map(g => g.platform), ...errors.map(e => e.platform)])
  )
  const visible = games.filter(g => !dismissed.has(g.id))
  const countByPlatform = Object.fromEntries(
    configuredPlatforms.map(p => [p, visible.filter(g => g.platform === p).length])
  )
  const myTurnCount = visible.filter(g => g.myTurn).length
  const myTurnGames = sortAndFilter(visible.filter(g => g.myTurn), prefs)
  const waitingGames = sortAndFilter(visible.filter(g => !g.myTurn), prefs)

  const togglePin = async (id: string) => {
    const pins = prefs.pins.includes(id)
      ? prefs.pins.filter(p => p !== id)
      : [...prefs.pins, id]
    const updated = { ...prefs, pins }
    onPrefsChange(updated)
    await fetch('/api/prefs', { method: 'POST', body: JSON.stringify({ pins }), headers: { 'Content-Type': 'application/json' } })
  }

  const { intervalSeconds, setIntervalSeconds, countdown } = useAutoRefresh(onRefresh, isRefreshing)

  const [departedDismissed, setDepartedDismissed] = useState(false)
  useEffect(() => {
    if (departedGames.length > 0) setDepartedDismissed(false)
  }, [departedGames])

  const navRight = (
    <>
      <span className="hidden sm:inline">
        {games.length}{' '}active &nbsp;·&nbsp;
        <span className="text-[#5e6ad2] font-medium">{myTurnCount}{' '}your turn</span>
      </span>
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        className="bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb] disabled:opacity-50 disabled:cursor-not-allowed px-2.5 py-1 rounded-md flex items-center gap-1">
        <span className={isRefreshing ? 'animate-spin inline-block' : ''}>↻</span>
        <span className="hidden sm:inline">Refresh</span>
      </button>
      {intervalSeconds > 0 && (
        <span className="hidden sm:inline">{countdown}s</span>
      )}
      <select
        value={intervalSeconds}
        onChange={e => setIntervalSeconds(Number(e.target.value))}
        className="bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb] text-xs px-2 py-1 rounded-md cursor-pointer"
      >
        <option value={0}>Off</option>
        <option value={30}>30s</option>
        <option value={60}>1m</option>
        <option value={300}>5m</option>
      </select>
    </>
  )

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopNav right={navRight} />
      <div className="flex-1 overflow-y-auto p-5">
        {lastError && cachedAt && (
          <div className="mb-3 text-xs text-amber-600">
            Last refresh failed — showing cache from {timeAgo(cachedAt)}
          </div>
        )}

        {departedGames.length > 0 && !departedDismissed && (
          <div className="mb-3 flex items-center gap-1.5 text-xs text-[#6b6b6b]">
            <span>↩</span>
            <span>
              {departedGames.length === 1 ? '1 game' : `${departedGames.length} games`} ended since last refresh:{' '}
              {departedGames.map((g, i) => (
                <span key={g.id}>
                  {i > 0 && ', '}
                  <a href={g.gameUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-[#1a1a1a]">
                    {g.gameName}
                  </a>
                </span>
              ))}
            </span>
            <button
              onClick={() => setDepartedDismissed(true)}
              className="ml-1 text-[#9b9b9b] hover:text-[#1a1a1a] leading-none"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        {errors.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {errors.map(e => (
              <span key={e.platform} className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md">
                ⚠ {e.platform} unavailable
              </span>
            ))}
          </div>
        )}

        {configuredPlatforms.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {configuredPlatforms.map(p => (
              <a
                key={p}
                href={PLATFORM_URLS[p]}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${BADGE_COLORS[p] ?? 'bg-[#f3f3f3] text-[#6b6b6b]'}`}>
                {PLATFORM_LABELS[p]} ({countByPlatform[p] ?? 0})
              </a>
            ))}
          </div>
        )}

        <FilterToolbar prefs={prefs} onChange={onPrefsChange} />

        {myTurnGames.length > 0 && (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#9b9b9b] mb-3">
              Your turn · {myTurnGames.length}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5 mb-7">
              {myTurnGames.map(g => (
                <GameCard key={g.id} game={g} pinned={prefs.pins.includes(g.id)} onTogglePin={togglePin} onDismiss={() => onDismiss(g.id)} opened={opened.has(g.id)} onOpen={() => onOpen(g.id)} />
              ))}
            </div>
          </>
        )}

        {waitingGames.length > 0 && (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#9b9b9b] mb-3">
              Waiting for others · {waitingGames.length}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5">
              {waitingGames.map(g => (
                <GameCard key={g.id} game={g} pinned={prefs.pins.includes(g.id)} onTogglePin={togglePin} onDismiss={() => onDismiss(g.id)} opened={opened.has(g.id)} onOpen={() => onOpen(g.id)} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
