'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGamesData } from '@/hooks/useGamesData'
import { usePrefs } from '@/hooks/usePrefs'
import { useNotes } from '@/hooks/useNotes'
import { isBackForwardNavigation } from '@/lib/navigation'
import { Platform } from '@/lib/types'
import { Presence, Opened, resolveOpened, readStoredOpened, writeStoredOpened, storeOpenedNow, protectLaggingGames, nextNotePrompt, decideReturnRefresh, RETURN_GRACE_MS, AWAY_REFRESH_MS } from '@/lib/dismissal'
import GameGrid from '@/components/GameGrid'
import FetchProgress from '@/components/FetchProgress'
import NewGamesPopup from '@/components/NewGamesPopup'
import NotePromptPopup from '@/components/NotePromptPopup'

// OBG, BoardTogether and Boardgamers.space all don't reflect a just-submitted
// move in their own data right away — the lag is apparently variable, not a
// fixed couple of seconds. Correctness-wise, resolveOpened/judge (see
// lib/dismissal.ts's protectUntil) is what keeps a game on one of these
// platforms from being wrongly un-dimmed by a lingering myTurn:true right
// after you return — and that protection is set below for every return,
// whichever refresh ends up firing (full or scoped), so it doesn't matter
// how long the lag actually lasts or which fetch happens to land first.
// PLATFORM_REFRESH_RETRY_DELAYS_MS below is purely a responsiveness nicety
// on top of that: a few extra scoped checks so the card settles sooner than
// waiting for the next periodic refresh, not something correctness depends
// on — if every one of these still finds myTurn true, the card simply stays
// dimmed (protected) until a later refresh, of any kind, finds otherwise.
const SETTLE_DELAY_PLATFORMS: Platform[] = ['obg', 'boardtogether', 'boardgamers']
const PLATFORM_REFRESH_RETRY_DELAYS_MS = [3000, 7000, 15000, 30000]
// How long resolveOpened holds off treating a lagging platform's lingering
// myTurn:true as "nothing happened" — long enough for the slowest observed
// lag, same window a confirmed move gets to show the note popup.
const LAG_GRACE_MS = RETURN_GRACE_MS

export default function DashboardPage() {
  const { prefs, updatePrefs } = usePrefs()
  const { notes, saveNote } = useNotes()
  const [opened, setOpened] = useState<Opened>({})
  const dismissed = useMemo(() => new Set(Object.keys(opened)), [opened])

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
  const refresh = useCallback(() => triggerRefresh(), [triggerRefresh])
  const presenceRef = useRef<Presence>({ returnedAt: 0, leftAt: null })
  const openedRef = useRef(opened)
  useEffect(() => { openedRef.current = opened }, [opened])
  const fetchedAtRef = useRef(displayedData?.fetchedAt)
  useEffect(() => { fetchedAtRef.current = displayedData?.fetchedAt }, [displayedData?.fetchedAt])
  const refreshIntervalRef = useRef(prefs.refreshIntervalSeconds)
  useEffect(() => { refreshIntervalRef.current = prefs.refreshIntervalSeconds }, [prefs.refreshIntervalSeconds])
  const pokeTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // Fires a few extra scoped checks of `platforms` at fixed times after
  // return, purely so a lagging platform's card settles sooner than
  // waiting for the next periodic refresh — correctness doesn't depend on
  // this (see the comment above SETTLE_DELAY_PLATFORMS), so none of them
  // need to inspect what an earlier one found; all are scheduled upfront
  // rather than chained, so there's nothing to re-check before firing the
  // next one.
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
    const isHere = () => document.visibilityState === 'visible' && document.hasFocus()
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

        // Protect whichever currently-open games are on a known-lagging
        // platform BEFORE triggering anything — applies the same way
        // whichever refresh ends up firing below, full or scoped, so it
        // doesn't matter which branch this return happens to take.
        const openedLagged = Object.keys(openedRef.current)
          .filter(id => SETTLE_DELAY_PLATFORMS.includes(id.split(':')[0] as Platform))
        if (openedLagged.length > 0) {
          setOpened(prev => {
            const next = protectLaggingGames(prev, openedLagged, now + LAG_GRACE_MS)
            if (next !== prev) writeStoredOpened(next)
            return next
          })
          schedulePoke([...new Set(openedLagged.map(id => id.split(':')[0] as Platform))])
        }

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

  // Fresh server data (not cache loads) decides which opened games stay
  // dimmed — see resolveOpened/judge. protectUntil (set on return, above)
  // is what keeps a lagging platform's game from being misread here, so
  // this runs the same way for every fetch, full or scoped, with nothing
  // extra to coordinate.
  useEffect(() => {
    if (freshDataVersion === 0 || !displayedData) return
    setOpened(prev => {
      const next = resolveOpened(prev, displayedData.games, freshDataStartedAt, presenceRef.current, RETURN_GRACE_MS)
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
          onSave={text => { saveNote(promptGame.id, text); dismissNotePrompt(promptGame.id) }}
          onDelete={() => saveNote(promptGame.id, '')}
        />
      )}
    </div>
  )
}
