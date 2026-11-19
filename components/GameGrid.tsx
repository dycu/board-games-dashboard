'use client'
import { useEffect, useMemo, useState } from 'react'
import { Game, Platform, UserPrefs, GamesApiResponse, PLATFORM_LABELS, PLATFORM_SHORT_LABELS } from '@/lib/types'
import { DepartedGame } from '@/hooks/useGamesData'
import { sortAndFilter } from '@/lib/sort-filter'
import { BADGE_COLORS } from '@/lib/platform-colors'
import GameCard, { GameRow, GameItemProps, Priority, isOpponentSlow, openTarget } from './GameCard'
import { useBacklog } from '@/hooks/useBacklog'
import { useTableLabels } from '@/hooks/useTableLabels'
import { BacklogItem, backlogId, listsOf } from '@/lib/backlog/list'
import FilterToolbar from './FilterToolbar'
import PlatformFilterChips from './PlatformFilterChips'
import TopNav from './TopNav'
import ReadNotePopup from './ReadNotePopup'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { useNoteConfirmedOpen } from '@/hooks/useNoteConfirmedOpen'
import { storeOpenedNow } from '@/lib/dismissal'
import { useAutoAnimate } from '@formkit/auto-animate/react'

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
  notes: Record<string, string>
  onSaveNote: (id: string, text: string) => void
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

export default function GameGrid({ data, prefs, onPrefsChange, dismissed, onRefresh, isRefreshing, lastError, cachedAt, onOpen, departedGames, notes, onSaveNote: saveNote }: Props) {
  // Animates cards sliding into their new position instead of just jumping
  // there — on a sort change, a click (opening/dimming a card moves it),
  // or new data reordering things. One ref per section, since they're
  // separate DOM containers.
  const [myTurnGridRef] = useAutoAnimate()
  const [waitingListRef] = useAutoAnimate()
  const { games, errors } = data
  const configuredPlatforms = data.platforms ?? Array.from(
    new Set([...games.map(g => g.platform), ...errors.map(e => e.platform)])
  )
  // Opened games stay on the page, dimmed, so a note can still be added
  // after the move; they no longer count as waiting for me
  const visible = games
  const isOpened = (g: Game) => dismissed.has(g.id)
  // The busiest game's move count today, across every visible game (both
  // sections) — see GameCard's heatBg. Relative to this instead of a fixed
  // scale, so a day spent playing a lot doesn't just turn everything the
  // same dark orange.
  const maxMoveCountToday = Math.max(0, ...visible.map(g => g.moveCountToday ?? 0))
  // Sum across every visible game — shown in the top bar (navRight below),
  // separately from heatBg's per-card relative share
  const totalMoveCountToday = visible.reduce((sum, g) => sum + (g.moveCountToday ?? 0), 0)
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
  const waitingGames = sortAndFilter(visible.filter(g => !g.myTurn && !isOpened(g)), prefs, now, { respectPins: false })
  const showMine = prefs.filter.turnStatus !== 'waiting'
  const showWaiting = prefs.filter.turnStatus !== 'my-turn'
  const platformFilter = prefs.filter.platforms

  // Saved to the server too (not just local state), the same way pins/sunk
  // below are — otherwise it only ever lives in localStorage,
  // and the plain fetch('/api/prefs') on mount (app/page.tsx) overwrites it
  // back to the stale server copy on the very next load.
  //
  // prefs.filter.platforms itself stores "empty = all, null = none" (lib/sort-filter.ts
  // reads it that way too); PlatformFilterChips wants the already-resolved
  // list instead, so this is where the two meet.
  const selectedPlatforms = platformFilter === null ? [] : platformFilter.length === 0 ? configuredPlatforms : platformFilter
  const setSelectedPlatforms = (next: Platform[]) => {
    const platforms = next.length === 0 ? null : configuredPlatforms.every(p => next.includes(p)) ? [] : next
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

  // "Next" opens the first game of "Your turn" (most urgent, then the chosen sort)
  const next = myTurnGames[0]
  // Marking it opened re-renders this link with the following game's URL;
  // doing that synchronously would make the browser follow the new URL, so
  // the state update waits until the click has been handled. Storage is
  // written now: a BGA game opens in this tab and the page may unload
  // before the timeout runs.
  const openNext = () => {
    if (!next) return
    const id = next.id
    markOpenedInStorage(id)
    setTimeout(() => openGame(id), 0)
  }
  const nextNoteConfirm = useNoteConfirmedOpen(next, next ? openTarget(next) : '_blank', next ? notes[next.id] : undefined, openNext)

  // With few games going, suggest the top of "Next to play" that isn't already running
  const backlog = useBacklog()
  const { labels: tableLabels, saveLabel: saveTableLabel } = useTableLabels()
  // A platform that failed to fetch this round, or that's turned off in
  // Settings, has no games in `games` for a reason unrelated to whether
  // one's actually running — never read that as "nothing running" and
  // nudge to start a duplicate.
  const unavailablePlatforms = new Set([...errors.map(e => e.platform), ...(prefs.disabledPlatforms ?? [])])
  // Shown right under my games: the top "Next to play" game that isn't already running
  const suggestion = (backlog.items ?? []).find(item => listsOf(item).includes('play')
    && !unavailablePlatforms.has(item.platform)
    && !games.some(g => backlogId(g.platform, g.gameType || g.gameName) === item.id))
  // Every favorite title with no active game of its own — not just the one
  // overall, since a favorite having a running game shouldn't hide the nudge
  // for a *different* favorite that doesn't
  const favoriteSuggestions = (backlog.items ?? []).filter(item => listsOf(item).includes('favorite')
    && !unavailablePlatforms.has(item.platform)
    && !games.some(g => backlogId(g.platform, g.gameType || g.gameName) === item.id))
  // GMed titles under their running-games target — e.g. hosting several
  // tables of the same title at once. A dedicated list (not just a
  // favorite), since it's worth flagging more prominently than that.
  const gmSuggestions = (backlog.items ?? [])
    .filter(item => listsOf(item).includes('gm') && item.parallelTarget && item.parallelTarget > 1 && !unavailablePlatforms.has(item.platform))
    .map(item => ({ item, running: games.filter(g => backlogId(g.platform, g.gameType || g.gameName) === item.id).length }))
    .filter(({ item, running }) => running < item.parallelTarget!)

  const priorityOf = (id: string): Priority => prefs.pins.includes(id) ? 'pinned' : (prefs.sunk ?? []).includes(id) ? 'sunk' : null

  // Computes both arrays together from one snapshot of prefs and sends one
  // update — pinned -> sunk needs to unpin AND sink in the same step, and
  // two separate onPrefsChange calls (one per array) would race: the
  // second's spread of the still-stale `prefs` would silently undo the
  // first's change to the other array.
  const cyclePriority = async (id: string) => {
    const current = priorityOf(id)
    const next: Priority = current === null ? 'pinned' : current === 'pinned' ? 'sunk' : null
    const pins = next === 'pinned' ? [...prefs.pins, id] : prefs.pins.filter(p => p !== id)
    const sunk = next === 'sunk' ? [...(prefs.sunk ?? []), id] : (prefs.sunk ?? []).filter(p => p !== id)
    onPrefsChange({ ...prefs, pins, sunk })
    await fetch('/api/prefs', { method: 'POST', body: JSON.stringify({ pins, sunk }), headers: { 'Content-Type': 'application/json' } })
  }

  const { intervalSeconds, setIntervalSeconds, countdown } = useAutoRefresh(onRefresh, isRefreshing, prefs.refreshIntervalSeconds)

  // Saved to the server too, the same way the filter/pins/sunk
  // are above — otherwise it only ever lives in the hook's local state and
  // resets to Off on the next load.
  const setRefreshInterval = (refreshIntervalSeconds: number) => {
    setIntervalSeconds(refreshIntervalSeconds)
    onPrefsChange({ ...prefs, refreshIntervalSeconds })
    fetch('/api/prefs', { method: 'POST', body: JSON.stringify({ refreshIntervalSeconds }), headers: { 'Content-Type': 'application/json' } }).catch(() => {})
  }

  const itemProps = (g: Game): GameItemProps => {
    return {
      game: g,
      priority: priorityOf(g.id),
      onCyclePriority: cyclePriority,
      onOpen: () => openGame(g.id),
      opponentSlowDays,
      deadlineSoonHours,
      note: notes[g.id],
      onSaveNote: saveNote,
      tableLabel: tableLabels[g.id],
      onSaveTableLabel: saveTableLabel,
      now,
      opened: isOpened(g),
      maxMoveCountToday,
    }
  }

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
        <span className="text-[var(--accent)] font-medium">{myTurnCount}{' '}your turn</span>
        {totalMoveCountToday > 0 && (
          <>
            {' '}&nbsp;·&nbsp;
            <span className="text-orange-600 font-medium">🔥 {totalMoveCountToday}{' '}today</span>
          </>
        )}
      </span>
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        className="bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-muted-hover)] disabled:opacity-50 disabled:cursor-not-allowed px-2.5 py-1 rounded-md flex items-center gap-1">
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
        className="bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-muted-hover)] text-xs px-2 py-1 rounded-md cursor-pointer"
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
            sticky at all.

            z-30, not z-10: GameCard's own buttons (pin/sink/note/...)
            are `relative z-10` to clear CoverLink *within their own card*,
            but the card itself has no z-index of its own, so those z-10
            buttons don't get a separate stacking context — they tie this
            bar's z-index and, on a tie, paint order falls back to DOM order,
            which favors the (later) card. On narrow screens, where this bar
            wraps to two lines and so covers more of a scrolled-past card,
            that let a card's icon row poke through the sticky bar on top. */}
        <div className="sticky top-0 z-30 bg-[var(--bg-page)] -mx-5 px-5 pt-5 pb-2 mb-1 flex flex-wrap items-center gap-3 border-b border-[var(--border-default)]">
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
          <div className="mb-3 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <span>↩</span>
            <span>
              {departedGames.length === 1 ? '1 game' : `${departedGames.length} games`} ended since last refresh:{' '}
              {departedGames.map((g, i) => (
                <span key={g.id}>
                  {i > 0 && ', '}
                  <a href={g.gameUrl} target={g.platform === 'bga' ? '_self' : '_blank'} rel="noopener noreferrer" className="underline hover:text-[var(--text-primary)]">
                    {g.gameName}
                  </a>
                </span>
              ))}
            </span>
            <button
              onClick={() => setDepartedDismissed(true)}
              className="ml-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] leading-none"
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
                  onClick={nextNoteConfirm.onClick}
                  onAuxClick={nextNoteConfirm.onAuxClick}
                  title={`Open ${next.gameName}`}
                  className="min-w-0 max-w-[70%] flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]">
                  <span className="truncate">Next: {next.gameName}</span>
                  <span className="shrink-0">▶</span>
                </a>
              )}
              {nextNoteConfirm.pendingTarget && next && notes[next.id] && (
                <ReadNotePopup gameName={next.gameName} note={notes[next.id]} onConfirm={nextNoteConfirm.confirm} onCancel={nextNoteConfirm.cancel} />
              )}
              {myTurnGames.length === 0 && (
                // Where Next would be, the same size
                <span className="text-xs font-medium px-3 py-1 rounded-md bg-green-50 text-green-700 border border-green-200">
                  All caught up ✓
                </span>
              )}
              <p className="shrink-0 text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--text-tertiary)]">
                Your turn · {myTurnGames.length}
              </p>
            </div>
            {myTurnGames.length + openedMyTurnGames.length > 0 && (
              <div ref={myTurnGridRef} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5">
                {[...myTurnGames, ...openedMyTurnGames].map(g => <GameCard key={g.id} {...itemProps(g)} />)}
              </div>
            )}
          </section>
        )}

        {gmSuggestions.length > 0 && (
          <div className="mb-7 flex flex-col gap-2">
            {gmSuggestions.map(({ item, running }) => (
              <GmSuggestion key={item.id} item={item} running={running} />
            ))}
          </div>
        )}

        {favoriteSuggestions.length > 0 && (
          <div className="mb-7 flex flex-col gap-2">
            {favoriteSuggestions.map(item => (
              <FavoriteSuggestion key={item.id} item={item} onDismiss={() => backlog.toggle(item.id, 'favorite')} />
            ))}
          </div>
        )}

        {suggestion && (
          <BacklogSuggestion item={suggestion} activeCount={games.length} className="mb-7" onRemove={() => backlog.remove(suggestion.id)} />
        )}

        {showWaiting && waitingGames.length > 0 && (
          <section>
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--text-tertiary)]">
                Waiting for others · {waitingGames.length}
              </p>
              {waitingExpanded && hiddenWhenCollapsed > 0 && (
                <button onClick={toggleWaiting} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                  Show fewer
                </button>
              )}
            </div>
            <div ref={waitingListRef} className="flex flex-col gap-1.5">
              {shownWaiting.map(g => <GameRow key={g.id} {...itemProps(g)} />)}
            </div>
            {!waitingExpanded && hiddenWhenCollapsed > 0 && (
              <button onClick={toggleWaiting} className="mt-2 w-full text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] py-1.5 rounded-md border border-dashed border-[var(--border-default)]">
                Show {hiddenWhenCollapsed} more
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

function FavoriteSuggestion({ item, onDismiss }: { item: BacklogItem; onDismiss: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-amber-300 bg-amber-50">
      <span className="shrink-0 text-amber-500" aria-hidden="true">★</span>
      <span className="hidden sm:inline text-xs text-amber-700">No game running in your favorite:</span>
      <span title={PLATFORM_LABELS[item.platform]} className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-px rounded-full ${BADGE_COLORS[item.platform] ?? 'bg-[var(--bg-muted)] text-[var(--text-secondary)]'}`}>
        {PLATFORM_SHORT_LABELS[item.platform]}
      </span>
      <span className="text-sm font-medium text-[var(--text-primary)] truncate flex-1 min-w-0">{item.gameName}</span>
      <a
        href={item.playUrl}
        target={item.platform === 'bga' ? '_self' : '_blank'}
        rel="noopener noreferrer"
        className="shrink-0 text-xs font-medium px-3 py-1 rounded-md bg-amber-500 text-white hover:bg-amber-600">
        Play ↗
      </a>
      <button
        onClick={onDismiss}
        title="Remove from favorites"
        aria-label={`Remove ${item.gameName} from favorites`}
        className="shrink-0 text-xs text-amber-400 hover:text-red-500 px-1"
      >
        ✕
      </button>
    </div>
  )
}

// Styled distinctly from Favorite (indigo, the app's own accent color,
// solid border instead of dashed) — this is meant to read as more
// prominent, not just another variant of the same nudge.
function GmSuggestion({ item, running }: { item: BacklogItem; running: number }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent-tint)]">
      <span className="shrink-0 text-[var(--accent)]" aria-hidden="true">⇶</span>
      <span className="hidden sm:inline text-xs font-medium text-[var(--accent-hover)]">GM · running {running} of {item.parallelTarget}:</span>
      <span className="sm:hidden text-xs font-medium text-[var(--accent-hover)] tabular-nums">GM {running}/{item.parallelTarget}</span>
      <span title={PLATFORM_LABELS[item.platform]} className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-px rounded-full ${BADGE_COLORS[item.platform] ?? 'bg-[var(--bg-muted)] text-[var(--text-secondary)]'}`}>
        {PLATFORM_SHORT_LABELS[item.platform]}
      </span>
      <span className="text-sm font-medium text-[var(--text-primary)] truncate flex-1 min-w-0">{item.gameName}</span>
      <a
        href={item.playUrl}
        target={item.platform === 'bga' ? '_self' : '_blank'}
        rel="noopener noreferrer"
        className="shrink-0 text-xs font-medium px-3 py-1 rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]">
        Start another ↗
      </a>
    </div>
  )
}

function BacklogSuggestion({ item, activeCount, className, onRemove }: { item: BacklogItem; activeCount: number; className: string; onRemove: () => void }) {
  return (
    <div className={`${className} flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[var(--accent-border-hover)] bg-[var(--accent-tint-alt)]`}>
      <span className="hidden sm:inline text-xs text-[var(--text-secondary)]">
        {activeCount} active {activeCount === 1 ? 'game' : 'games'}. Next from your backlog:
      </span>
      <span title={PLATFORM_LABELS[item.platform]} className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-px rounded-full ${BADGE_COLORS[item.platform] ?? 'bg-[var(--bg-muted)] text-[var(--text-secondary)]'}`}>
        {PLATFORM_SHORT_LABELS[item.platform]}
      </span>
      <span className="text-sm font-medium text-[var(--text-primary)] truncate flex-1 min-w-0">{item.gameName}</span>
      <a
        href={item.playUrl}
        target={item.platform === 'bga' ? '_self' : '_blank'}
        rel="noopener noreferrer"
        className="shrink-0 text-xs font-medium px-3 py-1 rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]">
        Play ↗
      </a>
      <button
        onClick={onRemove}
        title="Remove from backlog"
        aria-label={`Remove ${item.gameName} from backlog`}
        className="shrink-0 text-xs text-[var(--text-tertiary)] hover:text-red-500 px-1"
      >
        ✕
      </button>
    </div>
  )
}
