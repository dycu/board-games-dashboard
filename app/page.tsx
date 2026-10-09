'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { UserPrefs, DEFAULT_PREFS } from '@/lib/types'
import { useGamesData } from '@/hooks/useGamesData'
import { isBackForwardNavigation } from '@/lib/navigation'
import { Presence, openedAfterFetch, AWAY_REFRESH_MS } from '@/lib/dismissal'
import GameGrid from '@/components/GameGrid'
import FetchProgress from '@/components/FetchProgress'
import NewGamesPopup from '@/components/NewGamesPopup'

const DISMISSED_KEY = 'dismissed-games'
const PREFS_KEY = 'user-prefs'

export default function DashboardPage() {
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
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

  // Fresh server data (not cache loads) decides which opened games stay dimmed;
  // see openedAfterFetch
  useEffect(() => {
    if (freshDataVersion === 0 || !displayedData) return
    setDismissed(prev => {
      const next = openedAfterFetch(prev, displayedData.games, freshDataStartedAt, presenceRef.current)
      if (next.size === prev.size) return prev
      if (next.size === 0) localStorage.removeItem(DISMISSED_KEY)
      else localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]))
      return next
    })
    // displayedData changes together with freshDataVersion
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshDataVersion, freshDataStartedAt])

  // An opened game is dimmed (and skipped by Next) until the next real refresh shows its actual state
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
