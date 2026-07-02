'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Game, GamesApiResponse, Platform } from '@/lib/types'

const CACHE_KEY = 'games-cache'

export interface DepartedGame {
  id: string
  gameName: string
  platform: Platform
  gameUrl: string
}

export function computeDeparted(
  prev: Game[],
  next: Game[],
  errors: { platform: Platform; error: string }[]
): DepartedGame[] {
  const nextIds = new Set(next.map(g => g.id))
  const errorPlatforms = new Set(errors.map(e => e.platform))
  return prev
    .filter(g => !nextIds.has(g.id) && !errorPlatforms.has(g.platform))
    .map(g => ({ id: g.id, gameName: g.gameName, platform: g.platform, gameUrl: g.gameUrl }))
}

export type PlatformStatus =
  | { state: 'loading' }
  | { state: 'done'; count: number }
  | { state: 'error' }

interface StoredGame extends Omit<Game, 'lastMoveAt'> {
  lastMoveAt: string
}

interface GamesCache {
  data: {
    games: StoredGame[]
    errors: GamesApiResponse['errors']
    fetchedAt: string
  }
  cachedAt: string
}

function readCache(): { data: GamesApiResponse; cachedAt: string } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached: GamesCache = JSON.parse(raw)
    return {
      data: {
        ...cached.data,
        games: cached.data.games.map(g => ({ ...g, lastMoveAt: new Date(g.lastMoveAt) })),
      },
      cachedAt: cached.cachedAt,
    }
  } catch {
    return null
  }
}

function writeCache(data: GamesApiResponse): string {
  const cachedAt = new Date().toISOString()
  try {
    const cache: GamesCache = {
      data: {
        ...data,
        games: data.games.map(g => ({ ...g, lastMoveAt: g.lastMoveAt.toISOString() })),
      },
      cachedAt,
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // ignore storage errors
  }
  return cachedAt
}

export interface UseGamesDataResult {
  displayedData: GamesApiResponse | null
  isRefreshing: boolean
  lastError: string | null
  platformStatuses: Partial<Record<Platform, PlatformStatus>>
  cachedAt: string | null
  freshDataVersion: number
  triggerRefresh: () => void
}

export function useGamesData(): UseGamesDataResult {
  const [displayedData, setDisplayedData] = useState<GamesApiResponse | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [platformStatuses, setPlatformStatuses] = useState<Partial<Record<Platform, PlatformStatus>>>({})
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const [freshDataVersion, setFreshDataVersion] = useState(0)

  const fetchingRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  const runFetch = useCallback(async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsRefreshing(true)
    setLastError(null)

    let allGames: Game[] = []
    let allErrors: GamesApiResponse['errors'] = []
    let allPlatforms: Platform[] = []

    try {
      const res = await fetch('/api/games', { signal: controller.signal })
      if (!res.ok) throw new Error(`Server error ${res.status}`)

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let receivedDone = false

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
            allPlatforms = event.platforms
            setPlatformStatuses(
              Object.fromEntries(event.platforms.map((p: Platform) => [p, { state: 'loading' }]))
            )
          } else if (event.type === 'platform') {
            if (event.error) {
              allErrors.push({ platform: event.platform, error: event.error })
              setPlatformStatuses(prev => ({ ...prev, [event.platform]: { state: 'error' } }))
            } else {
              const games: Game[] = (event.games as any[]).map(g => ({
                ...g,
                lastMoveAt: new Date(g.lastMoveAt),
              }))
              allGames = [...allGames, ...games]
              setPlatformStatuses(prev => ({
                ...prev,
                [event.platform]: { state: 'done', count: event.games.length },
              }))
            }
          } else if (event.type === 'done') {
            receivedDone = true
            const freshData: GamesApiResponse = {
              games: allGames,
              errors: allErrors,
              fetchedAt: event.fetchedAt,
              platforms: allPlatforms,
            }
            const newCachedAt = writeCache(freshData)
            setCachedAt(newCachedAt)
            setDisplayedData(freshData)
            setFreshDataVersion(v => v + 1)
          }
        }
      }

      if (!receivedDone) throw new Error('Stream ended without completing')
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      setLastError(e instanceof Error ? e.message : 'Fetch failed')
    } finally {
      setIsRefreshing(false)
      fetchingRef.current = false
    }
  }, [])

  useEffect(() => {
    const cached = readCache()
    if (cached) {
      setDisplayedData(cached.data)
      setCachedAt(cached.cachedAt)
    }
    runFetch()
    return () => {
      abortRef.current?.abort()
      fetchingRef.current = false
    }
  }, [runFetch])

  const triggerRefresh = useCallback(() => {
    runFetch()
  }, [runFetch])

  return {
    displayedData,
    isRefreshing,
    lastError,
    platformStatuses,
    cachedAt,
    freshDataVersion,
    triggerRefresh,
  }
}
