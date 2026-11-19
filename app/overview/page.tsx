'use client'
import { useMemo, useState } from 'react'
import { Platform, PLATFORM_LABELS } from '@/lib/types'
import { useFinishedGamesData } from '@/hooks/useFinishedGamesData'
import { usePrefs } from '@/hooks/usePrefs'
import FinishedGameCard from '@/components/FinishedGameCard'
import FetchProgress from '@/components/FetchProgress'
import TopNav from '@/components/TopNav'
import BacklogListChips from '@/components/BacklogListChips'
import PlatformFilterChips from '@/components/PlatformFilterChips'
import { useBacklog } from '@/hooks/useBacklog'
import { useBgaPlayTotals, totalsOf } from '@/hooks/useBgaPlayTotals'
import { aggregatePlayed, playedKey, playedNote } from '@/lib/backlog/played'
import { readCache } from '@/hooks/useGamesData'
import GameLink, { playedGameUrl } from '@/components/GameLink'
import PeriodSummary from '@/components/PeriodSummary'
import { useAchievements } from '@/hooks/useAchievements'
import { useAchievementUnlocks } from '@/hooks/useAchievementUnlocks'
import AchievementUnlockedBanner from '@/components/AchievementUnlockedBanner'

const PAGE_SIZE = 20

export default function OverviewPage() {
  const { data, isLoading, lastError, platformStatuses, refresh } = useFinishedGamesData()
  const { prefs, updatePrefs } = usePrefs()
  const backlog = useBacklog()
  const bgaTotals = useBgaPlayTotals()
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  // Catches a goal crossed between visits here and the Achievements page —
  // whichever one you happen to open first sees it.
  const { achievements, markAchieved } = useAchievements()
  const { celebrating, dismiss } = useAchievementUnlocks(achievements, data?.games, markAchieved)

  // Same fixed order as the Active tab's chips
  const availablePlatforms = data
    ? (Object.keys(PLATFORM_LABELS) as Platform[]).filter(p => data.games.some(g => g.platform === p))
    : []

  // Same "empty = all, null = none" convention prefs.filter.platforms uses on
  // the Active tab, kept in its own field since History filters a different
  // list (finished games, not active ones).
  const platformFilter = prefs.historyPlatformFilter === undefined ? [] : prefs.historyPlatformFilter
  const selectedPlatforms = platformFilter === null ? [] : platformFilter.length === 0 ? availablePlatforms : platformFilter

  const byPlatform = data
    ? (platformFilter === null ? [] : platformFilter.length === 0 ? data.games : data.games.filter(g => platformFilter.includes(g.platform)))
    : []

  // Matches the backlog's own "is this title in my Favorite or GM list"
  // check elsewhere on this page (the BacklogListChips below) — one toggle
  // for both, since what someone wants here is "games I actually care
  // about", not a choice between the two lists.
  const backlogFilter = prefs.historyBacklogFilter ?? false
  const isFavoriteOrGm = (g: { platform: Platform; gameType?: string; gameName: string }) =>
    backlog.listsFor(g.platform, g.gameType || g.gameName).some(l => l === 'favorite' || l === 'gm')
  const filtered = backlogFilter ? byPlatform.filter(isFavoriteOrGm) : byPlatform

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
    const historyPlatformFilter = next.length === 0 ? null : availablePlatforms.every(p => next.includes(p)) ? [] : next
    updatePrefs({ ...prefs, historyPlatformFilter })
    fetch('/api/prefs', { method: 'POST', body: JSON.stringify({ historyPlatformFilter }), headers: { 'Content-Type': 'application/json' } }).catch(() => {})
    setVisibleCount(PAGE_SIZE)
  }

  const toggleBacklogFilter = () => {
    const historyBacklogFilter = !backlogFilter
    updatePrefs({ ...prefs, historyBacklogFilter })
    fetch('/api/prefs', { method: 'POST', body: JSON.stringify({ historyBacklogFilter }), headers: { 'Content-Type': 'application/json' } }).catch(() => {})
    setVisibleCount(PAGE_SIZE)
  }

  // Same header as the Active page: count, Refresh
  const navRight = (
    <>
      {data && <span className="hidden sm:inline">{data.games.length} games · updated {new Date(data.fetchedAt).toLocaleTimeString()}</span>}
      <button
        onClick={refresh}
        disabled={isLoading}
        className="bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-muted-hover)] disabled:opacity-50 disabled:cursor-not-allowed px-2.5 py-1 rounded-md flex items-center gap-1">
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
              <button onClick={refresh} className="text-xs bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-muted-hover)] px-3 py-1.5 rounded-md">
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

        <AchievementUnlockedBanner achievements={celebrating} onDismiss={dismiss} />

        {data.errors.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {data.errors.map(e => (
              <span key={e.platform} className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md">
                ⚠ {PLATFORM_LABELS[e.platform]} unavailable
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <PlatformFilterChips
            platforms={availablePlatforms}
            selected={selectedPlatforms}
            onChange={handlePlatformChange}
            counts={Object.fromEntries(availablePlatforms.map(p => [p, data.games.filter(g => g.platform === p).length]))}
            allCount={data.games.length}
          />
          {backlog.items && (
            <button
              onClick={toggleBacklogFilter}
              aria-pressed={backlogFilter}
              title={backlogFilter ? 'Show every finished game' : 'Show only games that are Favorite or GM in the backlog'}
              className={`shrink-0 whitespace-nowrap text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors
                ${backlogFilter ? 'bg-[var(--text-primary)] text-[var(--bg-surface)]' : 'bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted-hover)]'}`}>
              ★ Favorite/GM{backlogFilter ? ` (${byPlatform.filter(isFavoriteOrGm).length})` : ''}
            </button>
          )}
        </div>

        {/* Side by side once there's room for both; stacked on narrower
            screens so neither gets squeezed. Summary's own table scrolls
            within its card (see PeriodSummary) rather than stretching this
            column to match however many rows a wide period turns up. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <PeriodSummary games={filtered} prefs={prefs} onPrefsChange={updatePrefs} />

          <section className="min-w-0">
            <h2 className="text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--text-tertiary)] mb-2">
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
                          <BacklogListChips
                            lists={backlog.listsFor(g.platform, g.gameType || g.gameName)}
                            disabled={backlog.isAdding(g.platform, g.gameType || g.gameName)}
                            onToggle={list => backlog.toggleOrAdd({ platform: g.platform, gameName: g.gameType || g.gameName, gameUrl: g.gameUrl, list })}
                          />
                        )}
                      </>}
                    />
                  )
                })}
              </div>
            ) : !isLoading && (
              <div className="text-center py-12 text-[var(--text-tertiary)]">
                No recently finished games found
                {platformFilter !== null && platformFilter.length === 1 && <span> on {PLATFORM_LABELS[platformFilter[0]]}</span>}
              </div>
            )}
            {hasMore && (
              <div className="mt-4 text-center">
                <button
                  onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
                  className="text-xs bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-muted-hover)] px-4 py-2 rounded-md"
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
