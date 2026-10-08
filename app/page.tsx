'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { UserPrefs, DEFAULT_PREFS } from '@/lib/types'
import { useGamesData } from '@/hooks/useGamesData'
import { isBackForwardNavigation } from '@/lib/navigation'
import { Presence, fetchSeesReturn, AWAY_REFRESH_MS } from '@/lib/dismissal'
import GameGrid from '@/components/GameGrid'
import FetchProgress from '@/components/FetchProgress'

const DISMISSED_KEY = 'dismissed-games'
const PREFS_KEY = 'user-prefs'

export default function DashboardPage() {
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const isInitialFetchRef = useRef(true)
  // Only a genuine browser Back/Forward navigation (e.g. returning from a BGA
  // game opened in this tab) should preserve dismissed state through
  // the page's first fetch. Any other load — fresh navigate, reload, or a
  // tablet reopening a tab the OS discarded in the background — is a real
  // new check-in and should clear stale state right away.
  const preserveThroughInitialFetchRef = useRef(false)
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
  const refresh = useCallback(() => triggerRefresh(), [triggerRefresh])
  const presenceRef = useRef<Presence>({ returnedAt: 0, leftAt: null })

  // Opening a game takes the user away from this tab (BGA in this tab, others
  // in a new one). Track when they leave and come back, and refresh as soon as
  // they're back so the hidden game shows its state after their move.
  useEffect(() => {
    const isHere = () => document.visibilityState === 'visible' && document.hasFocus()
    // returnedAt stays 0 on load, so the first fetch (already started) counts
    if (!isHere()) presenceRef.current = { returnedAt: 0, leftAt: Date.now() }
    const onChange = () => {
      const p = presenceRef.current
      const now = Date.now()
      if (!isHere()) {
        if (p.leftAt === null) presenceRef.current = { ...p, leftAt: now }
      } else if (p.leftAt !== null) {
        const awayFor = now - p.leftAt
        presenceRef.current = { returnedAt: now, leftAt: null }
        // The running fetch (if any) began while away, so restart it
        if (awayFor >= AWAY_REFRESH_MS) triggerRefresh(true)
      }
    }
    const events = ['focus', 'blur', 'pageshow', 'pagehide'] as const
    events.forEach(e => window.addEventListener(e, onChange))
    document.addEventListener('visibilitychange', onChange)
    return () => {
      events.forEach(e => window.removeEventListener(e, onChange))
      document.removeEventListener('visibilitychange', onChange)
    }
  }, [triggerRefresh])

  useEffect(() => {
    preserveThroughInitialFetchRef.current = isBackForwardNavigation()
    const stored = localStorage.getItem(DISMISSED_KEY)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after hydration
    setDismissed(stored ? new Set(JSON.parse(stored)) : new Set())
    const cachedPrefs = localStorage.getItem(PREFS_KEY)
    if (cachedPrefs) setPrefs(JSON.parse(cachedPrefs))
    fetch('/api/prefs').then(r => r.json()).then(p => {
      setPrefs(p)
      localStorage.setItem(PREFS_KEY, JSON.stringify(p))
    }).catch(() => {})
  }, [])

  // When fresh server data is applied to the display, clear all dismissed state
  // so the dashboard reflects exactly what the services report. Cache loads do
  // not clear dismissed state — only real server responses do, and only ones
  // fetched while the user was here: data fetched while they were away playing
  // predates their move and would bring the game straight back. Also kept
  // through this page's first fetch after a back/forward navigation, so
  // returning from a game you just finished doesn't immediately un-hide it.
  useEffect(() => {
    if (freshDataVersion === 0) return
    const skipClear = (isInitialFetchRef.current && preserveThroughInitialFetchRef.current)
      || !fetchSeesReturn(freshDataStartedAt, presenceRef.current)
    if (!skipClear) {
      setDismissed(new Set())
      localStorage.removeItem(DISMISSED_KEY)
    }
    isInitialFetchRef.current = false
  }, [freshDataVersion, freshDataStartedAt])

  // An opened game is hidden until the next real refresh shows its actual state
  const handleOpen = (id: string) => {
    setDismissed(prev => {
      const next = new Set(prev)
      next.add(id)
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]))
      return next
    })
  }

  const updatePrefs = (p: UserPrefs) => {
    setPrefs(p)
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  }

  const hasFreshData = freshDataVersion > 0
  const showFullProgress = !displayedData && isRefreshing
  const showCompactProgress = !!displayedData && isRefreshing

  return (
    <div className="flex flex-col h-screen overflow-hidden">
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
    </div>
  )
}
