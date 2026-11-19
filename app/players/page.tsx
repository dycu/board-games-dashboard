'use client'
import { Suspense, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Platform, PLATFORM_LABELS, PLATFORM_SHORT_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import { useFinishedGamesData } from '@/hooks/useFinishedGamesData'
import { useOpponents } from '@/hooks/useOpponents'
import { globalOpponents, gamesWith, playerHref, GlobalOpponent } from '@/lib/opponents/stats'
import { formatDuration } from '@/lib/connectors/utils'
import TopNav from '@/components/TopNav'
import GameLink, { playedGameUrl } from '@/components/GameLink'
import PlatformFilterChips from '@/components/PlatformFilterChips'
import PlayerAvatar from '@/components/PlayerAvatar'

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
// doesn't need its own set of conventions.
function TagEditor({ tags, onSave }: { tags: string[]; onSave: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const addTag = () => {
    const t = draft.trim()
    setDraft('')
    if (t && !tags.includes(t)) onSave([...tags, t])
  }
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
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') addTag() }}
        onBlur={addTag}
        placeholder="+ tag"
        aria-label="Add a tag"
        className="w-16 text-[10px] bg-transparent border-b border-dashed border-[var(--border-dashed)] focus:outline-none focus:border-[var(--accent)] text-[var(--text-secondary)] placeholder:text-[var(--text-tertiary)]"
      />
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

// One specific opponent: their record, response time, tags, and every
// finished game against them. Linked to from the list below, and from
// anywhere else a player's name is shown (GameCard, FinishedGameCard, ...).
function PersonDetail({ platform, name, person, games, onSaveTags, onBack }: {
  platform: Platform
  name: string
  person: GlobalOpponent | undefined
  games: ReturnType<typeof gamesWith>
  onSaveTags: (tags: string[]) => void
  onBack: () => void
}) {
  return (
    <div className="flex-1 overflow-y-auto p-5 max-w-3xl mx-auto w-full">
      <button onClick={onBack} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">← Back</button>
      <div className="flex flex-wrap items-center gap-2 mt-2 mb-1">
        <PlayerAvatar url={person?.avatarUrl} size={36} />
        <Badge platform={platform} />
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">{name}</h1>
      </div>
      <div className="mb-4">
        <TagEditor tags={person?.tags ?? []} onSave={onSaveTags} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <Stat value={person?.games ?? 0} label="games together" />
        <Stat value={person && person.games > 0 ? `${person.iWon}–${person.theyWon}` : '—'} label="you–them" />
        <Stat value={person?.medianResponseSeconds != null ? formatDuration(person.medianResponseSeconds) : '—'} label="typical reply time" />
        <Stat value={person?.lastPlayedAt ? fmtDate(person.lastPlayedAt) : '—'} label="last played" />
      </div>

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
  const opponents = useOpponents()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('games')
  const [platformFilter, setPlatformFilter] = useState<Platform[] | null>(null) // null = every platform present
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [onlyPlayed, setOnlyPlayed] = useState(false)

  const all = useMemo(
    () => finished.data && opponents.byPlatform ? globalOpponents(finished.data.games, opponents.byPlatform) : [],
    [finished.data, opponents.byPlatform],
  )

  const loading = (!finished.data && finished.isLoading) || !opponents.byPlatform

  const showDetail = !!(platform && name)
  const person = showDetail ? all.find(o => o.platform === platform && o.name.toLowerCase() === name!.toLowerCase()) : undefined
  const detailGames = showDetail && finished.data ? gamesWith(finished.data.games, platform!, name!) : []

  const platformsPresent = useMemo(() => [...new Set(all.map(o => o.platform))], [all])
  const allTags = useMemo(() => [...new Set(all.flatMap(o => o.tags))].sort(), [all])
  const selectedPlatforms = platformFilter ?? platformsPresent

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = all.filter(o => selectedPlatforms.includes(o.platform))
    if (tagFilter) rows = rows.filter(o => o.tags.includes(tagFilter))
    if (onlyPlayed) rows = rows.filter(o => o.games > 0)
    if (q) rows = rows.filter(o => o.name.toLowerCase().includes(q) || o.tags.some(t => t.toLowerCase().includes(q)))
    return [...rows].sort(SORTERS[sortKey])
  }, [all, search, sortKey, selectedPlatforms, tagFilter, onlyPlayed])

  if (showDetail) {
    return (
      <div className="flex flex-col h-screen overflow-hidden">
        <TopNav right={loading ? <span className="animate-pulse">Loading…</span> : undefined} />
        <PersonDetail
          platform={platform!}
          name={name!}
          person={person}
          games={detailGames}
          onSaveTags={tags => opponents.saveTags(platform!, name!, tags)}
          onBack={() => router.back()}
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
          <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)] ml-auto">
            <input type="checkbox" checked={onlyPlayed} onChange={e => setOnlyPlayed(e.target.checked)} />
            Only played together
          </label>
        </div>

        {visible.length === 0 && !loading && (
          <p className="text-sm text-[var(--text-tertiary)] py-8 text-center">
            {all.length === 0 ? 'No opponents found yet — play some finished games to see them here.' : 'No opponents match these filters'}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          {visible.map(o => (
            <div key={`${o.platform}:${o.name}`} className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
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
              <div className="ml-auto">
                <TagEditor tags={o.tags} onSave={tags => opponents.saveTags(o.platform, o.name, tags)} />
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
