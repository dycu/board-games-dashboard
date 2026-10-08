'use client'
import { useEffect, useMemo, useState } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Platform, PLATFORM_LABELS, DEFAULT_BACKLOG_PLATFORMS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import { BacklogItem, BacklogList, BACKLOG_LISTS, listOf } from '@/lib/backlog/list'
import { PlayedSort, aggregatePlayed, sortPlayed, playedNote } from '@/lib/backlog/played'
import { useBgaPlayTotals, totalsOf } from '@/hooks/useBgaPlayTotals'
import { useBacklog } from '@/hooks/useBacklog'
import { useFinishedGamesData } from '@/hooks/useFinishedGamesData'
import { readCache } from '@/hooks/useGamesData'
import TopNav from '@/components/TopNav'
import AddToBacklogButton, { LIST_LABELS } from '@/components/AddToBacklogButton'
import GameLink, { SMALL_BUTTON, playedGameUrl } from '@/components/GameLink'
import HistoryLink from '@/components/HistoryLink'

type Backlog = ReturnType<typeof useBacklog>

const ALL_PLATFORMS = Object.keys(PLATFORM_LABELS) as Platform[]

const BADGE_FALLBACK = 'bg-[#f3f3f3] text-[#6b6b6b]'

function Badge({ platform }: { platform: Platform }) {
  return (
    <span className={`shrink-0 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${BADGE_COLORS[platform] ?? BADGE_FALLBACK}`}>
      {PLATFORM_LABELS[platform]}
    </span>
  )
}

function Row({ item, position, onTop, onMove, onRemove }: {
  item: BacklogItem
  position: number
  onTop?: () => void
  onMove: () => void
  onRemove: () => void
}) {
  const other = listOf(item) === 'play' ? 'Learn' : 'Play'
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
        <button
          onClick={onMove}
          aria-label={`Move ${item.gameName} to ${other === 'Learn' ? 'Next to learn' : 'Next to play'}`}
          title={`Move to ${other === 'Learn' ? 'Next to learn' : 'Next to play'}`}
          className={SMALL_BUTTON}
        >
          <span className="sm:hidden" aria-hidden="true">→</span>
          <span className="hidden sm:inline" aria-hidden="true">→ {other}</span>
        </button>
        <button onClick={onRemove} title="Remove" aria-label={`Remove ${item.gameName}`} className={SMALL_BUTTON}>
          ✕
        </button>
      </div>
    </li>
  )
}

function ListSection({ backlog, list }: { backlog: Backlog; list: BacklogList }) {
  const items = (backlog.items ?? []).filter(i => listOf(i) === list)
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
        {list === 'play'
          ? 'Nothing here yet. Add games below, or with “+ Backlog” on the History page.'
          : 'No games to learn yet. Choose “Next to learn” in the box below and add some.'}
      </p>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col gap-2">
          {items.map((item, i) => (
            <Row
              key={item.id}
              item={item}
              position={i + 1}
              onTop={i > 0 ? () => backlog.reorder(arrayMove(items, i, 0)) : undefined}
              onMove={() => backlog.move(item.id, list === 'play' ? 'learn' : 'play')}
              onRemove={() => backlog.remove(item.id)}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  )
}

interface SearchResult {
  platform: Platform
  matches: { name: string; url: string }[]
}

function SearchPanel({ backlog, target, sites }: { backlog: Backlog; target: BacklogList; sites: Set<Platform> }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [errors, setErrors] = useState<{ platform: Platform }[]>([])
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
      <p className="text-xs text-[#9b9b9b] mt-2">Searches BGA, Yucata, Rally the Troops, 18xx.games and choochoo.games.</p>

      {errors.some(e => sites.has(e.platform)) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {errors.filter(e => sites.has(e.platform)).map(e => (
            <span key={e.platform} className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md">
              ⚠ {PLATFORM_LABELS[e.platform]} unavailable
            </span>
          ))}
        </div>
      )}

      {results && (
        found.length === 0 ? (
          <p className="text-xs text-[#9b9b9b] mt-3">No match found</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-[#f0f0f0]">
            {found.map(m => (
              <li key={`${m.platform}:${m.name}`} className="flex items-center gap-2 py-2">
                <Badge platform={m.platform} />
                <span className="text-sm text-[#1a1a1a] truncate flex-1 min-w-0">{m.name}</span>
                <HistoryLink game={{ platform: m.platform, gameName: m.name }} />
                <GameLink url={m.url} platform={m.platform} />
                <AddToBacklogButton
                  label="+ Add"
                  inList={backlog.listFor(m.platform, m.name)}
                  adding={backlog.isAdding(m.platform, m.name)}
                  onAdd={() => backlog.add({ platform: m.platform, gameName: m.name, playUrl: m.url, list: target })}
                />
              </li>
            ))}
          </ul>
        )
      )}

      {results && searched && sites.size > 0 && (
        // For games no catalog lists, e.g. BGA alpha games
        <div className="mt-3 pt-3 border-t border-[#f0f0f0] flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[#9b9b9b] mr-1">Not there? Add “{searched}” on</span>
          {ALL_PLATFORMS.filter(p => sites.has(p)).map(p => {
            const inList = backlog.listFor(p, searched)
            return (
              <button
                key={p}
                onClick={() => backlog.add({ platform: p, gameName: searched, list: target })}
                disabled={!!inList || backlog.isAdding(p, searched)}
                className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${BADGE_COLORS[p] ?? BADGE_FALLBACK} disabled:opacity-50`}
              >
                {inList ? '✓ ' : '+ '}{PLATFORM_LABELS[p]}
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
function PlayedPanel({ backlog, target, sites }: { backlog: Backlog; target: BacklogList; sites: Set<Platform> }) {
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
              <AddToBacklogButton
                label="+ Add"
                inList={backlog.listFor(g.platform, g.gameName)}
                adding={backlog.isAdding(g.platform, g.gameName)}
                onAdd={() => backlog.add({ platform: g.platform, gameName: g.gameName, gameUrl: g.gameUrl, list: target })}
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
  const [target, setTarget] = useState<BacklogList>('play')
  const [sites, setSites] = useState<Set<Platform>>(new Set(DEFAULT_BACKLOG_PLATFORMS))

  useEffect(() => {
    let cancelled = false
    fetch('/api/prefs').then(r => r.json()).then(prefs => {
      if (!cancelled) setSites(new Set(prefs.backlogPlatforms ?? DEFAULT_BACKLOG_PLATFORMS))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const toggleSite = (p: Platform) => setSites(prev => {
    const next = new Set(prev)
    if (next.has(p)) next.delete(p)
    else next.add(p)
    return next
  })

  const navRight = backlog.items ? <span>{backlog.items.length} planned</span> : undefined
  const pill = (active: boolean) => `text-xs px-3 py-1 rounded-full font-medium transition-colors
    ${active ? 'bg-[#1a1a1a] text-white' : 'bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb]'}`

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav right={navRight} />
      <div className="flex-1 overflow-y-auto p-5 max-w-2xl mx-auto w-full">
        {backlog.error && (
          <p className="mb-3 text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md">⚠ {backlog.error}</p>
        )}

        {backlog.items === null
          ? !backlog.error && <p className="text-sm text-[#9b9b9b] text-center py-8">Loading…</p>
          : BACKLOG_LISTS.map(list => (
            <section key={list} className="mb-6">
              <h2 className="text-sm font-semibold text-[#1a1a1a] mb-3">{LIST_LABELS[list]}</h2>
              <ListSection backlog={backlog} list={list} />
            </section>
          ))}

        <div className="bg-white rounded-xl border border-[#e5e5e5] p-5">
          <div className="flex flex-wrap items-center gap-1 mb-3">
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
          <div className="flex flex-wrap items-center gap-1 mb-4">
            <span className="text-xs text-[#9b9b9b] mr-2">Add to</span>
            {BACKLOG_LISTS.map(list => (
              <button key={list} onClick={() => setTarget(list)} className={pill(target === list)}>
                {LIST_LABELS[list]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            <span className="text-xs text-[#9b9b9b] mr-1">Sites</span>
            {ALL_PLATFORMS.map(p => (
              <button
                key={p}
                onClick={() => toggleSite(p)}
                aria-pressed={sites.has(p)}
                className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full transition-opacity
                  ${BADGE_COLORS[p] ?? BADGE_FALLBACK}
                  ${sites.has(p) ? 'opacity-100 ring-2 ring-[#1a1a1a]/20' : 'opacity-40 hover:opacity-70'}`}
              >
                {PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>
          <div className={source === 'search' ? '' : 'hidden'}><SearchPanel backlog={backlog} target={target} sites={sites} /></div>
          <div className={source === 'played' ? '' : 'hidden'}><PlayedPanel backlog={backlog} target={target} sites={sites} /></div>
        </div>
      </div>
    </div>
  )
}
