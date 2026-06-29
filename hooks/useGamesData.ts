'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Game, GamesApiResponse, Platform } from '@/lib/types'

const CACHE_KEY = 'games-cache'

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
  pendingData: GamesApiResponse | null
  isRefreshing: boolean
  lastError: string | null
  platformStatuses: Partial<Record<Platform, PlatformStatus>>
  hasCache: boolean
  cachedAt: string | null
  triggerRefresh: () => void
  applyPendingData: () => void
}

export function useGamesData(): UseGamesDataResult {
  const [displayedData, setDisplayedData] = useState<GamesApiResponse | null>(null)
  const [pendingData, setPendingData] = useState<GamesApiResponse | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [platformStatuses, setPlatformStatuses] = useState<Partial<Record<Platform, PlatformStatus>>>({})
  const [hasCache, setHasCache] = useState(false)
  const [cachedAt, setCachedAt] = useState<string | null>(null)

  const fetchingRef = useRef(false)
  // true once displayedData has been shown (from cache or first fetch) — routes
  // subsequent fetch completions to pendingData instead of displayedData.
  const hasDisplayedRef = useRef(false)
  const isManualRefreshRef = useRef(false)
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
            }
            const newCachedAt = writeCache(freshData)
            setCachedAt(newCachedAt)
            if (isManualRefreshRef.current || !hasDisplayedRef.current) {
              setDisplayedData(freshData)
              hasDisplayedRef.current = true
              isManualRefreshRef.current = false
            } else {
              setPendingData(freshData)
            }
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
      setHasCache(true)
      setCachedAt(cached.cachedAt)
      hasDisplayedRef.current = true
    }
    runFetch()
    return () => {
      abortRef.current?.abort()
      fetchingRef.current = false
    }
  }, [runFetch])

  const triggerRefresh = useCallback(() => {
    isManualRefreshRef.current = true
    runFetch()
  }, [runFetch])

  const applyPendingData = useCallback(() => {
    setPendingData(prev => {
      if (prev) setDisplayedData(prev)
      return null
    })
    setLastError(null)
  }, [])

  return {
    displayedData,
    pendingData,
    isRefreshing,
    lastError,
    platformStatuses,
    hasCache,
    cachedAt,
    triggerRefresh,
    applyPendingData,
  }
}
