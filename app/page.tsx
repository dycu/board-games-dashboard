'use client'
import { useEffect, useState } from 'react'
import { Game, GamesApiResponse, Platform, UserPrefs, DEFAULT_PREFS, PLATFORM_LABELS } from '@/lib/types'
import GameGrid from '@/components/GameGrid'
import PlaySidebar from '@/components/PlaySidebar'

const DISMISSED_KEY = 'dismissed-games'

type PlatformStatus =
  | { state: 'loading' }
  | { state: 'done'; count: number }
  | { state: 'error' }

export default function DashboardPage() {
  const [data, setData] = useState<GamesApiResponse | null>(null)
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [expectedPlatforms, setExpectedPlatforms] = useState<Platform[]>([])
  const [platformStatuses, setPlatformStatuses] = useState<Partial<Record<Platform, PlatformStatus>>>({})

  useEffect(() => {
    const stored = localStorage.getItem(DISMISSED_KEY)
    const initial: Set<string> = stored ? new Set(JSON.parse(stored)) : new Set()
    setDismissed(initial)

    fetch('/api/prefs').then(r => r.json()).then(setPrefs).catch(() => {})

    let allGames: Game[] = []
    let allErrors: GamesApiResponse['errors'] = []

    fetch('/api/games').then(async res => {
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''

        for (const chunk of chunks) {
          if (!chunk.startsWith('data: ')) continue
          let event: any
          try { event = JSON.parse(chunk.slice(6)) } catch { continue }

          if (event.type === 'start') {
            if (event.platforms.length === 0) {
              window.location.href = '/setup'
              return
            }
            setExpectedPlatforms(event.platforms)
            setPlatformStatuses(
              Object.fromEntries(event.platforms.map((p: Platform) => [p, { state: 'loading' }]))
            )
          } else if (event.type === 'platform') {
            if (event.error) {
              allErrors.push({ platform: event.platform, error: event.error })
              setPlatformStatuses(prev => ({ ...prev, [event.platform]: { state: 'error' } }))
            } else {
              const games: Game[] = (event.games as any[]).map(g => ({ ...g, lastMoveAt: new Date(g.lastMoveAt) }))
              allGames = [...allGames, ...games]
              setPlatformStatuses(prev => ({ ...prev, [event.platform]: { state: 'done', count: event.games.length } }))
            }
          } else if (event.type === 'done') {
            const activeIds = new Set(allGames.map(g => g.id))
            const pruned = new Set([...initial].filter(id => !activeIds.has(id)))
            localStorage.setItem(DISMISSED_KEY, JSON.stringify([...pruned]))
            setDismissed(pruned)
            setData({ games: allGames, errors: allErrors, fetchedAt: event.fetchedAt })
            setLoading(false)
          }
        }
      }
    }).catch(() => setLoading(false))
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
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="text-slate-300 text-sm">Fetching your games…</div>
          {expectedPlatforms.length > 0 && (
            <div className="flex flex-col gap-2 text-sm">
              {expectedPlatforms.map(p => {
                const status = platformStatuses[p]
                const state = status?.state ?? 'loading'
                return (
                  <div
                    key={p}
                    className={`flex items-center gap-2 ${state === 'loading' ? 'animate-pulse' : ''}`}
                  >
                    <span className={
                      state === 'done' ? 'text-green-400 w-4 text-center' :
                      state === 'error' ? 'text-red-400 w-4 text-center' :
                      'text-slate-500 w-4 text-center'
                    }>
                      {state === 'done' ? '✓' : state === 'error' ? '✗' : '⟳'}
                    </span>
                    <span className={state === 'loading' ? 'text-slate-500' : 'text-slate-300'}>
                      {PLATFORM_LABELS[p]}
                    </span>
                    <span className="text-slate-600 text-xs">
                      {state === 'done' && `— ${(status as { state: 'done'; count: number }).count} games`}
                      {state === 'error' && '— failed'}
                      {state === 'loading' && '— loading…'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="flex h-screen overflow-hidden">
      <GameGrid data={data} prefs={prefs} onPrefsChange={setPrefs} dismissed={dismissed} onDismiss={handleDismiss} />
      <PlaySidebar games={data.games.filter(g => !dismissed.has(g.id))} pins={prefs.pins} />
    </div>
  )
}
