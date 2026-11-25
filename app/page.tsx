'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGamesData } from '@/hooks/useGamesData'
import { usePrefs } from '@/hooks/usePrefs'
import { useNotes } from '@/hooks/useNotes'
import { isBackForwardNavigation } from '@/lib/navigation'
import { Platform } from '@/lib/types'
import { Presence, Opened, resolveOpened, readStoredOpened, writeStoredOpened, storeOpenedNow, nextNotePrompt, decideReturnRefresh, stillShownAsOpened, RETURN_GRACE_MS, AWAY_REFRESH_MS } from '@/lib/dismissal'
import GameGrid from '@/components/GameGrid'
import FetchProgress from '@/components/FetchProgress'
import NewGamesPopup from '@/components/NewGamesPopup'
import NotePromptPopup from '@/components/NotePromptPopup'

// A platform not reflecting a just-submitted move right away used to be
// handled as a curated list of known offenders (OBG, BoardTogether,
// Boardgamers.space) — Rally the Troops turning up with the exact same
// symptom is what gave up on that list. judge() (lib/dismissal.ts) now
// gives every platform the same RETURN_GRACE_MS benefit of the doubt
// before reading a lingering myTurn:true as "nothing happened", computed
// straight from each game's own openedAt rather than a live "you just
// returned" event — a live event is exactly what a backgrounded mobile
// tab silently reloaded by the OS doesn't carry (that's a plain reload,
// not the back/forward navigation lib/navigation.ts can detect), which is
// why two earlier, narrower attempts at this each broke in a different
// way. PLATFORM_REFRESH_RETRY_DELAYS_MS below is purely a responsiveness
// nicety on top of that correctness guarantee: a few extra scoped checks
// so the card settles sooner than waiting for the next periodic refresh,
// not something correctness depends on — if every one of these still
// finds myTurn true, the card simply stays dimmed (protected by its own
// openedAt) until a later refresh, of any kind, finds otherwise.
const PLATFORM_REFRESH_RETRY_DELAYS_MS = [3000, 7000, 15000, 30000]

// Once those run out (under a minute after return), nothing else re-checked
// an unconfirmed platform until either the next periodic auto-refresh (off
// by default — see useAutoRefresh) or some unrelated game's own return event
// happened to touch the same platform, which is exactly how a confirmation
// slower than a minute ended up surfacing its note-prompt "only after a
// round in another game" instead of on its own. This keeps rechecking any
// platform with a still-unconfirmed opened game (no movedSeenAt yet, whether
// or not its display grace has run out — see dimExpired) every
// UNCONFIRMED_POLL_MS on its own, independent of auto-refresh and of any
// other game's return, until it's confirmed (or ends).
const UNCONFIRMED_POLL_MS = 60 * 1000

export default function DashboardPage() {
  const { prefs, updatePrefs } = usePrefs()
  const { notes, saveNote } = useNotes()
  const [opened, setOpened] = useState<Opened>({})

  // Which opened game (if any) should get a "plan for next round?" popup —
  // the first one whose move is confirmed and not already prompted for since
  // it was opened (see nextNotePrompt). notePrompted lives inside `opened`
  // itself, so it survives a plain page reload instead of resetting to
  // unprompted (and popping the popup back up) the way separate component
  // state would.
  const notePromptId = useMemo(() => nextNotePrompt(opened), [opened])
  const dismissNotePrompt = (id: string) => {
    setOpened(prev => {
      const entry = prev[id]
      if (!entry || entry.notePrompted) return prev
      const next = { ...prev, [id]: { ...entry, notePrompted: true } }
      writeStoredOpened(next)
      return next
    })
  }
  const {
    displayedData,
    isRefreshing,
    lastError,
    platformStatuses,
    freshDataVersion,
    freshDataStartedAt,
    triggerRefresh,
    cachedAt,
    departedGames,
  } = useGamesData()
  const promptGame = notePromptId ? displayedData?.games.find(g => g.id === notePromptId) : undefined

  // See stillShownAsOpened's own comment for why this needs the live games
  // list, not just `opened` on its own.
  const dismissed = useMemo(() => {
    const byId = new Map((displayedData?.games ?? []).map(g => [g.id, g]))
    return new Set(Object.entries(opened).filter(([id, o]) => stillShownAsOpened(o, byId.get(id))).map(([id]) => id))
  }, [opened, displayedData])
  const refresh = useCallback(() => triggerRefresh(), [triggerRefresh])
  // Set right before an explicit manual refresh and read (then cleared) by
  // the resolveOpened effect below, so just that one fetch can ask to judge
  // an opened game immediately — see resolveOpened's `immediate` parameter.
  const manualRefreshPendingRef = useRef(false)
  const manualRefresh = useCallback(() => {
    manualRefreshPendingRef.current = true
    triggerRefresh()
  }, [triggerRefresh])
  const presenceRef = useRef<Presence>({ returnedAt: 0, leftAt: null })
  const openedRef = useRef(opened)
  useEffect(() => { openedRef.current = opened }, [opened])
  const fetchedAtRef = useRef(displayedData?.fetchedAt)
  useEffect(() => { fetchedAtRef.current = displayedData?.fetchedAt }, [displayedData?.fetchedAt])
  const refreshIntervalRef = useRef(prefs.refreshIntervalSeconds)
  useEffect(() => { refreshIntervalRef.current = prefs.refreshIntervalSeconds }, [prefs.refreshIntervalSeconds])
  const pokeTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // Fires a few extra scoped checks of `platforms` at fixed times after
  // return, purely so the card settles sooner than waiting for the next
  // periodic refresh if this particular move happens to land slowly —
  // correctness doesn't depend on this (see the comment above
  // PLATFORM_REFRESH_RETRY_DELAYS_MS), so none of them need to inspect
  // what an earlier one found; all are scheduled upfront rather than
  // chained, so there's nothing to re-check before firing the next one.
  const schedulePoke = useCallback((platforms: Platform[]) => {
    let cumulative = 0
    pokeTimersRef.current = PLATFORM_REFRESH_RETRY_DELAYS_MS.map(delay => {
      cumulative += delay
      return setTimeout(() => triggerRefresh(true, platforms), cumulative)
    })
  }, [triggerRefresh])

  // Opening a game takes the user away from this tab (BGA in this tab, others
  // in a new one). Track when they leave and come back, and refresh as soon
  // as they're back so the hidden game shows its state after their move.
  // This is the ONLY place that decides what to refresh on return — the
  // auto-refresh ticker (useAutoRefresh) used to have its own separate
  // "catch up if stale" check on the same visibilitychange event, which
  // could fire its own full refresh at the same time as this one's
  // platform-scoped refresh, racing each other and making the targeted
  // refresh pointless. So: if the auto-refresh interval has already lapsed,
  // everything needs refreshing anyway — do that. Otherwise, if a game is
  // open, refresh just its platform(s), not every configured one.
  useEffect(() => {
    // visibilityState alone, not document.hasFocus() too: many mobile
    // browsers (especially a PWA/home-screen one) never report focus true
    // even while the dashboard is the one thing on screen, which pinned
    // leftAt at mount and kept every later fetch judged "not present" —
    // resolveOpened then never advances an opened game past its original
    // state, so it stayed "opened" (dimmed, not purple) forever instead of
    // reverting once it was actually my turn again.
    const isHere = () => document.visibilityState === 'visible'
    // returnedAt stays 0 on a normal load, so the first fetch counts fully.
    // Coming Back from a game opened in this tab is a return, from when the
    // navigation started (before the page's first fetch)
    if (!isHere()) presenceRef.current = { returnedAt: 0, leftAt: Date.now() }
    else if (isBackForwardNavigation()) presenceRef.current = { returnedAt: Math.floor(performance.timeOrigin), leftAt: null }
    const onChange = () => {
      const p = presenceRef.current
      const now = Date.now()
      if (!isHere()) {
        if (p.leftAt === null) presenceRef.current = { ...p, leftAt: now }
      } else if (p.leftAt !== null) {
        const awayFor = now - p.leftAt
        presenceRef.current = { returnedAt: now, leftAt: null }
        // The running fetch (if any) began while away, so restart it
        if (awayFor < AWAY_REFRESH_MS) return

        const fetchedMs = fetchedAtRef.current ? Date.parse(fetchedAtRef.current) : NaN
        const staleForMs = Number.isNaN(fetchedMs) ? Infinity : now - fetchedMs
        const intervalMs = (refreshIntervalRef.current ?? 0) * 1000

        const decision = decideReturnRefresh(openedRef.current, staleForMs, intervalMs)
        pokeTimersRef.current.forEach(clearTimeout)
        pokeTimersRef.current = []

        // A few extra scoped checks for whichever platforms currently have
        // an open game, purely so the card settles sooner than waiting for
        // the next periodic refresh.
        const openedPlatformsNow = [...new Set(Object.keys(openedRef.current).map(id => id.split(':')[0] as Platform))]
        if (openedPlatformsNow.length > 0) schedulePoke(openedPlatformsNow)

        if (decision.kind === 'full') {
          triggerRefresh(true)
        } else if (decision.kind === 'platforms') {
          triggerRefresh(true, decision.platforms as Platform[])
        }
      }
    }
    const events = ['focus', 'blur', 'pageshow', 'pagehide'] as const
    events.forEach(e => window.addEventListener(e, onChange))
    document.addEventListener('visibilitychange', onChange)
    return () => {
      events.forEach(e => window.removeEventListener(e, onChange))
      document.removeEventListener('visibilitychange', onChange)
      pokeTimersRef.current.forEach(clearTimeout)
    }
  }, [triggerRefresh, schedulePoke])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after hydration
    setOpened(readStoredOpened())
  }, [])

  // Keeps rechecking any platform with a still-unconfirmed opened game (see
  // UNCONFIRMED_POLL_MS above) for as long as one exists, restarting
  // whenever `opened` actually changes (a new game opened, one confirmed,
  // one ended) so it always targets the current set rather than one
  // snapshotted when the effect first ran.
  useEffect(() => {
    const unconfirmedPlatforms = [...new Set(
      Object.entries(opened).filter(([, o]) => o.movedSeenAt === undefined).map(([id]) => id.split(':')[0] as Platform)
    )]
    if (unconfirmedPlatforms.length === 0) return
    const id = setInterval(() => {
      if (document.hidden) return
      triggerRefresh(true, unconfirmedPlatforms)
    }, UNCONFIRMED_POLL_MS)
    return () => clearInterval(id)
  }, [opened, triggerRefresh])

  // Fresh server data (not cache loads) decides which opened games stay
  // dimmed — see resolveOpened/judge, including the grace period computed
  // there straight from each game's own openedAt. Runs the same way for
  // every fetch, full or scoped, with nothing extra to coordinate.
  useEffect(() => {
    if (freshDataVersion === 0 || !displayedData) return
    const immediate = manualRefreshPendingRef.current
    manualRefreshPendingRef.current = false
    setOpened(prev => {
      const next = resolveOpened(prev, displayedData.games, freshDataStartedAt, presenceRef.current, RETURN_GRACE_MS, immediate)
      if (next !== prev) writeStoredOpened(next)
      return next
    })
    // displayedData changes together with freshDataVersion
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshDataVersion, freshDataStartedAt])

  // An opened game is dimmed (and skipped by Next) until fresh data shows its actual state
  const handleOpen = (id: string) => {
    setOpened(storeOpenedNow(id))
  }

  const hasFreshData = freshDataVersion > 0
  const showFullProgress = !displayedData && isRefreshing
  const showCompactProgress = !!displayedData && isRefreshing

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <NewGamesPopup />
      {showCompactProgress && (
        <FetchProgress platformStatuses={platformStatuses} compact />
      )}
      {showFullProgress ? (
        <FetchProgress platformStatuses={platformStatuses} />
      ) : displayedData ? (
        <GameGrid
          data={displayedData}
          prefs={prefs}
          onPrefsChange={updatePrefs}
          dismissed={dismissed}
          onRefresh={refresh}
          onManualRefresh={manualRefresh}
          isRefreshing={isRefreshing}
          lastError={lastError}
          cachedAt={cachedAt}
          onOpen={handleOpen}
          departedGames={departedGames}
          notes={notes}
          onSaveNote={saveNote}
        />
      ) : lastError ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-500 mb-3">Failed to load games</p>
            <button
              onClick={refresh}
              className="text-xs bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-muted-hover)] px-3 py-1.5 rounded-md"
            >
              ↻ Try again
            </button>
          </div>
        </div>
      ) : null}
      {promptGame && (
        <NotePromptPopup
          game={promptGame}
          note={notes[promptGame.id]}
          shownAt={opened[promptGame.id]?.movedSeenAt}
          onSave={text => { saveNote(promptGame.id, text); dismissNotePrompt(promptGame.id) }}
          onDelete={() => saveNote(promptGame.id, '')}
        />
      )}
    </div>
  )
}
