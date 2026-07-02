'use client'
import { useEffect, useState } from 'react'
import { UserPrefs, DEFAULT_PREFS } from '@/lib/types'
import { useGamesData } from '@/hooks/useGamesData'
import GameGrid from '@/components/GameGrid'
import FetchProgress from '@/components/FetchProgress'
import PendingUpdateBanner from '@/components/PendingUpdateBanner'

const DISMISSED_KEY = 'dismissed-games'

export default function DashboardPage() {
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const {
    displayedData,
    pendingData,
    isRefreshing,
    lastError,
    platformStatuses,
    freshDataVersion,
    triggerRefresh,
    applyPendingData,
    cachedAt,
  } = useGamesData()

  useEffect(() => {
    const stored = localStorage.getItem(DISMISSED_KEY)
    setDismissed(stored ? new Set(JSON.parse(stored)) : new Set())
    fetch('/api/prefs').then(r => r.json()).then(setPrefs).catch(() => {})
  }, [])

  // When fresh server data is applied to the display, clear all dismissed state
  // so the dashboard reflects exactly what the services report. Cache loads do
  // not clear dismissed state — only real server responses do.
  useEffect(() => {
    if (freshDataVersion === 0) return
    setDismissed(new Set())
    localStorage.removeItem(DISMISSED_KEY)
  }, [freshDataVersion])

  const handleDismiss = (id: string) => {
    setDismissed(prev => {
      const next = new Set(prev)
      next.add(id)
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]))
      return next
    })
  }

  const showFullProgress = !displayedData && isRefreshing
  const showCompactProgress = !!displayedData && isRefreshing

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {showCompactProgress && (
        <FetchProgress platformStatuses={platformStatuses} compact />
      )}
      {pendingData && (
        <PendingUpdateBanner pendingData={pendingData} onApply={applyPendingData} />
      )}
      {showFullProgress ? (
        <FetchProgress platformStatuses={platformStatuses} />
      ) : displayedData ? (
        <GameGrid
          data={displayedData}
          prefs={prefs}
          onPrefsChange={setPrefs}
          dismissed={dismissed}
          onDismiss={handleDismiss}
          onRefresh={triggerRefresh}
          isRefreshing={isRefreshing}
          lastError={lastError}
          cachedAt={cachedAt}
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
