'use client'
import { useEffect, useState } from 'react'
import { GamesApiResponse, UserPrefs, DEFAULT_PREFS } from '@/lib/types'
import GameGrid from '@/components/GameGrid'
import PlaySidebar from '@/components/PlaySidebar'

export default function DashboardPage() {
  const [data, setData] = useState<GamesApiResponse | null>(null)
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/games').then(r => r.json()),
      fetch('/api/prefs').then(r => r.json()),
    ]).then(([gamesData, prefsData]) => {
      setData({
        ...gamesData,
        games: (gamesData.games ?? []).map((g: any) => ({ ...g, lastMoveAt: new Date(g.lastMoveAt) })),
      })
      setPrefs(prefsData)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center flex-col gap-3">
        <div className="text-slate-400 text-sm animate-pulse">Fetching your games…</div>
        <div className="text-xs text-slate-600">Checking all 7 platforms in parallel</div>
      </div>
    )
  }

  if (!data) return null

  const allMissingCreds = data.errors.length === 7
  if (allMissingCreds) {
    window.location.href = '/setup'
    return null
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <GameGrid data={data} prefs={prefs} onPrefsChange={setPrefs} />
      <PlaySidebar games={data.games} pins={prefs.pins} />
    </div>
  )
}
