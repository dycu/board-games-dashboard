'use client'
import { useEffect, useState } from 'react'
import { PlayTotal } from '@/lib/backlog/played'

export type BgaPlayTotals = { totals: PlayTotal[] } | { error: string } | null

// BGA's own lifetime play counts; finished-games history only holds its latest 50
export function useBgaPlayTotals(): BgaPlayTotals {
  const [state, setState] = useState<BgaPlayTotals>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/backlog/bga-plays')
      .then(r => r.json())
      .then(json => { if (!cancelled) setState(json.error ? { error: json.error } : { totals: json.totals }) })
      .catch(e => { if (!cancelled) setState({ error: String(e) }) })
    return () => { cancelled = true }
  }, [])
  return state
}

export function totalsOf(state: BgaPlayTotals): PlayTotal[] {
  return state && 'totals' in state ? state.totals : []
}
