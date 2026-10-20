'use client'
import { useMemo, useState } from 'react'
import { Platform, PLATFORM_LABELS } from '@/lib/types'
import { useFinishedGamesData } from '@/hooks/useFinishedGamesData'
import { usePrefs } from '@/hooks/usePrefs'
import FinishedGameCard from '@/components/FinishedGameCard'
import FetchProgress from '@/components/FetchProgress'
import TopNav from '@/components/TopNav'
import AddToBacklogButton from '@/components/AddToBacklogButton'
import PlatformFilterChips from '@/components/PlatformFilterChips'
import { useBacklog } from '@/hooks/useBacklog'
import { useBgaPlayTotals, totalsOf } from '@/hooks/useBgaPlayTotals'
import { aggregatePlayed, playedKey, playedNote } from '@/lib/backlog/played'
import { readCache } from '@/hooks/useGamesData'
import GameLink, { playedGameUrl } from '@/components/GameLink'
import PeriodSummary from '@/components/PeriodSummary'

const PAGE_SIZE = 20

export default function OverviewPage() {
  const { data, isLoading, lastError, platformStatuses, refresh } = useFinishedGamesData()
  const { prefs, updatePrefs } = usePrefs()
  const backlog = useBacklog()
  const bgaTotals = useBgaPlayTotals()
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // Same fixed order as the Active tab's chips
  const availablePlatforms = data
    ? (Object.keys(PLATFORM_LABELS) as Platform[]).filter(p => data.games.some(g => g.platform === p))
    : []

  // Same "empty = all" convention prefs.filter.platforms uses on the Active
  // tab, kept in its own field since History filters a different list
  // (finished games, not active ones).
  const platformFilter = prefs.historyPlatformFilter ?? []
  const selectedPlatforms = platformFilter.length === 0 ? availablePlatforms : platformFilter

  const filtered = data
    ? (platformFilter.length === 0 ? data.games : data.games.filter(g => platformFilter.includes(g.platform)))
    : []

  // The same per-game details as Backlog's "From your games", running games included
  const playedByKey = useMemo(
    () => new Map(data
      ? aggregatePlayed(readCache()?.data.games ?? [], data.games, totalsOf(bgaTotals)).map(p => [playedKey(p), p])
      : []),
    [data, bgaTotals],
  )

  const visible = filtered.slice(0, visibleCount)
  const hasMore = filtered.length > visibleCount

  const handlePlatformChange = (next: Platform[]) => {
    const historyPlatformFilter = availablePlatforms.every(p => next.includes(p)) ? [] : next
    updatePrefs({ ...prefs, historyPlatformFilter })
    fetch('/api/prefs', { method: 'POST', body: JSON.stringify({ historyPlatformFilter }), headers: { 'Content-Type': 'application/json' } }).catch(() => {})
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

        <PlatformFilterChips
          platforms={availablePlatforms}
          selected={selectedPlatforms}
          onChange={handlePlatformChange}
          counts={Object.fromEntries(availablePlatforms.map(p => [p, data.games.filter(g => g.platform === p).length]))}
          allCount={data.games.length}
          className="mb-4"
        />

        {/* Summary first, full width — its per-game table can run to hundreds of
            rows once a wide period is selected, and needs the room. The
            individual finished-game cards below don't benefit from extra
            width the same way, so they stay their own section underneath. */}
        <div className="flex flex-col gap-5">
          <PeriodSummary games={filtered} prefs={prefs} onPrefsChange={updatePrefs} />

          <section className="min-w-0">
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
                            targetList="play"
                            inTarget={backlog.listsFor(g.platform, g.gameType || g.gameName).includes('play')}
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
                {platformFilter.length === 1 && <span> on {PLATFORM_LABELS[platformFilter[0]]}</span>}
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
        </div>
      </div>
    </div>
  )
}
