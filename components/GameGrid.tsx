'use client'
import { useEffect, useMemo, useState } from 'react'
import { Game, Platform, UserPrefs, GamesApiResponse, PLATFORM_LABELS } from '@/lib/types'
import { DepartedGame } from '@/hooks/useGamesData'
import { sortAndFilter } from '@/lib/sort-filter'
import { BADGE_COLORS } from '@/lib/platform-colors'
import GameCard, { GameRow, GameItemProps, isOpponentSlow, openTarget } from './GameCard'
import { useBacklog } from '@/hooks/useBacklog'
import { useNotes } from '@/hooks/useNotes'
import { backlogId, listOf } from '@/lib/backlog/list'
import FilterToolbar from './FilterToolbar'
import TopNav from './TopNav'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'

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
// Below this many active games the dashboard suggests the next backlog game
const FEW_GAMES = 10

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
  const openedMyTurnGames = sortAndFilter(visible.filter(g => g.myTurn && isOpened(g)), prefs, now)
  const waitingGames = sortAndFilter(visible.filter(g => !g.myTurn), prefs, now)
  const showMine = prefs.filter.turnStatus !== 'waiting'
  const showWaiting = prefs.filter.turnStatus !== 'my-turn'
  const platformFilter = prefs.filter.platforms

  const setPlatformFilter = (platforms: Platform[]) => onPrefsChange({ ...prefs, filter: { ...prefs.filter, platforms } })
  const togglePlatform = (p: Platform) => setPlatformFilter(
    platformFilter.includes(p) ? platformFilter.filter(x => x !== p) : [...platformFilter, p],
  )

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
  const alwaysShownWaiting = waitingGames.filter(g => prefs.pins.includes(g.id) || isOpponentSlow(g, opponentSlowDays, now))
  const shownWaiting = waitingExpanded ? waitingGames : alwaysShownWaiting
  const hiddenWhenCollapsed = waitingGames.length - alwaysShownWaiting.length

  const { notes, saveNote } = useNotes()

  // "Next" opens the first game of "Your turn" (most urgent, then the chosen sort)
  const next = myTurnGames[0]

  // With few games going, suggest the top of "Next to play" that isn't already running
  const backlog = useBacklog()
  const suggestion = games.length < FEW_GAMES
    ? (backlog.items ?? []).find(item => listOf(item) === 'play'
      && !games.some(g => backlogId(g.platform, g.gameType || g.gameName) === item.id))
    : undefined

  const togglePin = async (id: string) => {
    const pins = prefs.pins.includes(id)
      ? prefs.pins.filter(p => p !== id)
      : [...prefs.pins, id]
    const updated = { ...prefs, pins }
    onPrefsChange(updated)
    await fetch('/api/prefs', { method: 'POST', body: JSON.stringify({ pins }), headers: { 'Content-Type': 'application/json' } })
  }

  const { intervalSeconds, setIntervalSeconds, countdown } = useAutoRefresh(onRefresh, isRefreshing)

  const itemProps = (g: Game): GameItemProps => ({
    game: g,
    pinned: prefs.pins.includes(g.id),
    onTogglePin: togglePin,
    onOpen: () => onOpen(g.id),
    opponentSlowDays,
    note: notes[g.id],
    onSaveNote: saveNote,
    now,
    opened: isOpened(g),
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
        onChange={e => setIntervalSeconds(Number(e.target.value))}
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
      <div className="flex-1 overflow-y-auto p-5">
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

        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {configuredPlatforms.length > 1 && (
            <>
              <button
                onClick={() => setPlatformFilter([])}
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors
                  ${platformFilter.length === 0 ? 'bg-[#1a1a1a] text-white' : 'bg-[#f3f3f3] text-[#6b6b6b] hover:bg-[#ebebeb]'}`}>
                All ({visible.length})
              </button>
              {configuredPlatforms.map(p => (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  aria-pressed={platformFilter.includes(p)}
                  className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full transition-opacity ${BADGE_COLORS[p] ?? 'bg-[#f3f3f3] text-[#6b6b6b]'}
                    ${platformFilter.length === 0 || platformFilter.includes(p) ? 'opacity-100' : 'opacity-40 hover:opacity-70'}
                    ${platformFilter.includes(p) ? 'ring-2 ring-[#1a1a1a]/20' : ''}`}>
                  {PLATFORM_LABELS[p]} ({countByPlatform[p] ?? 0})
                </button>
              ))}
            </>
          )}
          <div className="ml-auto"><FilterToolbar prefs={prefs} onChange={onPrefsChange} /></div>
        </div>

        {showMine && (
          <section className="mb-7">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#9b9b9b]">
                Your turn · {myTurnGames.length}
              </p>
              {myTurnGames.length > 0 && (
                // A real link, so middle-click / ctrl-click open it in a new tab
                <a
                  href={next.gameUrl}
                  target={openTarget(next)}
                  rel="noopener noreferrer"
                  onClick={() => onOpen(next.id)}
                  onAuxClick={() => onOpen(next.id)}
                  title={`Open ${next.gameName}`}
                  className="min-w-0 max-w-[60%] flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-md bg-[#5e6ad2] text-white hover:bg-[#4f5ab8]">
                  <span className="truncate">Next: {next.gameName}</span>
                  <span className="shrink-0">▶</span>
                </a>
              )}
            </div>
            {myTurnGames.length === 0 && (
              <p className="text-sm text-[#6b6b6b] text-center py-6 mb-2.5 rounded-lg border border-dashed border-[#e5e5e5]">
                All caught up ✓
              </p>
            )}
            {myTurnGames.length + openedMyTurnGames.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5">
                {[...myTurnGames, ...openedMyTurnGames].map(g => <GameCard key={g.id} {...itemProps(g)} />)}
              </div>
            )}
          </section>
        )}

        {suggestion && (
          <div className="mb-7 flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[#c5c9f0] bg-[#f7f8fd]">
            <span className="hidden sm:inline text-xs text-[#6b6b6b]">
              {games.length} active {games.length === 1 ? 'game' : 'games'}. Next from your backlog:
            </span>
            <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-px rounded-full ${BADGE_COLORS[suggestion.platform] ?? 'bg-[#f3f3f3] text-[#6b6b6b]'}`}>
              {PLATFORM_LABELS[suggestion.platform]}
            </span>
            <span className="text-sm font-medium text-[#1a1a1a] truncate flex-1 min-w-0">{suggestion.gameName}</span>
            <a
              href={suggestion.playUrl}
              target={suggestion.platform === 'bga' ? '_self' : '_blank'}
              rel="noopener noreferrer"
              className="shrink-0 text-xs font-medium px-3 py-1 rounded-md bg-[#5e6ad2] text-white hover:bg-[#4f5ab8]">
              Play ↗
            </a>
          </div>
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
                Show {hiddenWhenCollapsed} more, where the opponent moved recently
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
