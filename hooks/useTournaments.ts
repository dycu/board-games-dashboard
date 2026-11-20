'use client'
import { useCallback, useEffect, useState } from 'react'
import { Tournament } from '@/lib/types'

export interface UseTournamentsResult {
  tournaments: Tournament[]
  isLoading: boolean
  error: string | null
  refresh: () => void
}

export function useTournaments(): UseTournamentsResult {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/tournaments')
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      setTournaments(data.tournaments ?? [])
      setError(data.error ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fetch failed')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount, same as useGamesData's initial runFetch
    load()
  }, [load])

  return { tournaments, isLoading, error, refresh: load }
}
