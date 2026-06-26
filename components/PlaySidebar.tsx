'use client'
import { Game, PLATFORM_LABELS } from '@/lib/types'
import PlatformGroup from './PlatformGroup'

interface Props {
  games: Game[]
  pins: string[]
}

export default function PlaySidebar({ games, pins }: Props) {
  const myTurnGames = games.filter(g => g.myTurn)

  const byPlatform = myTurnGames.reduce<Record<string, Game[]>>((acc, g) => {
    acc[g.platform] = acc[g.platform] ?? []
    acc[g.platform].push(g)
    return acc
  }, {})

  const totalPending = myTurnGames.length

  return (
    <aside className="w-72 bg-slate-900 border-l border-slate-800 overflow-y-auto hidden lg:flex flex-col shrink-0">
      <div className="px-4 py-4 border-b border-slate-800">
        <h2 className="text-sm font-semibold">Play Session</h2>
        <p className="text-xs text-slate-500 mt-0.5">{totalPending} turns pending</p>
      </div>
      {Object.entries(byPlatform).map(([platform, platformGames]) => (
        <PlatformGroup
          key={platform}
          platform={platform}
          games={platformGames}
          pins={pins}
        />
      ))}
      {totalPending === 0 && (
        <p className="text-xs text-slate-500 text-center mt-8">No pending turns</p>
      )}
    </aside>
  )
}
