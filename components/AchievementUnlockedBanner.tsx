'use client'
import { Achievement } from '@/lib/achievements/store'
import { achievementLabel } from '@/lib/achievements/compute'

// Deliberately not a toast — those are easy to miss and easy to dismiss by
// accident. One bold, colorful, static card per goal just unlocked, right
// at the top of whichever page caught it (Achievements, History), staying
// until you dismiss it on purpose.
export default function AchievementUnlockedBanner({ achievements, onDismiss }: {
  achievements: Achievement[]
  onDismiss: (id: string) => void
}) {
  if (achievements.length === 0) return null
  return (
    <div className="flex flex-col gap-2 mb-4">
      {achievements.map(a => (
        <div
          key={a.id}
          className="flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50 shadow-sm"
        >
          <span className="text-2xl shrink-0">🎉</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-amber-900">Achievement unlocked!</div>
            <div className="text-sm text-amber-800 truncate">{achievementLabel(a)}</div>
          </div>
          <button
            onClick={() => onDismiss(a.id)}
            aria-label="Dismiss"
            className="shrink-0 text-amber-700 hover:text-amber-900 text-sm px-2 py-1"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
