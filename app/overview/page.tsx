'use client'
import { useMemo, useState } from 'react'
import { Platform, PLATFORM_LABELS, PLATFORM_SHORT_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import { useFinishedGamesData } from '@/hooks/useFinishedGamesData'
import FinishedGameCard from '@/components/FinishedGameCard'
import FetchProgress from '@/components/FetchProgress'
import TopNav from '@/components/TopNav'
import AddToBacklogButton from '@/components/AddToBacklogButton'
import { useBacklog } from '@/hooks/useBacklog'
import { useBgaPlayTotals, totalsOf } from '@/hooks/useBgaPlayTotals'
import { aggregatePlayed, playedKey, playedNote } from '@/lib/backlog/played'
import { readCache } from '@/hooks/useGamesData'
import GameLink, { playedGameUrl } from '@/components/GameLink'
import PlayCountChart from '@/components/PlayCountChart'
import PeriodSummary from '@/components/PeriodSummary'

const PAGE_SIZE = 20

export default function OverviewPage() {
  const { data, isLoading, lastError, platformStatuses, refresh } = useFinishedGamesData()
  const backlog = useBacklog()
  const bgaTotals = useBgaPlayTotals()
  const [platformFilter, setPlatformFilter] = useState<Platform | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const availablePlatforms = data
    ? Array.from(new Set(data.games.map(g => g.platform)))
    : []

  const filtered = data
    ? (platformFilter ? data.games.filter(g => g.platform === platformFilter) : data.games)
    : []

  const playCounts = useMemo(
    () => data ? aggregatePlayed([], data.games, totalsOf(bgaTotals)) : [],
    [data, bgaTotals],
  )

  // The same per-game details as Backlog's "From your games", running games included
  const playedByKey = useMemo(
    () => new Map(data
      ? aggregatePlayed(readCache()?.data.games ?? [], data.games, totalsOf(bgaTotals)).map(p => [playedKey(p), p])
      : []),
    [data, bgaTotals],
  )

  const visible = filtered.slice(0, visibleCount)
  const hasMore = filtered.length > visibleCount

  const handleFilterChange = (p: Platform | null) => {
    setPlatformFilter(p)
    setVisibleCount(PAGE_SIZE)
  }

  // Same header as the Active page: count, Refresh
  const navRight = (
    <>
      {data && <span className="hidden sm:inline">{data.games.length} games · updated {new Date(data.fetchedAt).toLocaleTimeString()}</span>}
      <button
        onClick={refresh}
        disabled={isLoading}
        className="bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb] disabled:opacity-50 disabled:cursor-not-allowed px-2.5 py-1 rounded-md flex items-center gap-1">
        <span className={isLoading ? 'animate-spin inline-block' : ''}>↻</span>
        <span className="hidden sm:inline">Refresh</span>
      </button>
    </>
  )

  // First visit with nothing cached: the same full-page progress as the Active page
  if (!data) {
    return (
      <div className="flex flex-col h-screen overflow-hidden">
        <TopNav right={navRight} />
        {isLoading ? <FetchProgress platformStatuses={platformStatuses} /> : lastError && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-red-500 mb-3">Failed to load finished games</p>
              <button onClick={refresh} className="text-xs bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb] px-3 py-1.5 rounded-md">
                ↻ Try again
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const chartGames = platformFilter ? playCounts.filter(g => g.platform === platformFilter) : playCounts

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav right={navRight} />
      {isLoading && <FetchProgress platformStatuses={platformStatuses} compact />}
      <div className="flex-1 overflow-y-auto p-5 max-w-7xl mx-auto w-full">

        {data.errors.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {data.errors.map(e => (
              <span key={e.platform} className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md">
                ⚠ {PLATFORM_LABELS[e.platform]} unavailable
              </span>
            ))}
          </div>
        )}

        {availablePlatforms.length > 1 && (
          <div className="flex items-center gap-1.5 mb-4 overflow-x-auto py-1 [scrollbar-width:none]">
            <button
              onClick={() => handleFilterChange(null)}
              className={`shrink-0 whitespace-nowrap text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors
                ${platformFilter === null ? 'bg-[#1a1a1a] text-white' : 'bg-[#f3f3f3] text-[#6b6b6b] hover:bg-[#ebebeb]'}`}
            >
              All ({data.games.length})
            </button>
            {availablePlatforms.map(p => (
              <button
                key={p}
                onClick={() => handleFilterChange(platformFilter === p ? null : p)}
                aria-pressed={platformFilter === p}
                title={PLATFORM_LABELS[p]}
                className={`shrink-0 whitespace-nowrap text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full transition-opacity
                  ${BADGE_COLORS[p] ?? 'bg-[#f3f3f3] text-[#6b6b6b]'}
                  ${platformFilter === null || platformFilter === p ? 'opacity-100' : 'opacity-40 hover:opacity-70'}
                  ${platformFilter === p ? 'ring-2 ring-[#1a1a1a]/20' : ''}`}
              >
                {PLATFORM_SHORT_LABELS[p]} ({data.games.filter(g => g.platform === p).length})
              </button>
            ))}
          </div>
        )}

        {/* Wide screens: the games on the left, summary and chart beside them.
            Narrow: summary, then the games, then the chart. */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-5 items-start">
          <div className="lg:col-start-2 lg:row-start-1">
            <PeriodSummary games={filtered} />
          </div>

          <section className="lg:col-start-1 lg:row-start-1 lg:row-span-2 min-w-0">
            <h2 className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#9b9b9b] mb-2">
              Finished games · {filtered.length}
            </h2>
            {visible.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {visible.map(g => {
                  const played = playedByKey.get(playedKey(g))
                  const gameUrl = playedGameUrl(g)
                  return (
                    <FinishedGameCard
                      key={g.id}
                      game={g}
                      details={played && playedNote(played)}
                      action={<>
                        {/* elsewhere the game's page is this table, already linked by View */}
                        {gameUrl !== g.gameUrl && <GameLink url={gameUrl} platform={g.platform} />}
                        {backlog.items && (
                          <AddToBacklogButton
                            inList={backlog.listFor(g.platform, g.gameType || g.gameName)}
                            adding={backlog.isAdding(g.platform, g.gameType || g.gameName)}
                            onAdd={() => backlog.add({ platform: g.platform, gameName: g.gameType || g.gameName, gameUrl: g.gameUrl, list: 'play' })}
                          />
                        )}
                      </>}
                    />
                  )
                })}
              </div>
            ) : !isLoading && (
              <div className="text-center py-12 text-[#9b9b9b]">
                No recently finished games found
                {platformFilter && <span> on {PLATFORM_LABELS[platformFilter]}</span>}
              </div>
            )}
            {hasMore && (
              <div className="mt-4 text-center">
                <button
                  onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
                  className="text-xs bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb] px-4 py-2 rounded-md"
                >
                  Load more ({filtered.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </section>

          <div className="lg:col-start-2 lg:row-start-2">
            <PlayCountChart games={chartGames} compact />
          </div>
        </div>
      </div>
    </div>
  )
}
