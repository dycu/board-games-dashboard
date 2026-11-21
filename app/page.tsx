'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGamesData } from '@/hooks/useGamesData'
import { usePrefs } from '@/hooks/usePrefs'
import { useNotes } from '@/hooks/useNotes'
import { isBackForwardNavigation } from '@/lib/navigation'
import { Platform } from '@/lib/types'
import { Presence, Opened, resolveOpened, readStoredOpened, writeStoredOpened, storeOpenedNow, nextNotePrompt, decideReturnRefresh, judge, RETURN_GRACE_MS, AWAY_REFRESH_MS } from '@/lib/dismissal'
import GameGrid from '@/components/GameGrid'
import FetchProgress from '@/components/FetchProgress'
import NewGamesPopup from '@/components/NewGamesPopup'
import NotePromptPopup from '@/components/NotePromptPopup'

// OBG, BoardTogether and Boardgamers.space all don't reflect a just-submitted
// move in their own data right away — a single delayed recheck wasn't enough
// for OBG; the lag is apparently variable, not a fixed couple of seconds, and
// still showed up even at the previous (shorter) retry schedule. So instead
// of one delayed refresh, this retries the platform-scoped check a few times
// with backoff, stopping as soon as the game(s) that were open actually show
// the move (myTurn false, or gone) — see verifyingRef/the freshDataVersion
// effect below. Cumulative: ~3s, 10s, 25s, 55s from the moment you return. If
// it's still not confirmed by then, the normal periodic refresh or a manual
// one will eventually catch it, same as before this existed. Every other
// platform refreshes immediately on return, as before — this delay is these
// three platforms' problem alone, not a reason to slow down sites that
// already report the move right away (the full-refresh path was never
// touched either way).
const SETTLE_DELAY_PLATFORMS: Platform[] = ['obg', 'boardtogether', 'boardgamers']
const PLATFORM_REFRESH_RETRY_DELAYS_MS = [3000, 7000, 15000, 30000]
// Once the backoff schedule above runs out still seeing myTurn (the lag
// outlasted ~55s), retries keep going at the last delay instead of just
// giving up — because giving up doesn't mean "wait for the normal
// refresh cycle" the way it sounds: the very next resolveOpened call (with
// nothing left in verifyingRef to exclude these ids) sees myTurn still true
// and judge() reads that as "nothing happened, un-dim it" — exactly as it
// should for a game glanced at and not played, but wrong here, and it
// un-dims the card back to looking like your move (confusingly, since you
// already made it) and quietly drops it from the opened/notePrompted
// pipeline, so the note-prompt popup never gets a chance to fire once the
// platform does eventually catch up. Bounding this by elapsed wall-clock
// time instead of attempt count means a slower platform just gets checked
// less often past the first minute, not abandoned.
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
  const pendingPlatformRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const verifyingRef = useRef<{ platforms: Platform[]; gameIds: string[]; attempt: number; startedAt: number } | null>(null)

  const scheduleVerify = useCallback((platforms: Platform[], attempt: number) => {
    // Clamped so an attempt index past the schedule's end (see LAG_GRACE_MS
    // above) just repeats the last, longest delay instead of reading undefined
    const delay = PLATFORM_REFRESH_RETRY_DELAYS_MS[Math.min(attempt, PLATFORM_REFRESH_RETRY_DELAYS_MS.length - 1)]
    pendingPlatformRefreshRef.current = setTimeout(() => {
      pendingPlatformRefreshRef.current = null
      triggerRefresh(true, platforms)
    }, delay)
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
        if (pendingPlatformRefreshRef.current) {
          clearTimeout(pendingPlatformRefreshRef.current)
          pendingPlatformRefreshRef.current = null
        }
        if (decision.kind === 'full') {
          // A full refresh's first pass can land before a lagging platform's
          // data catches up just as easily as a scoped one can — it was
          // only the 'platforms' branch below that set up verifyingRef, so
          // whenever the auto-refresh interval had already lapsed by the
          // time you got back (any move that takes longer than that
          // interval), this protection never applied at all: the full
          // refresh's result landed unprotected, judge() read a lingering
          // myTurn:true as "nothing happened", and un-dimmed the card.
          const openedLagged = Object.keys(openedRef.current)
            .filter(id => SETTLE_DELAY_PLATFORMS.includes(id.split(':')[0] as Platform))
          verifyingRef.current = openedLagged.length > 0
            ? { platforms: [...new Set(openedLagged.map(id => id.split(':')[0] as Platform))], gameIds: openedLagged, attempt: 0, startedAt: now }
            : null
          triggerRefresh(true)
        } else if (decision.kind === 'platforms') {
          const platforms = decision.platforms as Platform[]
          const delayed = platforms.filter(p => SETTLE_DELAY_PLATFORMS.includes(p))
          const immediate = platforms.filter(p => !SETTLE_DELAY_PLATFORMS.includes(p))
          if (immediate.length > 0) triggerRefresh(true, immediate)
          if (delayed.length > 0) {
            const gameIds = Object.keys(openedRef.current).filter(id => delayed.includes(id.split(':')[0] as Platform))
            verifyingRef.current = { platforms: delayed, gameIds, attempt: 0, startedAt: Date.now() }
            scheduleVerify(delayed, 0)
          } else {
            verifyingRef.current = null
          }
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
  }, [triggerRefresh, scheduleVerify])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after hydration
    setOpened(readStoredOpened())
  }, [])

  // Fresh server data (not cache loads) decides which opened games stay dimmed;
  // see resolveOpened. Games a return-refresh verification is actively
  // retrying are left out — see resolveOpened's own comment on `exclude`.
  useEffect(() => {
    if (freshDataVersion === 0 || !displayedData) return
    const verifying = verifyingRef.current
    const excluded = verifying && verifying.gameIds.length > 0 ? new Set(verifying.gameIds) : undefined
    setOpened(prev => {
      const next = resolveOpened(prev, displayedData.games, freshDataStartedAt, presenceRef.current, RETURN_GRACE_MS, excluded)
      if (next !== prev) writeStoredOpened(next)
      return next
    })
    // displayedData changes together with freshDataVersion
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshDataVersion, freshDataStartedAt])

  // Checks whatever the latest fetch (any fetch, not just the one this
  // scheduled) actually found for the game(s) a return-refresh was
  // verifying. Still myTurn -> retry with backoff, per
  // PLATFORM_REFRESH_RETRY_DELAYS_MS. Otherwise judge() these specific
  // games directly, bypassing resolveOpened's presentAt gate above — by the
  // time a retry lands, the user may well have glanced away again, which
  // would otherwise make that effect discard a perfectly good result and
  // leave the card stuck looking wrong until a manual refresh.
  useEffect(() => {
    const v = verifyingRef.current
    if (!v || freshDataVersion === 0 || !displayedData) return
    const byId = new Map(displayedData.games.map(g => [g.id, g]))
    const stillMyTurn = v.gameIds.some(id => byId.get(id)?.myTurn === true)

    if (stillMyTurn) {
      // Bounded by elapsed time, not attempt count — see LAG_GRACE_MS above
      if (Date.now() - v.startedAt >= LAG_GRACE_MS) { verifyingRef.current = null; return }
      const nextAttempt = v.attempt + 1
      verifyingRef.current = { ...v, attempt: nextAttempt }
      scheduleVerify(v.platforms, nextAttempt)
      return
    }

    verifyingRef.current = null
    setOpened(prev => {
      let changed = false
      const next = { ...prev }
      for (const id of v.gameIds) {
        const o = prev[id]
        if (!o) continue
        const kept = judge(o, byId.get(id), freshDataStartedAt, RETURN_GRACE_MS)
        if (kept !== o) {
          changed = true
          if (kept) next[id] = kept
          else delete next[id]
        }
      }
      if (changed) writeStoredOpened(next)
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshDataVersion])

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
