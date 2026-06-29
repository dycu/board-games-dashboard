'use client'
import { useEffect, useRef, useState } from 'react'
import { FinishedGame, FinishedGamesApiResponse, Platform } from '@/lib/types'

export type PlatformStatus =
  | { state: 'loading' }
  | { state: 'done'; count: number }
  | { state: 'error' }

export function useFinishedGamesData() {
  const [data, setData] = useState<FinishedGamesApiResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [lastError, setLastError] = useState<string | null>(null)
  const [platformStatuses, setPlatformStatuses] = useState<Partial<Record<Platform, PlatformStatus>>>({})
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    let allGames: FinishedGame[] = []
    let allErrors: FinishedGamesApiResponse['errors'] = []

    ;(async () => {
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
              setData({ games: sorted, errors: allErrors, fetchedAt: event.fetchedAt })
            }
          }
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
        setLastError(e instanceof Error ? e.message : 'Fetch failed')
      } finally {
        setIsLoading(false)
      }
    })()

    return () => {
      abortRef.current?.abort()
    }
  }, [])

  return { data, isLoading, lastError, platformStatuses }
}
