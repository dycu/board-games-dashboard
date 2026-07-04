'use client'
import { useEffect, useState } from 'react'
import { UserPrefs, DEFAULT_PREFS } from '@/lib/types'
import { useGamesData } from '@/hooks/useGamesData'
import GameGrid from '@/components/GameGrid'
import FetchProgress from '@/components/FetchProgress'

const DISMISSED_KEY = 'dismissed-games'
const OPENED_KEY = 'opened-games'
const PREFS_KEY = 'user-prefs'

export default function DashboardPage() {
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [opened, setOpened] = useState<Set<string>>(new Set())
  const {
    displayedData,
    isRefreshing,
    lastError,
    platformStatuses,
    freshDataVersion,
    triggerRefresh,
    cachedAt,
    departedGames,
  } = useGamesData()

  useEffect(() => {
    const stored = localStorage.getItem(DISMISSED_KEY)
    setDismissed(stored ? new Set(JSON.parse(stored)) : new Set())
    const storedOpened = sessionStorage.getItem(OPENED_KEY)
    setOpened(storedOpened ? new Set(JSON.parse(storedOpened)) : new Set())
    const cachedPrefs = localStorage.getItem(PREFS_KEY)
    if (cachedPrefs) setPrefs(JSON.parse(cachedPrefs))
    fetch('/api/prefs').then(r => r.json()).then(p => {
      setPrefs(p)
      localStorage.setItem(PREFS_KEY, JSON.stringify(p))
    }).catch(() => {})
  }, [])

  // When fresh server data is applied to the display, clear all dismissed state
  // so the dashboard reflects exactly what the services report. Cache loads do
  // not clear dismissed state — only real server responses do.
  //
  // TEMPORARY TEST (2026-07-04): clears on every real fetch, including the
  // page's first one, to check whether dismissed/opened games reappearing
  // right after BGA back-navigation is still an actual problem. See if this
  // regresses before deciding on a permanent (e.g. grace-period) fix.
  useEffect(() => {
    if (freshDataVersion === 0) return
    setDismissed(new Set())
    localStorage.removeItem(DISMISSED_KEY)
    setOpened(new Set())
    sessionStorage.removeItem(OPENED_KEY)
  }, [freshDataVersion])

  const handleOpen = (id: string) => {
    setOpened(prev => {
      const next = new Set(prev)
      next.add(id)
      sessionStorage.setItem(OPENED_KEY, JSON.stringify([...next]))
      return next
    })
  }

  const handleDismiss = (id: string) => {
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
          onDismiss={handleDismiss}
          onRefresh={triggerRefresh}
          isRefreshing={isRefreshing}
          lastError={lastError}
          cachedAt={cachedAt}
          opened={opened}
          onOpen={handleOpen}
          departedGames={departedGames}
        />
      ) : lastError ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-500 mb-3">Failed to load games</p>
            <button
              onClick={triggerRefresh}
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
