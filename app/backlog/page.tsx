'use client'
import { useEffect, useMemo, useState } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Platform, PLATFORM_LABELS, PLATFORM_SHORT_LABELS, DEFAULT_BACKLOG_PLATFORMS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import { BacklogItem, BacklogList, BACKLOG_LISTS, LIST_LABELS, SHORT_LIST_LABELS, listsOf } from '@/lib/backlog/list'
import { PlayedSort, aggregatePlayed, sortPlayed, playedNote } from '@/lib/backlog/played'
import { useBgaPlayTotals, totalsOf } from '@/hooks/useBgaPlayTotals'
import { useBacklog } from '@/hooks/useBacklog'
import { useFinishedGamesData } from '@/hooks/useFinishedGamesData'
import { readCache } from '@/hooks/useGamesData'
import TopNav from '@/components/TopNav'
import BacklogListChips from '@/components/BacklogListChips'
import GameLink, { SMALL_BUTTON, playedGameUrl } from '@/components/GameLink'
import HistoryLink from '@/components/HistoryLink'
import PlatformFilterChips from '@/components/PlatformFilterChips'

type Backlog = ReturnType<typeof useBacklog>

const ALL_PLATFORMS = Object.keys(PLATFORM_LABELS) as Platform[]

const BADGE_FALLBACK = 'bg-[#f3f3f3] text-[#6b6b6b]'

// TableTapas is search-only: it has no per-game deep link (every match
// points at its library, not the specific game) and no live tracker, so
// it's not part of lib/types.ts's Platform union and can't be added to the
// backlog the way every other site's results can. It still needs to show
// up here, though — it's a real catalog match, just a dead end past "go
// play it".
type SearchSite = Platform | 'tabletapas'
const TABLETAPAS_LABEL = 'TableTapas'
const TABLETAPAS_SHORT_LABEL = 'TblTapas'
const siteLabel = (p: SearchSite): string => p === 'tabletapas' ? TABLETAPAS_LABEL : PLATFORM_LABELS[p]
const siteShortLabel = (p: SearchSite): string => p === 'tabletapas' ? TABLETAPAS_SHORT_LABEL : PLATFORM_SHORT_LABELS[p]

function Badge({ platform }: { platform: SearchSite }) {
  return (
    <span title={siteLabel(platform)} className={`shrink-0 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${BADGE_COLORS[platform] ?? BADGE_FALLBACK}`}>
      {siteShortLabel(platform)}
    </span>
  )
}

function Row({ item, position, onTop, onToggleList, onRemove }: {
  item: BacklogItem
  position: number
  onTop?: () => void
  onToggleList: (list: BacklogList) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex flex-wrap items-center gap-2 py-2.5 pl-1.5 pr-3 rounded-lg border bg-white
        ${isDragging ? 'border-[#5e6ad2] shadow-lg relative z-10' : 'border-[#e5e5e5]'}`}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag ${item.gameName}`}
        className="shrink-0 touch-none cursor-grab active:cursor-grabbing text-[#b5b5b5] hover:text-[#6b6b6b] px-2 py-1 text-lg leading-none"
      >
        ⠿
      </button>
      <span className="shrink-0 w-6 text-right text-xs tabular-nums text-[#9b9b9b]">{position}</span>
      {/* Wide enough: everything shares one line. Too narrow for both this
          and the action buttons (phone widths): the min-width floor forces
          the actions below onto their own line instead of squeezing the
          game name down to one letter. */}
      <div className="flex items-center gap-2 min-w-[140px] flex-1">
        <Badge platform={item.platform} />
        <span className="text-sm font-medium text-[#1a1a1a] truncate">{item.gameName}</span>
        <HistoryLink game={item} />
      </div>
      <div className="shrink-0 flex items-center gap-2 ml-auto">
        <a
          href={item.playUrl}
          target={item.platform === 'bga' ? '_self' : '_blank'}
          rel="noopener noreferrer"
          aria-label={`Play ${item.gameName}`}
          title="Play"
          className="shrink-0 text-xs font-medium px-2 sm:px-3 py-1 rounded-md bg-[#5e6ad2] text-white hover:bg-[#4f5ab8] whitespace-nowrap"
        >
          <span className="sm:hidden" aria-hidden="true">↗</span>
          <span className="hidden sm:inline" aria-hidden="true">Play ↗</span>
        </a>
        <button
          onClick={onTop}
          disabled={!onTop}
          title="Move to top"
          aria-label={`Move ${item.gameName} to top`}
          className={`${SMALL_BUTTON} disabled:invisible`}
        >
          ⤒
        </button>
        <BacklogListChips lists={listsOf(item)} onToggle={onToggleList} gameName={item.gameName} />
        <button onClick={onRemove} title="Remove" aria-label={`Remove ${item.gameName}`} className={SMALL_BUTTON}>
          ✕
        </button>
      </div>
    </li>
  )
}

function ListSection({ backlog, list }: { backlog: Backlog; list: BacklogList }) {
  const items = (backlog.items ?? []).filter(i => listsOf(i).includes(list))
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = items.findIndex(i => i.id === active.id)
    const to = items.findIndex(i => i.id === over.id)
    backlog.reorder(arrayMove(items, from, to))
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-[#9b9b9b] text-center py-6 rounded-lg border border-dashed border-[#e5e5e5]">
        {list === 'play' && 'Nothing here yet. Add games below, or with the Play/Learn/Solo/Favorite buttons on the History page.'}
        {list === 'learn' && 'No games to learn yet. Choose “Next to learn” in the box below and add some.'}
        {list === 'solo' && 'No solo games queued yet. Choose “Solo” in the box below and add some.'}
        {list === 'favorite' && 'No favorites yet. Choose “Favorite” in the box below and add some — the dashboard will nudge you to start one whenever none of them has a game running.'}
      </p>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      {/* rectSortingStrategy (not verticalListSortingStrategy): this is a
          2-column grid on wider screens, not always a single vertical
          list, and the strategy needs to know that to drag correctly in
          both layouts. */}
      <SortableContext items={items.map(i => i.id)} strategy={rectSortingStrategy}>
        <ol className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {items.map((item, i) => (
            <Row
              key={item.id}
              item={item}
              position={i + 1}
              onTop={i > 0 ? () => backlog.reorder(arrayMove(items, i, 0)) : undefined}
              onToggleList={target => backlog.toggle(item.id, target)}
              onRemove={() => backlog.remove(item.id)}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  )
}

interface SearchResult {
  platform: SearchSite
  matches: { name: string; url: string }[]
}

function SearchPanel({ backlog, sites }: { backlog: Backlog; sites: Set<SearchSite> }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [errors, setErrors] = useState<{ platform: SearchSite }[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searched, setSearched] = useState('') // the query the results belong to

  const runSearch = async () => {
    const q = query.trim()
    if (!q) return
    setIsSearching(true)
    try {
      const res = await fetch(`/api/game-search?q=${encodeURIComponent(q)}`)
      const json = await res.json()
      setResults(json.results ?? [])
      setErrors(json.errors ?? [])
      setSearched(q)
    } finally {
      setIsSearching(false)
    }
  }

  const found = results
    ?.filter(r => sites.has(r.platform))
    .flatMap(r => r.matches.map(m => ({ platform: r.platform, ...m }))) ?? []

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') runSearch() }}
          placeholder="Game name…"
          className="flex-1 min-w-0 bg-white text-[#1a1a1a] text-sm px-3 py-1.5 rounded-md border border-[#e5e5e5]"
        />
        <button
          onClick={runSearch}
          disabled={!query.trim() || isSearching}
          className="text-xs bg-[#5e6ad2] text-white hover:bg-[#4f5ab8] px-3 py-1.5 rounded-md disabled:opacity-50 whitespace-nowrap"
        >
          {isSearching ? 'Searching…' : 'Search'}
        </button>
      </div>
      <p className="text-xs text-[#9b9b9b] mt-2">Searches every site above a filter is checked for, in one go.</p>

      {errors.some(e => sites.has(e.platform)) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {errors.filter(e => sites.has(e.platform)).map(e => (
            <span key={e.platform} className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md">
              ⚠ {siteLabel(e.platform)} unavailable
            </span>
          ))}
        </div>
      )}

      {results && (
        found.length === 0 ? (
          <p className="text-xs text-[#9b9b9b] mt-3">No match found</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-[#f0f0f0]">
            {found.map(m => {
              const prefix = (
                <>
                  <Badge platform={m.platform} />
                  <span className="text-sm text-[#1a1a1a] truncate flex-1 min-w-0">{m.name}</span>
                </>
              )
              // No history, no backlog chips: there's no Platform value for
              // TableTapas to be tracked or added under — see the SearchSite
              // note above. Narrowing m.platform to a plain const (rather than
              // using m.platform directly below) is what lets it carry into
              // the nested onToggle closure as Platform, not SearchSite.
              if (m.platform === 'tabletapas') {
                return (
                  <li key={`${m.platform}:${m.name}`} className="flex items-center gap-2 py-2">
                    {prefix}
                    <a href={m.url} target="_blank" rel="noopener noreferrer" title="Open the game's library page" className={SMALL_BUTTON}>
                      Play ↗
                    </a>
                  </li>
                )
              }
              const platform = m.platform
              return (
                <li key={`${platform}:${m.name}`} className="flex items-center gap-2 py-2">
                  {prefix}
                  <HistoryLink game={{ platform, gameName: m.name }} />
                  <GameLink url={m.url} platform={platform} />
                  <BacklogListChips
                    lists={backlog.listsFor(platform, m.name)}
                    disabled={backlog.isAdding(platform, m.name)}
                    onToggle={list => backlog.toggleOrAdd({ platform, gameName: m.name, playUrl: m.url, list })}
                  />
                </li>
              )
            })}
          </ul>
        )
      )}

      {results && searched && sites.size > 0 && (
        // For games no catalog lists, e.g. BGA alpha games
        <div className="mt-3 pt-3 border-t border-[#f0f0f0] flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[#9b9b9b] mr-1">Not there? Add “{searched}” on</span>
          {ALL_PLATFORMS.filter(p => sites.has(p)).map(p => {
            const inBacklog = backlog.listsFor(p, searched).length > 0
            return (
              <button
                key={p}
                // No per-list chips here (there's no row to put them on) —
                // lands in Play, same as everywhere else's default; its
                // chips in the list below can change that once it's added.
                onClick={() => backlog.add({ platform: p, gameName: searched, list: 'play' })}
                disabled={inBacklog || backlog.isAdding(p, searched)}
                title={PLATFORM_LABELS[p]} className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${BADGE_COLORS[p] ?? BADGE_FALLBACK} disabled:opacity-50`}
              >
                {inBacklog ? '✓ ' : '+ '}{PLATFORM_SHORT_LABELS[p]}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const SORTS: [PlayedSort, string][] = [['recent', 'Recent'], ['most', 'Most played'], ['least', 'Least played'], ['name', 'A–Z']]

// Loading finished games asks every platform (streamed, so the page isn't held up)
function PlayedPanel({ backlog, sites }: { backlog: Backlog; sites: Set<SearchSite> }) {
  const finished = useFinishedGamesData()
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<PlayedSort>('recent')
  const [finishedOnly, setFinishedOnly] = useState(false)
  const bgaTotals = useBgaPlayTotals()

  const played = useMemo(
    () => aggregatePlayed(
      readCache()?.data.games ?? [],
      finished.data?.games ?? [],
      totalsOf(bgaTotals),
    ),
    [finished.data, bgaTotals],
  )

  const q = filter.trim().toLowerCase()
  const shown = sortPlayed(
    played.filter(g =>
      sites.has(g.platform)
      && (!finishedOnly || g.playingNow === 0)
      && (!q || g.gameName.toLowerCase().includes(q))),
    sort,
  )

  return (
    <div>
      <input
        type="text"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="Filter your games…"
        className="w-full bg-white text-[#1a1a1a] text-sm px-3 py-1.5 rounded-md border border-[#e5e5e5]"
      />
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {SORTS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSort(key)}
            className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium transition-colors
              ${sort === key ? 'bg-[#5e6ad2] text-white' : 'bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb]'}`}
          >
            {label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-[#6b6b6b] cursor-pointer">
          <input type="checkbox" checked={finishedOnly} onChange={e => setFinishedOnly(e.target.checked)} />
          Finished only
        </label>
      </div>
      {(finished.isLoading || !bgaTotals) && (
        <p className="text-xs text-[#9b9b9b] mt-2">Loading finished games…</p>
      )}
      {bgaTotals && 'error' in bgaTotals && (
        <p className="mt-2 text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md">
          ⚠ BGA play counts unavailable, so BGA shows only its latest 50 games: {bgaTotals.error}
        </p>
      )}
      {finished.data && finished.data.errors.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {finished.data.errors.map(e => (
            <span key={e.platform} className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md">
              ⚠ {PLATFORM_LABELS[e.platform]} history unavailable
            </span>
          ))}
        </div>
      )}
      <ul className="mt-2 flex flex-col divide-y divide-[#f0f0f0] max-h-96 overflow-y-auto">
        {shown.map(g => (
          <li key={`${g.platform}:${g.gameName}`} className="flex flex-wrap items-center gap-2 py-2">
            <Badge platform={g.platform} />
            <div className="min-w-[140px] flex-1">
              <p className="text-sm text-[#1a1a1a] truncate">{g.gameName}</p>
              <p className="text-xs text-[#9b9b9b]">{playedNote(g)}</p>
            </div>
            <div className="shrink-0 flex items-center gap-2 ml-auto">
              <HistoryLink game={g} />
              <GameLink url={playedGameUrl(g)} platform={g.platform} />
              <BacklogListChips
                lists={backlog.listsFor(g.platform, g.gameName)}
                disabled={backlog.isAdding(g.platform, g.gameName)}
                onToggle={list => backlog.toggleOrAdd({ platform: g.platform, gameName: g.gameName, gameUrl: g.gameUrl, list })}
              />
            </div>
          </li>
        ))}
      </ul>
      {!finished.isLoading && shown.length === 0 && (
        <p className="text-xs text-[#9b9b9b] mt-2">No games found</p>
      )}
    </div>
  )
}

export default function BacklogPage() {
  const backlog = useBacklog()
  const [source, setSource] = useState<'search' | 'played'>('played')
  const [activeList, setActiveList] = useState<BacklogList>('play')
  const [sites, setSites] = useState<Set<SearchSite>>(new Set(DEFAULT_BACKLOG_PLATFORMS))

  useEffect(() => {
    let cancelled = false
    fetch('/api/prefs').then(r => r.json()).then(prefs => {
      if (!cancelled) setSites(new Set(prefs.backlogPlatforms ?? DEFAULT_BACKLOG_PLATFORMS))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const navRight = backlog.items ? <span>{backlog.items.length} planned</span> : undefined
  const pill = (active: boolean) => `text-xs px-3 py-1 rounded-full font-medium transition-colors
    ${active ? 'bg-[#1a1a1a] text-white' : 'bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb]'}`

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav right={navRight} />
      <div className="flex-1 overflow-y-auto p-5 max-w-5xl mx-auto w-full">
        {backlog.error && (
          <p className="mb-3 text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md">⚠ {backlog.error}</p>
        )}

        {backlog.items === null
          ? !backlog.error && <p className="text-sm text-[#9b9b9b] text-center py-8">Loading…</p>
          : (
            <section className="mb-6">
              {/* One list visible at a time instead of all four stacked —
                  keeps this short on a phone and avoids a long scroll to
                  reach "Add games" below, on any screen size. */}
              <div className="flex items-center gap-1 mb-3">
                {BACKLOG_LISTS.map(list => {
                  const count = backlog.items!.filter(i => listsOf(i).includes(list)).length
                  return (
                    <button
                      key={list}
                      onClick={() => setActiveList(list)}
                      title={LIST_LABELS[list]}
                      className={`flex-1 ${pill(activeList === list)}`}
                    >
                      {SHORT_LIST_LABELS[list]} <span className="tabular-nums opacity-70">{count}</span>
                    </button>
                  )
                })}
              </div>
              <ListSection backlog={backlog} list={activeList} />
            </section>
          )}

        <div className="bg-white rounded-xl border border-[#e5e5e5] p-5">
          <div className="flex flex-wrap items-center gap-1 mb-4">
            <h2 className="text-sm font-semibold text-[#1a1a1a] mr-3">Add games</h2>
            {([['played', 'From your games'], ['search', 'Search']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSource(key)}
                className={pill(source === key)}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Each result row below gets its own Play/Learn/Solo/Favorite
              chips, so a game can go straight into any combination of
              lists — no page-wide "add to" choice needed first. */}
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            <span className="text-xs text-[#9b9b9b] mr-1">Sites</span>
            <PlatformFilterChips
              platforms={ALL_PLATFORMS}
              selected={Array.from(sites).filter((s): s is Platform => s !== 'tabletapas')}
              onChange={next => setSites(prev => new Set<SearchSite>([...next, ...(prev.has('tabletapas') ? ['tabletapas' as const] : [])]))}
            />
            {/* Not a PlatformFilterChips entry: that component is Platform-only
                (it also drives the dashboard/history filters, which can't
                include a search-only site) — see the SearchSite note above. */}
            <button
              onClick={() => setSites(prev => {
                const next = new Set(prev)
                if (next.has('tabletapas')) next.delete('tabletapas')
                else next.add('tabletapas')
                return next
              })}
              aria-pressed={sites.has('tabletapas')}
              title={sites.has('tabletapas') ? `Hide ${TABLETAPAS_LABEL}` : `Show ${TABLETAPAS_LABEL}`}
              className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full transition-opacity ${BADGE_COLORS.tabletapas ?? BADGE_FALLBACK} ${sites.has('tabletapas') ? 'opacity-100' : 'opacity-40 hover:opacity-70'}`}
            >
              {TABLETAPAS_SHORT_LABEL}
            </button>
          </div>
          <div className={source === 'search' ? '' : 'hidden'}><SearchPanel backlog={backlog} sites={sites} /></div>
          <div className={source === 'played' ? '' : 'hidden'}><PlayedPanel backlog={backlog} sites={sites} /></div>
        </div>
      </div>
    </div>
  )
}
