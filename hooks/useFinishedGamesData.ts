'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FinishedGame, FinishedGamesApiResponse, Platform } from '@/lib/types'

export type PlatformStatus =
  | { state: 'loading' }
  | { state: 'done'; count: number }
  | { state: 'error' }

// Like the Active page: the last fetched history shows at once and the
// fetch refreshes it in the background
const CACHE_KEY = 'finished-games-cache'

type Stored = Omit<FinishedGamesApiResponse, 'games'> & { games: (Omit<FinishedGame, 'completedAt'> & { completedAt: string })[] }

function readCache(): FinishedGamesApiResponse | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const stored: Stored = JSON.parse(raw)
    return { ...stored, games: stored.games.map(g => ({ ...g, completedAt: new Date(g.completedAt) })) }
  } catch {
    return null
  }
}

function writeCache(data: FinishedGamesApiResponse) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch {
    // storage full or unavailable — the page still works, just without a cache
  }
}

export function useFinishedGamesData() {
  const [data, setData] = useState<FinishedGamesApiResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [lastError, setLastError] = useState<string | null>(null)
  const [platformStatuses, setPlatformStatuses] = useState<Partial<Record<Platform, PlatformStatus>>>({})
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setIsLoading(true)
    setLastError(null)

    let allGames: FinishedGame[] = []
    const allErrors: FinishedGamesApiResponse['errors'] = []

    try {
      const res = await fetch('/api/finished-games', { signal: controller.signal })
      if (!res.ok) throw new Error(`Server error ${res.status}`)

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
            setPlatformStatuses(
              Object.fromEntries(event.platforms.map((p: Platform) => [p, { state: 'loading' }]))
            )
          } else if (event.type === 'platform') {
            if (event.error) {
              allErrors.push({ platform: event.platform, error: event.error })
              setPlatformStatuses(prev => ({ ...prev, [event.platform]: { state: 'error' } }))
            } else {
              const games: FinishedGame[] = (event.games as any[]).map(g => ({
                ...g,
                completedAt: new Date(g.completedAt),
              }))
              allGames = [...allGames, ...games]
              setPlatformStatuses(prev => ({
                ...prev,
                [event.platform]: { state: 'done', count: event.games.length },
              }))
            }
          } else if (event.type === 'done') {
            const sorted = [...allGames].sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
            const fresh = { games: sorted, errors: allErrors, fetchedAt: event.fetchedAt }
            setData(fresh)
            writeCache(fresh)
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      setLastError(e instanceof Error ? e.message : 'Fetch failed')
    } finally {
      if (abortRef.current === controller) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const cached = readCache()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after hydration
    if (cached) setData(cached)
    load()
    return () => { abortRef.current?.abort() }
  }, [load])

  return { data, isLoading, lastError, platformStatuses, refresh: load }
}
