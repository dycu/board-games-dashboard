'use client'
import { Suspense, useId, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Game, Platform, PLATFORM_LABELS, PLATFORM_SHORT_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import { useFinishedGamesData } from '@/hooks/useFinishedGamesData'
import { readCache } from '@/hooks/useGamesData'
import { useOpponentsContext } from '@/components/OpponentsProvider'
import { globalOpponents, gamesWith, playerHref, GlobalOpponent } from '@/lib/opponents/stats'
import { formatDuration } from '@/lib/connectors/utils'
import { useBacklog } from '@/hooks/useBacklog'
import { backlogId, listsOf, BacklogList } from '@/lib/backlog/list'
import TopNav from '@/components/TopNav'
import GameLink, { playedGameUrl } from '@/components/GameLink'
import PlatformFilterChips from '@/components/PlatformFilterChips'
import PlayerAvatar from '@/components/PlayerAvatar'
import { BacklogBadge } from '@/components/GameCard'

const BADGE_FALLBACK = 'bg-[var(--bg-muted)] text-[var(--text-secondary)]'

function Badge({ platform, small }: { platform: Platform; small?: boolean }) {
  return (
    <span title={PLATFORM_LABELS[platform]} className={`shrink-0 font-bold uppercase tracking-wide rounded-full ${small ? 'text-[10px] px-1.5 py-px' : 'text-[11px] px-2 py-0.5'} ${BADGE_COLORS[platform] ?? BADGE_FALLBACK}`}>
      {PLATFORM_SHORT_LABELS[platform]}
    </span>
  )
}

// Add via Enter or blur, remove with a click on the tag itself — same
// interaction shape as TableLabelEditor/NoteEditor on the cards, so it
// doesn't need its own set of conventions. `suggestions` (every tag
// already used on any player) is offered as a datalist, so a tag like
// "slow" only needs to be typed out once across the whole roster.
function TagEditor({ tags, suggestions, onSave }: { tags: string[]; suggestions: string[]; onSave: (tags: string[]) => void }) {
  const listId = useId()
  const [draft, setDraft] = useState('')
  const addTag = () => {
    const t = draft.trim()
    setDraft('')
    if (t && !tags.includes(t)) onSave([...tags, t])
  }
  const options = suggestions.filter(t => !tags.includes(t))
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map(t => (
        <button
          key={t}
          onClick={() => onSave(tags.filter(x => x !== t))}
          title={`Remove the "${t}" tag`}
          className="text-[10px] font-medium px-1.5 py-px rounded-full bg-[var(--accent-tint)] text-[var(--accent)] hover:bg-red-50 hover:text-red-600"
        >
          {t} ✕
        </button>
      ))}
      <input
        list={listId}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') addTag() }}
        onBlur={addTag}
        placeholder="+ tag"
        aria-label="Add a tag"
        className="w-16 text-[10px] bg-transparent border-b border-dashed border-[var(--border-dashed)] focus:outline-none focus:border-[var(--accent)] text-[var(--text-secondary)] placeholder:text-[var(--text-tertiary)]"
      />
      {options.length > 0 && (
        <datalist id={listId}>
          {options.map(t => <option key={t} value={t} />)}
        </datalist>
      )}
    </div>
  )
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border-default)] px-3 py-2">
      <div className="text-lg font-semibold tabular-nums text-[var(--text-primary)]">{value}</div>
      <div className="text-[11px] text-[var(--text-tertiary)]">{label}</div>
    </div>
  )
}

const fmtDate = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

// One specific opponent: their record, response time, tags, every finished
// game against them, and whatever's currently in progress with them.
// Linked to from the list below, and from anywhere else a player's name is
// shown (GameCard, FinishedGameCard, ...).
export function PersonDetail({ platform, name, person, activeGames, games, allTags, onSaveTags, onSetHidden, onBack }: {
  platform: Platform
  name: string
  person: GlobalOpponent | undefined
  activeGames: Game[]
  games: ReturnType<typeof gamesWith>
  allTags: string[]
  onSaveTags: (tags: string[]) => void
  onSetHidden: (hidden: boolean) => void
  onBack: () => void
}) {
  // The title played most often with this person — one more way to answer
  // "who should I invite for X", alongside the games-together count/record.
  const mostPlayed = useMemo(() => {
    const counts = new Map<string, number>()
    for (const g of games) {
      const title = g.gameType || g.gameName
      counts.set(title, (counts.get(title) ?? 0) + 1)
    }
    let top: { title: string; count: number } | null = null
    for (const [title, count] of counts) {
      if (!top || count > top.count) top = { title, count }
    }
    return top
  }, [games])

  // Titles played with this person that are also tracked in your own
  // backlog (Favorite, GM, next to play, ...) — a good game together is
  // worth knowing you'd keep coming back to anyway.
  const backlog = useBacklog()
  const sharedBacklogTitles = useMemo(() => {
    if (!backlog.items) return []
    const seen = new Map<string, BacklogList[]>()
    for (const g of games) {
      const title = g.gameType || g.gameName
      if (seen.has(title)) continue
      const item = backlog.items.find(i => i.id === backlogId(platform, title))
      if (item) seen.set(title, listsOf(item))
    }
    return [...seen.entries()]
  }, [backlog.items, games, platform])

  return (
    <div className="flex-1 overflow-y-auto p-5 max-w-3xl mx-auto w-full">
      <button onClick={onBack} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">← Back</button>
      <div className="flex flex-wrap items-center gap-2 mt-2 mb-1">
        <PlayerAvatar url={person?.avatarUrl} size={36} />
        <Badge platform={platform} />
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">{name}</h1>
        {person?.profileUrl && (
          <a
            href={person.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open on ${PLATFORM_LABELS[platform]}`}
            className="text-xs font-medium text-[var(--text-tertiary)] hover:text-[var(--accent)]"
          >
            Open on {PLATFORM_LABELS[platform]} ↗
          </a>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <TagEditor tags={person?.tags ?? []} suggestions={allTags} onSave={onSaveTags} />
        <button
          onClick={() => onSetHidden(!person?.hidden)}
          title={person?.hidden ? 'Show in the roster again' : 'Hide from the roster (still shown at the table)'}
          className="shrink-0 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
        >
          {person?.hidden ? '🙈 Unhide' : '🙈 Hide from roster'}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <Stat value={person?.games ?? 0} label="games together" />
        <Stat value={person && person.games > 0 ? `${person.iWon}–${person.theyWon}` : '—'} label="you–them" />
        <Stat value={person?.medianResponseSeconds != null ? formatDuration(person.medianResponseSeconds) : '—'} label="typical reply time" />
        <Stat value={person?.lastPlayedAt ? fmtDate(person.lastPlayedAt) : '—'} label="last played" />
      </div>

      {mostPlayed && mostPlayed.count > 1 && (
        <p className="text-xs text-[var(--text-tertiary)] mb-5 -mt-3">
          Most played together: <span className="font-medium text-[var(--text-primary)]">{mostPlayed.title}</span> ({mostPlayed.count}×)
        </p>
      )}

      {sharedBacklogTitles.length > 0 && (
        <div className="mb-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--text-tertiary)] mb-1.5">Also in your backlog</h2>
          <div className="flex flex-col gap-1.5">
            {sharedBacklogTitles.map(([title, lists]) => (
              <div key={title} className="flex items-center gap-2 px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                <span className="flex-1 min-w-0 text-sm text-[var(--text-primary)] truncate">{title}</span>
                <BacklogBadge lists={lists} />
              </div>
            ))}
          </div>
        </div>
      )}

      {activeGames.length > 0 && (
        <div className="mb-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--text-tertiary)] mb-1.5">Currently playing</h2>
          <div className="flex flex-col gap-1.5">
            {activeGames.map(g => (
              <div key={g.id} className="flex items-center gap-2 px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                <span className="flex-1 min-w-0 text-sm text-[var(--text-primary)] truncate">{g.gameType || g.gameName}</span>
                <span className={`shrink-0 text-xs font-medium ${g.myTurn ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'}`}>
                  {g.myTurn ? 'Your turn' : 'Waiting'}
                </span>
                <GameLink url={playedGameUrl(g)} platform={platform} />
              </div>
            ))}
          </div>
        </div>
      )}

      {games.length > 0 ? (
        <table className="w-full text-sm bg-[var(--bg-surface)] rounded-lg border border-[var(--border-default)] overflow-hidden">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)] text-left">
              <th className="font-medium px-3 py-2">Finished</th>
              <th className="font-medium px-3 py-2">Game</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {games.map(g => (
              <tr key={g.id} className="border-t border-[var(--border-subtle)]">
                <td className="px-3 py-1.5 whitespace-nowrap text-[var(--text-secondary)]">{g.completedAt.getTime() > 0 ? fmtDate(g.completedAt) : '—'}</td>
                <td className="px-3 py-1.5 text-[var(--text-primary)]">{g.gameType || g.gameName}</td>
                <td className="px-3 py-1.5 text-right"><GameLink url={playedGameUrl(g)} platform={platform} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-[var(--text-tertiary)] py-8">No finished games against {name} found.</p>
      )}
    </div>
  )
}

type SortKey = 'games' | 'fastest' | 'name'
const SORTS: [SortKey, string][] = [['games', 'Most played'], ['fastest', 'Fastest to reply'], ['name', 'Name']]
const SORTERS: Record<SortKey, (a: GlobalOpponent, b: GlobalOpponent) => number> = {
  games: (a, b) => b.games - a.games || a.name.localeCompare(b.name),
  fastest: (a, b) => (a.medianResponseSeconds ?? Infinity) - (b.medianResponseSeconds ?? Infinity) || b.games - a.games,
  name: (a, b) => a.name.localeCompare(b.name),
}

function PlayersPageInner() {
  const router = useRouter()
  const params = useSearchParams()
  const platform = params.get('platform') as Platform | null
  const name = params.get('name')

  const finished = useFinishedGamesData()
  const opponents = useOpponentsContext()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('games')
  const [platformFilter, setPlatformFilter] = useState<Platform[] | null>(null) // null = every platform present
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [onlyPlayed, setOnlyPlayed] = useState(false)
  const [showHidden, setShowHidden] = useState(false)

  const all = useMemo(
    () => finished.data && opponents.byPlatform ? globalOpponents(finished.data.games, opponents.byPlatform) : [],
    [finished.data, opponents.byPlatform],
  )

  const loading = (!finished.data && finished.isLoading) || !opponents.byPlatform

  const showDetail = !!(platform && name)
  const person = showDetail ? all.find(o => o.platform === platform && o.name.toLowerCase() === name!.toLowerCase()) : undefined
  const detailGames = showDetail && finished.data ? gamesWith(finished.data.games, platform!, name!) : []
  // Whatever the Active page's own cache already has, not a fresh fetch —
  // this detail view is reached dozens of ways (every GameCard/FinishedGameCard
  // name links here), so it stays on the cheap-data-only side of the line
  // medianResponseSeconds/the hover card's games-together count already draw.
  const activeGames = useMemo(
    () => showDetail
      ? (readCache()?.data.games ?? []).filter(g => g.platform === platform && g.players.some(p => p.toLowerCase() === name!.toLowerCase()))
      : [],
    [showDetail, platform, name],
  )

  const platformsPresent = useMemo(() => [...new Set(all.map(o => o.platform))], [all])
  const allTags = useMemo(() => [...new Set(all.flatMap(o => o.tags))].sort(), [all])
  const selectedPlatforms = platformFilter ?? platformsPresent

  const hiddenCount = useMemo(() => all.filter(o => o.hidden).length, [all])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = all.filter(o => selectedPlatforms.includes(o.platform))
    if (!showHidden) rows = rows.filter(o => !o.hidden)
    if (tagFilter) rows = rows.filter(o => o.tags.includes(tagFilter))
    if (onlyPlayed) rows = rows.filter(o => o.games > 0)
    if (q) rows = rows.filter(o => o.name.toLowerCase().includes(q) || o.tags.some(t => t.toLowerCase().includes(q)))
    return [...rows].sort(SORTERS[sortKey])
  }, [all, search, sortKey, selectedPlatforms, tagFilter, onlyPlayed, showHidden])

  if (showDetail) {
    return (
      <div className="flex flex-col h-screen overflow-hidden">
        <TopNav right={loading ? <span className="animate-pulse">Loading…</span> : undefined} />
        <PersonDetail
          platform={platform!}
          name={name!}
          person={person}
          activeGames={activeGames}
          games={detailGames}
          allTags={allTags}
          onSaveTags={tags => opponents.saveTags(platform!, name!, tags)}
          onSetHidden={hidden => opponents.setHidden(platform!, name!, hidden)}
          onBack={() => {
            // router.back() is a silent no-op with nothing in this tab's own
            // history to go back to — opened in a new tab/window (a
            // middle-click, "open in new tab", ...), there's no dashboard
            // page underneath it here, so fall back to the roster instead.
            if (window.history.length <= 1) router.push('/players')
            else router.back()
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav right={loading ? <span className="animate-pulse">Loading…</span> : <span className="hidden sm:inline">{all.length} opponents</span>} />
      <div className="flex-1 overflow-y-auto p-5 max-w-3xl mx-auto w-full">
        {finished.lastError && (
          <p className="text-sm text-red-500 mb-3">Failed to load finished games: {finished.lastError}</p>
        )}
        {opponents.error && (
          <p className="text-sm text-red-500 mb-3">Failed to load tags: {opponents.error}</p>
        )}

        <div className="flex items-center gap-2 mb-4">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Filter ${all.length} opponents…`}
            className="flex-1 min-w-0 text-xs bg-[var(--bg-surface)] border border-[var(--border-default)] rounded px-2 py-1.5 placeholder:text-[var(--text-tertiary)]"
          />
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            aria-label="Sort by"
            className="text-xs bg-[var(--bg-surface)] border border-[var(--border-default)] rounded px-1.5 py-1.5 text-[var(--text-secondary)]"
          >
            {SORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>

        <PlatformFilterChips
          platforms={platformsPresent}
          selected={selectedPlatforms}
          onChange={next => setPlatformFilter(next)}
          className="mb-2"
        />

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {allTags.map(t => (
                <button
                  key={t}
                  onClick={() => setTagFilter(tagFilter === t ? null : t)}
                  aria-pressed={tagFilter === t}
                  className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full transition-colors
                    ${tagFilter === t ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted-hover)]'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          <label
            title="Hide opponents only seen in a currently active game, with no finished game together yet"
            className="flex items-center gap-1 text-xs text-[var(--text-secondary)] ml-auto"
          >
            <input type="checkbox" checked={onlyPlayed} onChange={e => setOnlyPlayed(e.target.checked)} />
            Finished a game together
          </label>
          {hiddenCount > 0 && (
            <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
              <input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} />
              Show hidden ({hiddenCount})
            </label>
          )}
        </div>

        {visible.length === 0 && !loading && (
          <p className="text-sm text-[var(--text-tertiary)] py-8 text-center">
            {all.length === 0 ? 'No opponents found yet — play some finished games to see them here.' : 'No opponents match these filters'}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          {visible.map(o => (
            <div key={`${o.platform}:${o.name}`} className={`flex flex-wrap items-center gap-2 px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] ${o.hidden ? 'opacity-50' : ''}`}>
              <PlayerAvatar url={o.avatarUrl} />
              <Badge platform={o.platform} small />
              <button
                onClick={() => router.push(playerHref(o.platform, o.name))}
                className="text-sm font-medium text-[var(--text-primary)] hover:text-[var(--accent)] hover:underline truncate"
              >
                {o.name}
              </button>
              <span className="text-xs text-[var(--text-tertiary)] shrink-0">
                {o.games > 0 ? `${o.games}× · ${o.iWon}–${o.theyWon}` : 'not played yet'}
              </span>
              {o.medianResponseSeconds != null && (
                <span className="text-xs text-[var(--text-tertiary)] shrink-0" title="Typical time to reply">
                  ~{formatDuration(o.medianResponseSeconds)}
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <TagEditor tags={o.tags} suggestions={allTags} onSave={tags => opponents.saveTags(o.platform, o.name, tags)} />
                <button
                  onClick={() => opponents.setHidden(o.platform, o.name, !o.hidden)}
                  title={o.hidden ? 'Show in the roster again' : 'Hide from the roster (still shown at the table)'}
                  className="shrink-0 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                >
                  {o.hidden ? '🙈 Unhide' : '🙈 Hide'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// useSearchParams needs a Suspense boundary for the static build
export default function PlayersPage() {
  return (
    <Suspense>
      <PlayersPageInner />
    </Suspense>
  )
}
