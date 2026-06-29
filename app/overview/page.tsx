'use client'
import { useState } from 'react'
import { Platform, PLATFORM_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import { useFinishedGamesData } from '@/hooks/useFinishedGamesData'
import FinishedGameCard from '@/components/FinishedGameCard'
import FetchProgress from '@/components/FetchProgress'
import TopNav from '@/components/TopNav'

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

  const navRight = data ? (
    <span>{data.games.length} games · updated {new Date(data.fetchedAt).toLocaleTimeString()}</span>
  ) : undefined

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav right={navRight} />
      <div className="flex-1 overflow-y-auto p-5 max-w-4xl mx-auto w-full">

        {isLoading && !data && (
          <FetchProgress platformStatuses={platformStatuses} />
        )}

        {isLoading && data && (
          <FetchProgress platformStatuses={platformStatuses} compact />
        )}

        {lastError && !data && (
          <div className="text-center py-12">
            <p className="text-red-500 mb-3">Failed to load finished games</p>
            <a href="/overview" className="text-xs bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb] px-3 py-1.5 rounded-md">
              ↻ Try again
            </a>
          </div>
        )}

        {data && data.errors.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {data.errors.map(e => (
              <span key={e.platform} className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md">
                ⚠ {e.platform} unavailable
              </span>
            ))}
          </div>
        )}

        {availablePlatforms.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mb-5">
            <button
              onClick={() => handleFilterChange(null)}
              className={`text-xs px-3 py-1 rounded-full font-medium transition-colors
                ${platformFilter === null
                  ? 'bg-[#1a1a1a] text-white'
                  : 'bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb]'}`}
            >
              All ({data?.games.length ?? 0})
            </button>
            {availablePlatforms.map(p => (
              <button
                key={p}
                onClick={() => handleFilterChange(p)}
                className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full transition-opacity
                  ${BADGE_COLORS[p] ?? 'bg-[#f3f3f3] text-[#6b6b6b]'}
                  ${platformFilter === p ? 'opacity-100 ring-2 ring-[#1a1a1a]/20' : 'opacity-70 hover:opacity-100'}`}
              >
                {PLATFORM_LABELS[p]} ({data?.games.filter(g => g.platform === p).length ?? 0})
              </button>
            ))}
          </div>
        )}

        {data && visible.length > 0 && (
          <div className="flex flex-col gap-2">
            {visible.map(g => (
              <FinishedGameCard key={g.id} game={g} />
            ))}
          </div>
        )}

        {data && filtered.length === 0 && !isLoading && (
          <div className="text-center py-12 text-[#9b9b9b]">
            No recently finished games found
            {platformFilter && (
              <span> on {PLATFORM_LABELS[platformFilter]}</span>
            )}
          </div>
        )}

        {hasMore && (
          <div className="mt-6 text-center">
            <button
              onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
              className="text-xs bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb] px-4 py-2 rounded-md"
            >
              Load more ({filtered.length - visibleCount} remaining)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
