'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGamesData } from '@/hooks/useGamesData'
import { usePrefs } from '@/hooks/usePrefs'
import { useNotes } from '@/hooks/useNotes'
import { isBackForwardNavigation } from '@/lib/navigation'
import { Platform } from '@/lib/types'
import { Presence, Opened, resolveOpened, readStoredOpened, writeStoredOpened, storeOpenedNow, nextNotePrompt, decideReturnRefresh, AWAY_REFRESH_MS } from '@/lib/dismissal'
import GameGrid from '@/components/GameGrid'
import FetchProgress from '@/components/FetchProgress'
import NewGamesPopup from '@/components/NewGamesPopup'
import NotePromptPopup from '@/components/NotePromptPopup'

// Some sites (OBG, confirmed) don't reflect a just-submitted move in their
// own data immediately — fetching right on return can still see the old
// "my turn" state, which un-dims the card as if the move never registered
// (see judge() in lib/dismissal.ts: a fetch after opening that still shows
// myTurn just drops the dimming, since from its own perspective nothing was
// confirmed). This delay before the platform-scoped refresh gives that lag
// room to settle first; the full-refresh path is left alone since it isn't
// specifically verifying a just-made move.
const PLATFORM_REFRESH_DELAY_MS = 3000

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
  const pendingPlatformRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
        if (pendingPlatformRefreshRef.current) {
          clearTimeout(pendingPlatformRefreshRef.current)
          pendingPlatformRefreshRef.current = null
        }
        if (decision.kind === 'full') {
          triggerRefresh(true)
        } else if (decision.kind === 'platforms') {
          const platforms = decision.platforms as Platform[]
          pendingPlatformRefreshRef.current = setTimeout(() => {
            pendingPlatformRefreshRef.current = null
            triggerRefresh(true, platforms)
          }, PLATFORM_REFRESH_DELAY_MS)
        }
      }
    }
    const events = ['focus', 'blur', 'pageshow', 'pagehide'] as const
    events.forEach(e => window.addEventListener(e, onChange))
    document.addEventListener('visibilitychange', onChange)
    return () => {
      events.forEach(e => window.removeEventListener(e, onChange))
      document.removeEventListener('visibilitychange', onChange)
      if (pendingPlatformRefreshRef.current) clearTimeout(pendingPlatformRefreshRef.current)
    }
  }, [triggerRefresh])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after hydration
    setOpened(readStoredOpened())
  }, [])

  // Fresh server data (not cache loads) decides which opened games stay dimmed;
  // see resolveOpened
  useEffect(() => {
    if (freshDataVersion === 0 || !displayedData) return
    setOpened(prev => {
      const next = resolveOpened(prev, displayedData.games, freshDataStartedAt, presenceRef.current)
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
              className="text-xs bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb] px-3 py-1.5 rounded-md"
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
