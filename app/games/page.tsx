'use client'
import { useMemo, useState } from 'react'
import { Platform, PLATFORM_LABELS, PLATFORM_SHORT_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import { useBacklog } from '@/hooks/useBacklog'
import { useFinishedGamesData } from '@/hooks/useFinishedGamesData'
import { useBgaPlayTotals, totalsOf } from '@/hooks/useBgaPlayTotals'
import { readCache } from '@/hooks/useGamesData'
import { aggregatePlayed, playedKey, playedNote, PlayedGame } from '@/lib/backlog/played'
import { useGameTagsContext } from '@/components/GameTagsProvider'
import { gameTagsOf, allGameTags } from '@/lib/gameTags/match'
import TopNav from '@/components/TopNav'
import PlatformFilterChips from '@/components/PlatformFilterChips'
import TagFilterChips from '@/components/TagFilterChips'
import TagEditor from '@/components/TagEditor'
import HistoryLink from '@/components/HistoryLink'

const BADGE_FALLBACK = 'bg-[var(--bg-muted)] text-[var(--text-secondary)]'

function Badge({ platform }: { platform: Platform }) {
  return (
    <span title={PLATFORM_LABELS[platform]} className={`shrink-0 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${BADGE_COLORS[platform] ?? BADGE_FALLBACK}`}>
      {PLATFORM_SHORT_LABELS[platform]}
    </span>
  )
}

// Every title that's active, finished or in the backlog, merged into one
// list — a backlog-only title (added to Learn/Solo/etc. but never actually
// played yet) has no entry from aggregatePlayed alone, so it's added here
// with zero plays rather than being left off a page whose whole point is
// "every game, so I can tag all of them in one pass".
function useAllGames(): PlayedGame[] {
  const backlog = useBacklog()
  const finished = useFinishedGamesData()
  const bgaTotals = useBgaPlayTotals()

  return useMemo(() => {
    const active = readCache()?.data.games ?? []
    const played = aggregatePlayed(active, finished.data?.games ?? [], totalsOf(bgaTotals))
    const playedKeys = new Set(played.map(playedKey))
    const backlogOnly: PlayedGame[] = (backlog.items ?? [])
      .filter(item => !playedKeys.has(playedKey(item)))
      .map(item => ({ platform: item.platform, gameName: item.gameName, gameUrl: item.playUrl, plays: 0, playingNow: 0, lastPlayedAt: null }))
    return [...played, ...backlogOnly]
  }, [backlog.items, finished.data, bgaTotals])
}

export default function GamesPage() {
  const backlog = useBacklog()
  const finished = useFinishedGamesData()
  const gameTags = useGameTagsContext()
  const games = useAllGames()

  const [search, setSearch] = useState('')
  const [platformFilter, setPlatformFilter] = useState<Platform[] | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [untaggedOnly, setUntaggedOnly] = useState(false)

  const platformsPresent = useMemo(() => [...new Set(games.map(g => g.platform))], [games])
  const selectedPlatforms = platformFilter ?? platformsPresent
  const allTags = useMemo(() => allGameTags(gameTags.byPlatform), [gameTags.byPlatform])

  const q = search.trim().toLowerCase()
  const visible = useMemo(() => games
    .filter(g => selectedPlatforms.includes(g.platform))
    .filter(g => !q || g.gameName.toLowerCase().includes(q))
    .filter(g => {
      const tags = gameTagsOf(gameTags.byPlatform, g.platform, g.gameName)
      if (untaggedOnly) return tags.length === 0
      return !tagFilter || tags.includes(tagFilter)
    })
    .sort((a, b) => a.gameName.localeCompare(b.gameName)),
  [games, selectedPlatforms, q, untaggedOnly, tagFilter, gameTags.byPlatform])

  const loading = backlog.items === null && !finished.data && finished.isLoading

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav right={<span className="hidden sm:inline">{games.length} games</span>} />
      <div className="flex-1 overflow-y-auto p-5 max-w-3xl mx-auto w-full">
        {backlog.error && <p className="mb-3 text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md">⚠ {backlog.error}</p>}
        {finished.lastError && <p className="mb-3 text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md">⚠ Failed to load finished games: {finished.lastError}</p>}
        {gameTags.error && <p className="mb-3 text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md">⚠ Failed to load tags: {gameTags.error}</p>}

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={`Filter ${games.length} games…`}
          className="w-full text-xs bg-[var(--bg-surface)] border border-[var(--border-default)] rounded px-2 py-1.5 mb-2 placeholder:text-[var(--text-tertiary)]"
        />
        <PlatformFilterChips platforms={platformsPresent} selected={selectedPlatforms} onChange={setPlatformFilter} className="mb-2" />
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <TagFilterChips tags={allTags} selected={tagFilter} onChange={t => { setTagFilter(t); if (t) setUntaggedOnly(false) }} />
          <label className="ml-auto flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={untaggedOnly}
              onChange={e => { setUntaggedOnly(e.target.checked); if (e.target.checked) setTagFilter(null) }}
            />
            Untagged only
          </label>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--text-tertiary)] text-center py-8">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)] text-center py-8">No games match</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--border-subtle)]">
            {visible.map(g => (
              <li key={playedKey(g)} className="flex flex-wrap items-center gap-2 py-2.5">
                <Badge platform={g.platform} />
                <div className="min-w-[140px] flex-1">
                  <p className="text-sm text-[var(--text-primary)] truncate">{g.gameName}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">{playedNote(g)}</p>
                </div>
                <HistoryLink game={g} />
                <TagEditor
                  tags={gameTagsOf(gameTags.byPlatform, g.platform, g.gameName)}
                  suggestions={allTags}
                  onSave={tags => gameTags.saveTags(g.platform, g.gameName, tags)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
