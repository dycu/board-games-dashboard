'use client'
import { useState } from 'react'
import { Game, PLATFORM_LABELS } from '@/lib/types'

interface Props {
  platform: string
  games: Game[]
  pins: string[]
  showDoneButton?: boolean
}

export default function PlatformGroup({ platform, games, pins, showDoneButton = true }: Props) {
  const [done, setDone] = useState(false)
  const platformGames = [...games].sort(
    (a, b) => Number(pins.includes(b.id)) - Number(pins.includes(a.id))
  )
  const platformUrl = platformGames[0]?.platformUrl ?? '#'

  return (
    <div className={`border-b border-slate-800 ${done ? 'opacity-40' : ''}`}>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          {showDoneButton && (
            <button
              onClick={() => setDone(d => !d)}
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs transition-colors
                ${done ? 'bg-green-500 border-green-500 text-white' : 'border-slate-600'}`}
              aria-label={`Mark ${platform} as done`}>
              {done ? '✓' : ''}
            </button>
          )}
          <span className="text-sm font-medium">{PLATFORM_LABELS[platform as keyof typeof PLATFORM_LABELS] ?? platform}</span>
          <span className="text-xs font-semibold bg-blue-800 text-blue-200 px-1.5 py-0.5 rounded-full">
            {games.length}
          </span>
        </div>
        <a
          href={platformUrl}
          className="text-xs bg-slate-800 text-slate-400 hover:bg-slate-700 px-2 py-1 rounded-md whitespace-nowrap">
          Open lobby →
        </a>
      </div>
      <ul className={`${showDoneButton ? 'pl-11' : 'pl-4'} pr-4 pb-2 flex flex-col gap-1`}>
        {platformGames.map(g => (
          <li key={g.id} className={`flex items-center justify-between ${done ? 'line-through' : ''}`}>
            <span className="text-xs text-slate-400 truncate max-w-[140px]">
              {pins.includes(g.id) ? '📌 ' : ''}{g.gameName}
            </span>
            <a
              href={g.gameUrl}
              className="text-xs text-blue-400 hover:underline ml-2 shrink-0">
              open
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
