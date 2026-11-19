'use client'
import { useCallback, useEffect, useState } from 'react'
import { Platform } from '@/lib/types'
import { Achievement } from '@/lib/achievements/store'

async function fetchAchievements(): Promise<Achievement[]> {
  const res = await fetch('/api/achievements')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `Server error ${res.status}`)
  return json.achievements
}

export function useAchievements() {
  const [achievements, setAchievements] = useState<Achievement[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => fetchAchievements()
    .then(data => { setAchievements(data); setError(null) })
    .catch(e => setError(e instanceof Error ? e.message : 'Failed to load achievements')), [])

  useEffect(() => { load() }, [load])

  const create = useCallback(async (goal: { platform: Platform | null; gameType: string; metric: 'played' | 'won'; target: number }) => {
    const res = await fetch('/api/achievements', {
      method: 'POST',
      body: JSON.stringify(goal),
      headers: { 'Content-Type': 'application/json' },
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? `Server error ${res.status}`)
    setAchievements(prev => [...(prev ?? []), json.achievement])
  }, [])

  const remove = useCallback(async (id: string) => {
    setAchievements(prev => prev?.filter(a => a.id !== id) ?? null)
    await fetch('/api/achievements', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
      headers: { 'Content-Type': 'application/json' },
    })
  }, [])

  // Marks the given ids achieved, both here and on the server — called
  // once per newly-crossed goal, from useAchievementUnlocks below.
  const markAchieved = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    const now = new Date().toISOString()
    setAchievements(prev => prev?.map(a => ids.includes(a.id) ? { ...a, achievedAt: a.achievedAt ?? now } : a) ?? null)
    await fetch('/api/achievements', {
      method: 'PATCH',
      body: JSON.stringify({ ids }),
      headers: { 'Content-Type': 'application/json' },
    })
  }, [])

  return { achievements, error, create, remove, markAchieved, reload: load }
}
