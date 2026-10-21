'use client'
import { useEffect, useMemo, useState } from 'react'
import { Game, Platform, UserPrefs, GamesApiResponse, PLATFORM_LABELS, PLATFORM_SHORT_LABELS } from '@/lib/types'
import { DepartedGame } from '@/hooks/useGamesData'
import { sortAndFilter } from '@/lib/sort-filter'
import { BADGE_COLORS } from '@/lib/platform-colors'
import GameCard, { GameRow, GameItemProps, isOpponentSlow, openTarget } from './GameCard'
import { useBacklog } from '@/hooks/useBacklog'
import { useNotes } from '@/hooks/useNotes'
import { BacklogItem, backlogId, listsOf } from '@/lib/backlog/list'
import FilterToolbar from './FilterToolbar'
import PlatformFilterChips from './PlatformFilterChips'
import TopNav from './TopNav'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { storeOpenedNow } from '@/lib/dismissal'

interface Props {
  data: GamesApiResponse
  prefs: UserPrefs
  onPrefsChange: (p: UserPrefs) => void
  dismissed: Set<string>
  onRefresh: () => void
  isRefreshing: boolean
  lastError: string | null
  cachedAt: string | null
  onOpen: (id: string) => void
  departedGames: DepartedGame[]
}

const WAITING_EXPANDED_KEY = 'waiting-expanded'
// Games opened this long ago or less stay in the collapsed Waiting list, so
// one just played can still get a note after the move
const RECENTLY_OPENED_KEY = 'recently-opened'
const RECENTLY_OPENED_MS = 12 * 3600 * 1000

function storeRecentlyOpened(id: string, prev?: Record<string, number>): Record<string, number> {
  let next: Record<string, number> = { [id]: Date.now() }
  try {
    next = { ...(prev ?? JSON.parse(localStorage.getItem(RECENTLY_OPENED_KEY) ?? '{}')), [id]: Date.now() }
    localStorage.setItem(RECENTLY_OPENED_KEY, JSON.stringify(next))
  } catch { /* storage unavailable */ }
  return next
}

// Both "opened" records, written synchronously (see the Next link)
function markOpenedInStorage(id: string) {
  storeOpenedNow(id)
  storeRecentlyOpened(id)
}
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function GameGrid({ data, prefs, onPrefsChange, dismissed, onRefresh, isRefreshing, lastError, cachedAt, onOpen, departedGames }: Props) {
  const { games, errors, fetchedAt } = data
  const configuredPlatforms = data.platforms ?? Array.from(
    new Set([...games.map(g => g.platform), ...errors.map(e => e.platform)])
  )
  // Opened games stay on the page, dimmed, so a note can still be added
  // after the move; they no longer count as waiting for me
  const visible = games
  const isOpened = (g: Game) => dismissed.has(g.id)
  const countByPlatform = Object.fromEntries(
    configuredPlatforms.map(p => [p, visible.filter(g => g.platform === p).length])
  )
  const myTurnCount = visible.filter(g => g.myTurn && !isOpened(g)).length
  // eslint-disable-next-line react-hooks/purity -- ages and deadlines are as of this data; recomputed on every refresh
  const now = useMemo(() => Date.now(), [data])
  const myTurnGames = sortAndFilter(visible.filter(g => g.myTurn && !isOpened(g)), prefs, now)
  // An opened game stays with my games even once it's the opponent's turn, until
  // the dashboard stops treating it as opened (a few minutes after I'm back)
  const openedMyTurnGames = sortAndFilter(visible.filter(isOpened), prefs, now)
  const waitingGames = sortAndFilter(visible.filter(g => !g.myTurn && !isOpened(g)), prefs, now)
  const showMine = prefs.filter.turnStatus !== 'waiting'
  const showWaiting = prefs.filter.turnStatus !== 'my-turn'
  const platformFilter = prefs.filter.platforms

  // Saved to the server too (not just local state), the same way pins/sunk/
  // watchedGames below are — otherwise it only ever lives in localStorage,
  // and the plain fetch('/api/prefs') on mount (app/page.tsx) overwrites it
  // back to the stale server copy on the very next load.
  //
  // prefs.filter.platforms itself stores "empty = all" (lib/sort-filter.ts
  // reads it that way too); PlatformFilterChips wants the already-resolved
  // list instead, so this is where the two meet.
  const selectedPlatforms = platformFilter.length === 0 ? configuredPlatforms : platformFilter
  const setSelectedPlatforms = (next: Platform[]) => {
    const platforms = configuredPlatforms.every(p => next.includes(p)) ? [] : next
    const filter = { ...prefs.filter, platforms }
    onPrefsChange({ ...prefs, filter })
    fetch('/api/prefs', { method: 'POST', body: JSON.stringify({ filter }), headers: { 'Content-Type': 'application/json' } }).catch(() => {})
  }

  // Waiting games are rarely actionable: only pinned ones and ones whose
  // opponent is slow show until the list is expanded
  const [waitingExpanded, setWaitingExpanded] = useState(false)
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after hydration
      setWaitingExpanded(localStorage.getItem(WAITING_EXPANDED_KEY) === '1')
    } catch { /* storage unavailable */ }
  }, [])
  const toggleWaiting = () => setWaitingExpanded(prev => {
    try { localStorage.setItem(WAITING_EXPANDED_KEY, prev ? '0' : '1') } catch { /* storage unavailable */ }
    return !prev
  })
  const opponentSlowDays = prefs.opponentSlowDays ?? 5
  const deadlineSoonHours = prefs.deadlineSoonHours ?? 24
  const [recentlyOpened, setRecentlyOpened] = useState<Record<string, number>>({})
  useEffect(() => {
    try {
      const stored: Record<string, number> = JSON.parse(localStorage.getItem(RECENTLY_OPENED_KEY) ?? '{}')
      const cutoff = Date.now() - RECENTLY_OPENED_MS
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after hydration
      setRecentlyOpened(Object.fromEntries(Object.entries(stored).filter(([, t]) => t > cutoff)))
    } catch { /* storage unavailable */ }
  }, [])
  const openGame = (id: string) => {
    setRecentlyOpened(prev => storeRecentlyOpened(id, prev))
    onOpen(id)
  }
  const openedRecently = (g: Game) => (recentlyOpened[g.id] ?? 0) > now - RECENTLY_OPENED_MS
  const alwaysShownWaiting = waitingGames.filter(g =>
    prefs.pins.includes(g.id) || isOpponentSlow(g, opponentSlowDays, now) || openedRecently(g))
  const shownWaiting = waitingExpanded ? waitingGames : alwaysShownWaiting
  const hiddenWhenCollapsed = waitingGames.length - alwaysShownWaiting.length

  const { notes, saveNote } = useNotes()

  // "Next" opens the first game of "Your turn" (most urgent, then the chosen sort)
  const next = myTurnGames[0]

  // With few games going, suggest the top of "Next to play" that isn't already running
  const backlog = useBacklog()
  // Shown right under my games: the top "Next to play" game that isn't already running
  const suggestion = (backlog.items ?? []).find(item => listsOf(item).includes('play')
    && !games.some(g => backlogId(g.platform, g.gameType || g.gameName) === item.id))

  const togglePin = async (id: string) => {
    const pins = prefs.pins.includes(id)
      ? prefs.pins.filter(p => p !== id)
      : [...prefs.pins, id]
    const updated = { ...prefs, pins }
    onPrefsChange(updated)
    await fetch('/api/prefs', { method: 'POST', body: JSON.stringify({ pins }), headers: { 'Content-Type': 'application/json' } })
  }

  const toggleSink = async (id: string) => {
    const prevSunk = prefs.sunk ?? []
    const sunk = prevSunk.includes(id) ? prevSunk.filter(p => p !== id) : [...prevSunk, id]
    const updated = { ...prefs, sunk }
    onPrefsChange(updated)
    await fetch('/api/prefs', { method: 'POST', body: JSON.stringify({ sunk }), headers: { 'Content-Type': 'application/json' } })
  }

  const toggleWatch = async (id: string) => {
    const prevWatched = prefs.watchedGames ?? []
    const watchedGames = prevWatched.includes(id) ? prevWatched.filter(p => p !== id) : [...prevWatched, id]
    const updated = { ...prefs, watchedGames }
    onPrefsChange(updated)
    await fetch('/api/prefs', { method: 'POST', body: JSON.stringify({ watchedGames }), headers: { 'Content-Type': 'application/json' } })
  }

  const toggleAutoNote = async (id: string) => {
    const prevAutoNote = prefs.autoNoteGames ?? []
    const autoNoteGames = prevAutoNote.includes(id) ? prevAutoNote.filter(p => p !== id) : [...prevAutoNote, id]
    const updated = { ...prefs, autoNoteGames }
    onPrefsChange(updated)
    await fetch('/api/prefs', { method: 'POST', body: JSON.stringify({ autoNoteGames }), headers: { 'Content-Type': 'application/json' } })
  }

  const { intervalSeconds, setIntervalSeconds, countdown } = useAutoRefresh(onRefresh, isRefreshing, prefs.refreshIntervalSeconds)

  // Saved to the server too, the same way the filter/pins/sunk/watchedGames
  // are above — otherwise it only ever lives in the hook's local state and
  // resets to Off on the next load.
  const setRefreshInterval = (refreshIntervalSeconds: number) => {
    setIntervalSeconds(refreshIntervalSeconds)
    onPrefsChange({ ...prefs, refreshIntervalSeconds })
    fetch('/api/prefs', { method: 'POST', body: JSON.stringify({ refreshIntervalSeconds }), headers: { 'Content-Type': 'application/json' } }).catch(() => {})
  }

  const itemProps = (g: Game): GameItemProps => ({
    game: g,
    pinned: prefs.pins.includes(g.id),
    onTogglePin: togglePin,
    sunk: (prefs.sunk ?? []).includes(g.id),
    onToggleSink: toggleSink,
    watched: (prefs.watchedGames ?? []).includes(g.id),
    onToggleWatch: toggleWatch,
    autoNote: (prefs.autoNoteGames ?? []).includes(g.id),
    onToggleAutoNote: toggleAutoNote,
    onOpen: () => openGame(g.id),
    opponentSlowDays,
    deadlineSoonHours,
    note: notes[g.id],
    onSaveNote: saveNote,
    now,
    opened: isOpened(g),
    showProgress: prefs.showProgress ?? true,
  })

  // Your-turn count in the browser tab, readable without switching to it
  useEffect(() => {
    document.title = myTurnCount > 0 ? `(${myTurnCount}) Board Games Dashboard` : 'Board Games Dashboard'
    return () => { document.title = 'Board Games Dashboard' }
  }, [myTurnCount])

  const [departedDismissed, setDepartedDismissed] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-show the notice when new departures arrive
    if (departedGames.length > 0) setDepartedDismissed(false)
  }, [departedGames])

  const navRight = (
    <>
      <span className="hidden sm:inline">
        {games.length}{' '}active &nbsp;·&nbsp;
        <span className="text-[#5e6ad2] font-medium">{myTurnCount}{' '}your turn</span>
      </span>
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        className="bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb] disabled:opacity-50 disabled:cursor-not-allowed px-2.5 py-1 rounded-md flex items-center gap-1">
        <span className={isRefreshing ? 'animate-spin inline-block' : ''}>↻</span>
        <span className="hidden sm:inline">Refresh</span>
      </button>
      {intervalSeconds > 0 && (
        <span className="hidden sm:inline">{countdown}s</span>
      )}
      <select
        value={intervalSeconds}
        onChange={e => setRefreshInterval(Number(e.target.value))}
        aria-label="Auto-refresh interval"
        className="bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb] text-xs px-2 py-1 rounded-md cursor-pointer"
      >
        <option value={0}>Off</option>
        <option value={30}>30s</option>
        <option value={60}>1m</option>
        <option value={300}>5m</option>
      </select>
    </>
  )

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopNav right={navRight} />
      {/* No top padding here — a `sticky top-0` child still sticks at the
          *padding* edge of its scrolling ancestor, not the true top of the
          scrollport, so any top padding here would leave a gap above the
          stuck bar for whatever's mid-scroll to peek through. The lost top
          padding moves onto the sticky bar below instead, which has nothing
          above it to leave a gap against. */}
      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {/* Sticky, and always the first child of the scrolling div above, for
            the reason in its comment. The platform filter and sort apply to
            every section below (Your turn, Waiting), so keeping this
            reachable without scrolling back up is the point of making it
            sticky at all. */}
        <div className="sticky top-0 z-10 bg-[#f7f7f7] -mx-5 px-5 pt-5 pb-2 mb-1 flex flex-wrap items-center gap-3 border-b border-[#e5e5e5]">
          {/* Wide enough: the chips scroll sideways rather than push the sort
              controls down. Too narrow for both (phone widths): the min-width
              floor forces the sort controls to wrap to their own line below
              instead of squeezing the chips down to an unreadable sliver. */}
          <div className="flex-1 min-w-[140px]">
            <PlatformFilterChips
              platforms={configuredPlatforms}
              selected={selectedPlatforms}
              onChange={setSelectedPlatforms}
              counts={countByPlatform}
              allCount={visible.length}
              openLinks
            />
          </div>
          <div className="shrink-0"><FilterToolbar prefs={prefs} onChange={onPrefsChange} /></div>
        </div>

        {lastError && cachedAt && (
          <div className="mb-3 text-xs text-amber-600">
            Last refresh failed — showing cache from {timeAgo(cachedAt)}
          </div>
        )}

        {departedGames.length > 0 && !departedDismissed && (
          <div className="mb-3 flex items-center gap-1.5 text-xs text-[#6b6b6b]">
            <span>↩</span>
            <span>
              {departedGames.length === 1 ? '1 game' : `${departedGames.length} games`} ended since last refresh:{' '}
              {departedGames.map((g, i) => (
                <span key={g.id}>
                  {i > 0 && ', '}
                  <a href={g.gameUrl} target={g.platform === 'bga' ? '_self' : '_blank'} rel="noopener noreferrer" className="underline hover:text-[#1a1a1a]">
                    {g.gameName}
                  </a>
                </span>
              ))}
            </span>
            <button
              onClick={() => setDepartedDismissed(true)}
              className="ml-1 text-[#9b9b9b] hover:text-[#1a1a1a] leading-none"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        {errors.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {errors.map(e => (
              <span key={e.platform} className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md">
                ⚠ {e.platform} unavailable
              </span>
            ))}
          </div>
        )}

        {showMine && (
          <section className="mb-7">
            <div className="flex items-center gap-3 mb-3">
              {myTurnGames.length > 0 && (
                // A real link, so middle-click / ctrl-click open it in a new tab
                <a
                  href={next.gameUrl}
                  target={openTarget(next)}
                  rel="noopener noreferrer"
                  // Marking it opened re-renders this link with the following
                  // game's URL; doing that synchronously would make the browser
                  // follow the new URL, so the state update waits until the click
                  // has been handled. Storage is written now: a BGA game opens in
                  // this tab and the page may unload before the timeout runs.
                  onClick={() => { const id = next.id; markOpenedInStorage(id); setTimeout(() => openGame(id), 0) }}
                  onAuxClick={() => { const id = next.id; markOpenedInStorage(id); setTimeout(() => openGame(id), 0) }}
                  title={`Open ${next.gameName}`}
                  className="min-w-0 max-w-[70%] flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-md bg-[#5e6ad2] text-white hover:bg-[#4f5ab8]">
                  <span className="truncate">Next: {next.gameName}</span>
                  <span className="shrink-0">▶</span>
                </a>
              )}
              {myTurnGames.length === 0 && (
                // Where Next would be, the same size
                <span className="text-xs font-medium px-3 py-1 rounded-md bg-green-50 text-green-700 border border-green-200">
                  All caught up ✓
                </span>
              )}
              <p className="shrink-0 text-[11px] font-semibold uppercase tracking-[.08em] text-[#9b9b9b]">
                Your turn · {myTurnGames.length}
              </p>
            </div>
            {myTurnGames.length + openedMyTurnGames.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5">
                {[...myTurnGames, ...openedMyTurnGames].map(g => <GameCard key={g.id} {...itemProps(g)} />)}
              </div>
            )}
          </section>
        )}

        {suggestion && (
          <BacklogSuggestion item={suggestion} activeCount={games.length} className="mb-7" onRemove={() => backlog.remove(suggestion.id)} />
        )}

        {showWaiting && waitingGames.length > 0 && (
          <section>
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#9b9b9b]">
                Waiting for others · {waitingGames.length}
              </p>
              {waitingExpanded && hiddenWhenCollapsed > 0 && (
                <button onClick={toggleWaiting} className="text-xs text-[#6b6b6b] hover:text-[#1a1a1a]">
                  Show fewer
                </button>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              {shownWaiting.map(g => <GameRow key={g.id} {...itemProps(g)} />)}
            </div>
            {!waitingExpanded && hiddenWhenCollapsed > 0 && (
              <button onClick={toggleWaiting} className="mt-2 w-full text-xs text-[#9b9b9b] hover:text-[#1a1a1a] py-1.5 rounded-md border border-dashed border-[#e5e5e5]">
                Show {hiddenWhenCollapsed} more
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

function BacklogSuggestion({ item, activeCount, className, onRemove }: { item: BacklogItem; activeCount: number; className: string; onRemove: () => void }) {
  return (
    <div className={`${className} flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[#c5c9f0] bg-[#f7f8fd]`}>
      <span className="hidden sm:inline text-xs text-[#6b6b6b]">
        {activeCount} active {activeCount === 1 ? 'game' : 'games'}. Next from your backlog:
      </span>
      <span title={PLATFORM_LABELS[item.platform]} className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-px rounded-full ${BADGE_COLORS[item.platform] ?? 'bg-[#f3f3f3] text-[#6b6b6b]'}`}>
        {PLATFORM_SHORT_LABELS[item.platform]}
      </span>
      <span className="text-sm font-medium text-[#1a1a1a] truncate flex-1 min-w-0">{item.gameName}</span>
      <a
        href={item.playUrl}
        target={item.platform === 'bga' ? '_self' : '_blank'}
        rel="noopener noreferrer"
        className="shrink-0 text-xs font-medium px-3 py-1 rounded-md bg-[#5e6ad2] text-white hover:bg-[#4f5ab8]">
        Play ↗
      </a>
      <button
        onClick={onRemove}
        title="Remove from backlog"
        aria-label={`Remove ${item.gameName} from backlog`}
        className="shrink-0 text-xs text-[#9b9b9b] hover:text-red-500 px-1"
      >
        ✕
      </button>
    </div>
  )
}
