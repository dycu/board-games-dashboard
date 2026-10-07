'use client'
import { useMemo, useState } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Platform, PLATFORM_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import { BacklogItem } from '@/lib/backlog/list'
import { useBacklog } from '@/hooks/useBacklog'
import { useFinishedGamesData } from '@/hooks/useFinishedGamesData'
import { readCache } from '@/hooks/useGamesData'
import TopNav from '@/components/TopNav'
import AddToBacklogButton from '@/components/AddToBacklogButton'

type Backlog = ReturnType<typeof useBacklog>

const BADGE_FALLBACK = 'bg-[#f3f3f3] text-[#6b6b6b]'
const SMALL_BUTTON = 'text-xs font-medium px-2.5 py-1 rounded-md bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb] whitespace-nowrap'

function Badge({ platform }: { platform: Platform }) {
  return (
    <span className={`shrink-0 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${BADGE_COLORS[platform] ?? BADGE_FALLBACK}`}>
      {PLATFORM_LABELS[platform]}
    </span>
  )
}

function Row({ item, position, onTop, onRemove }: {
  item: BacklogItem
  position: number
  onTop?: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 py-2.5 pl-1.5 pr-3 rounded-lg border bg-white
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
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Badge platform={item.platform} />
        <span className="text-sm font-medium text-[#1a1a1a] truncate">{item.gameName}</span>
      </div>
      <a
        href={item.playUrl}
        target={item.platform === 'bga' ? '_self' : '_blank'}
        rel="noopener noreferrer"
        className="shrink-0 text-xs font-medium px-3 py-1 rounded-md bg-[#5e6ad2] text-white hover:bg-[#4f5ab8] whitespace-nowrap"
      >
        Play ↗
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
      <button onClick={onRemove} title="Remove" aria-label={`Remove ${item.gameName}`} className={SMALL_BUTTON}>
        ✕
      </button>
    </li>
  )
}

function BacklogList({ backlog }: { backlog: Backlog }) {
  const items = backlog.items ?? []
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
      <p className="text-sm text-[#9b9b9b] text-center py-8">
        Nothing planned yet. Add games below, or with “+ Backlog” on the History page.
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

function SearchPanel({ backlog }: { backlog: Backlog }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [errors, setErrors] = useState<{ platform: Platform }[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const runSearch = async () => {
    const q = query.trim()
    if (!q) return
    setIsSearching(true)
    try {
      const res = await fetch(`/api/game-search?q=${encodeURIComponent(q)}`)
      const json = await res.json()
      setResults(json.results ?? [])
      setErrors(json.errors ?? [])
    } finally {
      setIsSearching(false)
    }
  }

  const found = results?.flatMap(r => r.matches.map(m => ({ platform: r.platform, ...m }))) ?? []

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
      <p className="text-xs text-[#9b9b9b] mt-2">Searches BGA, Yucata and Rally the Troops.</p>

      {errors.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {errors.map(e => (
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
              <li key={m.url} className="flex items-center gap-2 py-2">
                <Badge platform={m.platform} />
                <span className="text-sm text-[#1a1a1a] truncate flex-1 min-w-0">{m.name}</span>
                <AddToBacklogButton
                  label="+ Add"
                  inBacklog={backlog.has(m.platform, m.name)}
                  adding={backlog.isAdding(m.platform, m.name)}
                  onAdd={() => backlog.add({ platform: m.platform, gameName: m.name, playUrl: m.url })}
                />
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  )
}

interface PlayedGame {
  platform: Platform
  gameName: string
  gameUrl: string
  note: string
}

// Mounted only when opened: loading finished games asks every platform
function PlayedPanel({ backlog }: { backlog: Backlog }) {
  const finished = useFinishedGamesData()
  const [filter, setFilter] = useState('')

  const played = useMemo(() => {
    const seen = new Map<string, PlayedGame>()
    const put = (g: PlayedGame) => {
      const key = `${g.platform}:${g.gameName.toLowerCase()}`
      if (!seen.has(key)) seen.set(key, g)
    }
    readCache()?.data.games.forEach(g => put({ platform: g.platform, gameName: g.gameName, gameUrl: g.gameUrl, note: 'playing now' }))
    finished.data?.games.forEach(g => put({ platform: g.platform, gameName: g.gameName, gameUrl: g.gameUrl, note: `finished ${g.completedAgo}` }))
    return [...seen.values()].sort((a, b) => a.gameName.localeCompare(b.gameName))
  }, [finished.data])

  const q = filter.trim().toLowerCase()
  const shown = q ? played.filter(g => g.gameName.toLowerCase().includes(q)) : played

  return (
    <div>
      <input
        type="text"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="Filter your games…"
        className="w-full bg-white text-[#1a1a1a] text-sm px-3 py-1.5 rounded-md border border-[#e5e5e5]"
      />
      {finished.isLoading && (
        <p className="text-xs text-[#9b9b9b] mt-2">Loading finished games…</p>
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
          <li key={`${g.platform}:${g.gameName}`} className="flex items-center gap-2 py-2">
            <Badge platform={g.platform} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[#1a1a1a] truncate">{g.gameName}</p>
              <p className="text-xs text-[#9b9b9b]">{g.note}</p>
            </div>
            <AddToBacklogButton
              label="+ Add"
              inBacklog={backlog.has(g.platform, g.gameName)}
              adding={backlog.isAdding(g.platform, g.gameName)}
              onAdd={() => backlog.add({ platform: g.platform, gameName: g.gameName, gameUrl: g.gameUrl })}
            />
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
  const [source, setSource] = useState<'search' | 'played'>('search')
  const [playedOpened, setPlayedOpened] = useState(false)

  const navRight = backlog.items ? <span>{backlog.items.length} planned</span> : undefined

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav right={navRight} />
      <div className="flex-1 overflow-y-auto p-5 max-w-2xl mx-auto w-full">
        <h2 className="text-sm font-semibold text-[#1a1a1a] mb-3">Up next</h2>

        {backlog.error && (
          <p className="mb-3 text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md">⚠ {backlog.error}</p>
        )}

        {backlog.items === null
          ? !backlog.error && <p className="text-sm text-[#9b9b9b] text-center py-8">Loading…</p>
          : <BacklogList backlog={backlog} />}

        <div className="bg-white rounded-xl border border-[#e5e5e5] p-5 mt-6">
          <div className="flex items-center gap-1 mb-4">
            <h2 className="text-sm font-semibold text-[#1a1a1a] mr-3">Add games</h2>
            {([['search', 'Search'], ['played', 'From your games']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => { setSource(key); if (key === 'played') setPlayedOpened(true) }}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-colors
                  ${source === key ? 'bg-[#1a1a1a] text-white' : 'bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb]'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={source === 'search' ? '' : 'hidden'}><SearchPanel backlog={backlog} /></div>
          {playedOpened && <div className={source === 'played' ? '' : 'hidden'}><PlayedPanel backlog={backlog} /></div>}
        </div>
      </div>
    </div>
  )
}
