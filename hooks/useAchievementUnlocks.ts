'use client'
import { useEffect, useRef, useState } from 'react'
import { FinishedGame } from '@/lib/types'
import { Achievement } from '@/lib/achievements/store'
import { findNewlyUnlocked } from '@/lib/achievements/compute'

// Watches the finished-games list for goals that just crossed their
// target, persists them as achieved, and hands back the ones to
// celebrate right now — shared by the Achievements page and anywhere
// else that already has finished-games data loaded (History), so a goal
// gets caught whenever you happen to be looking at either, not just the
// one page that owns it. A ref (not just achievements' own achievedAt)
// guards against celebrating the same id twice in one page view — the
// optimistic update in useAchievements already prevents a true re-fire,
// but this is what stops a goal still in the "celebrating" list from
// being added to it again on the next finished-games refresh.
export function useAchievementUnlocks(
  achievements: Achievement[] | null,
  games: FinishedGame[] | null | undefined,
  markAchieved: (ids: string[]) => Promise<void>,
) {
  const [celebrating, setCelebrating] = useState<Achievement[]>([])
  const handled = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!achievements || !games) return
    const unlocked = findNewlyUnlocked(achievements, games).filter(a => !handled.current.has(a.id))
    if (unlocked.length === 0) return
    unlocked.forEach(a => handled.current.add(a.id))
    setCelebrating(prev => [...prev, ...unlocked])
    markAchieved(unlocked.map(a => a.id))
  }, [achievements, games, markAchieved])

  const dismiss = (id: string) => setCelebrating(prev => prev.filter(a => a.id !== id))

  return { celebrating, dismiss }
}
