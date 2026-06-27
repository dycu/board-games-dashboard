'use client'
import { useEffect, useState } from 'react'
import { GamesApiResponse, UserPrefs, DEFAULT_PREFS } from '@/lib/types'
import GameGrid from '@/components/GameGrid'
import PlaySidebar from '@/components/PlaySidebar'

const DISMISSED_KEY = 'dismissed-games'

export default function DashboardPage() {
  const [data, setData] = useState<GamesApiResponse | null>(null)
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    const stored = localStorage.getItem(DISMISSED_KEY)
    const initial: Set<string> = stored ? new Set(JSON.parse(stored)) : new Set()

    Promise.all([
      fetch('/api/games').then(r => r.json()),
      fetch('/api/prefs').then(r => r.json()),
    ]).then(([gamesData, prefsData]) => {
      const games = gamesData.games ?? []
      const activeIds = new Set(games.map((g: any) => g.id as string))
      // If a dismissed game is still active, it reappears (user was premature)
      const pruned = new Set([...initial].filter(id => !activeIds.has(id)))
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...pruned]))
      setDismissed(pruned)
      setData({
        ...gamesData,
        games: games.map((g: any) => ({ ...g, lastMoveAt: new Date(g.lastMoveAt) })),
      })
      setPrefs(prefsData)
      setLoading(false)
    })
  }, [])

  const handleDismiss = (id: string) => {
    setDismissed(prev => {
      const next = new Set(prev)
      next.add(id)
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]))
      return next
    })
  }

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
      <GameGrid data={data} prefs={prefs} onPrefsChange={setPrefs} dismissed={dismissed} onDismiss={handleDismiss} />
      <PlaySidebar games={data.games} pins={prefs.pins} />
    </div>
  )
}
