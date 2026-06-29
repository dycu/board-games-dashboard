'use client'
import { Game, UserPrefs, GamesApiResponse, PLATFORM_LABELS, PLATFORM_URLS } from '@/lib/types'
import { sortAndFilter } from '@/lib/sort-filter'
import { BADGE_COLORS } from '@/lib/platform-colors'
import GameCard from './GameCard'
import FilterToolbar from './FilterToolbar'

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

export default function GameGrid({ data, prefs, onPrefsChange, dismissed, onDismiss, onRefresh, isRefreshing, lastError, cachedAt }: Props) {
  const { games, errors, fetchedAt } = data
  const configuredPlatforms = Array.from(
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

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold">Board Games Dashboard</h1>
          <p className="text-sm text-slate-500">
            {games.length}{' '}active &nbsp;·&nbsp;
            <span className="text-blue-400 font-medium">{myTurnCount} your turn</span>
            &nbsp;·&nbsp; updated {new Date(fetchedAt).toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/overview" className="text-xs bg-slate-800 text-slate-400 hover:bg-slate-700 px-3 py-1.5 rounded-md">
            ⊞ Overview
          </a>
          <a href="/setup" className="text-xs bg-slate-800 text-slate-400 hover:bg-slate-700 px-3 py-1.5 rounded-md">
            ⚙ Settings
          </a>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="text-xs bg-slate-800 text-slate-400 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-md flex items-center gap-1.5"
          >
            <span className={isRefreshing ? 'animate-spin inline-block' : ''}>↻</span>
            Refresh
          </button>
        </div>
      </div>
      {lastError && cachedAt && (
        <div className="mb-2 text-xs text-amber-500">
          Last refresh failed — showing cache from {timeAgo(cachedAt)}
        </div>
      )}

      {errors.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {errors.map(e => (
            <span key={e.platform} className="text-xs bg-red-950 text-red-400 px-2 py-1 rounded-md">
              ⚠ {e.platform} unavailable
            </span>
          ))}
        </div>
      )}

      {configuredPlatforms.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {configuredPlatforms.map(p => (
            <a
              key={p}
              href={PLATFORM_URLS[p]}
              target="_blank"
              rel="noopener noreferrer"
              className={`text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${BADGE_COLORS[p] ?? 'bg-slate-800 text-slate-400'}`}>
              {PLATFORM_LABELS[p]} ({countByPlatform[p] ?? 0})
            </a>
          ))}
        </div>
      )}

      <FilterToolbar prefs={prefs} onChange={onPrefsChange} />

      {myTurnGames.length > 0 && (
        <>
          <p className="text-xs uppercase tracking-widest text-slate-500 mb-3">Your turn first ({myTurnGames.length})</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 mb-8">
            {myTurnGames.map(g => (
              <GameCard key={g.id} game={g} pinned={prefs.pins.includes(g.id)} onTogglePin={togglePin} onDismiss={() => onDismiss(g.id)} />
            ))}
          </div>
        </>
      )}

      {waitingGames.length > 0 && (
        <>
          <p className="text-xs uppercase tracking-widest text-slate-500 mb-3">Waiting for others ({waitingGames.length})</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {waitingGames.map(g => (
              <GameCard key={g.id} game={g} pinned={prefs.pins.includes(g.id)} onTogglePin={togglePin} onDismiss={() => onDismiss(g.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
