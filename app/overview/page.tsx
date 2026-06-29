'use client'
import { useState } from 'react'
import { Platform, PLATFORM_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import { useFinishedGamesData } from '@/hooks/useFinishedGamesData'
import FinishedGameCard from '@/components/FinishedGameCard'
import FetchProgress from '@/components/FetchProgress'

const PAGE_SIZE = 20

export default function OverviewPage() {
  const { data, isLoading, lastError, platformStatuses } = useFinishedGamesData()
  const [platformFilter, setPlatformFilter] = useState<Platform | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const availablePlatforms = data
    ? Array.from(new Set(data.games.map(g => g.platform)))
    : []

  const filtered = data
    ? (platformFilter ? data.games.filter(g => g.platform === platformFilter) : data.games)
    : []

  const visible = filtered.slice(0, visibleCount)
  const hasMore = filtered.length > visibleCount

  const handleFilterChange = (p: Platform | null) => {
    setPlatformFilter(p)
    setVisibleCount(PAGE_SIZE)
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold">Recently Finished Games</h1>
          {data && (
            <p className="text-sm text-slate-500">
              {data.games.length} games · updated {new Date(data.fetchedAt).toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a href="/" className="text-xs bg-slate-800 text-slate-400 hover:bg-slate-700 px-3 py-1.5 rounded-md">
            ← Dashboard
          </a>
          <a href="/setup" className="text-xs bg-slate-800 text-slate-400 hover:bg-slate-700 px-3 py-1.5 rounded-md">
            ⚙ Settings
          </a>
        </div>
      </div>

      {/* Loading */}
      {isLoading && !data && (
        <FetchProgress platformStatuses={platformStatuses} />
      )}

      {isLoading && data && (
        <FetchProgress platformStatuses={platformStatuses} compact />
      )}

      {/* Error */}
      {lastError && !data && (
        <div className="text-center py-12">
          <p className="text-red-400 mb-3">Failed to load finished games</p>
          <a href="/overview" className="text-xs bg-slate-800 text-slate-400 hover:bg-slate-700 px-3 py-1.5 rounded-md">
            ↻ Try again
          </a>
        </div>
      )}

      {/* Platform errors */}
      {data && data.errors.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {data.errors.map(e => (
            <span key={e.platform} className="text-xs bg-red-950 text-red-400 px-2 py-1 rounded-md">
              ⚠ {e.platform} unavailable
            </span>
          ))}
        </div>
      )}

      {/* Platform filter chips */}
      {availablePlatforms.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            onClick={() => handleFilterChange(null)}
            className={`text-xs px-3 py-1 rounded-full font-medium transition-colors
              ${platformFilter === null
                ? 'bg-slate-200 text-slate-900'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
          >
            All ({data?.games.length ?? 0})
          </button>
          {availablePlatforms.map(p => (
            <button
              key={p}
              onClick={() => handleFilterChange(p)}
              className={`text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full transition-opacity
                ${BADGE_COLORS[p] ?? 'bg-slate-800 text-slate-400'}
                ${platformFilter === p ? 'opacity-100 ring-2 ring-white/30' : 'opacity-70 hover:opacity-100'}`}
            >
              {PLATFORM_LABELS[p]} ({data?.games.filter(g => g.platform === p).length ?? 0})
            </button>
          ))}
        </div>
      )}

      {/* Game list */}
      {data && visible.length > 0 && (
        <div className="flex flex-col gap-2">
          {visible.map(g => (
            <FinishedGameCard key={g.id} game={g} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {data && filtered.length === 0 && !isLoading && (
        <div className="text-center py-12 text-slate-500">
          No recently finished games found
          {platformFilter && (
            <span> on {PLATFORM_LABELS[platformFilter]}</span>
          )}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
            className="text-xs bg-slate-800 text-slate-400 hover:bg-slate-700 px-4 py-2 rounded-md"
          >
            Load more ({filtered.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  )
}
