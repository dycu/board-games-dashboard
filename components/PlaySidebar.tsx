'use client'
import { useState } from 'react'
import { Game } from '@/lib/types'
import PlatformGroup from './PlatformGroup'

interface Props {
  games: Game[]
  pins: string[]
}

export default function PlaySidebar({ games, pins }: Props) {
  const [open, setOpen] = useState(false)
  const [waitingOpen, setWaitingOpen] = useState(false)
  const myTurnGames = games.filter(g => g.myTurn)
  const waitingGames = games.filter(g => !g.myTurn)
  const byPlatform = myTurnGames.reduce<Record<string, Game[]>>((acc, g) => {
    acc[g.platform] = acc[g.platform] ?? []
    acc[g.platform].push(g)
    return acc
  }, {})
  const byPlatformWaiting = waitingGames.reduce<Record<string, Game[]>>((acc, g) => {
    acc[g.platform] = acc[g.platform] ?? []
    acc[g.platform].push(g)
    return acc
  }, {})

  const content = (
    <>
      <div className="px-4 py-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Play Session</h2>
          <p className="text-xs text-slate-500 mt-0.5">{myTurnGames.length} turns pending</p>
        </div>
        <button onClick={() => setOpen(false)} className="lg:hidden text-slate-500 hover:text-white" aria-label="Close sidebar">✕</button>
      </div>
      {Object.entries(byPlatform).map(([platform, platformGames]) => (
        <PlatformGroup key={platform} platform={platform} games={platformGames} pins={pins} />
      ))}
      {myTurnGames.length === 0 && (
        <p className="text-xs text-slate-500 text-center mt-8">No pending turns</p>
      )}

      {waitingGames.length > 0 && (
        <div className="border-t border-slate-700 mt-2">
          <button
            onClick={() => setWaitingOpen(w => !w)}
            className="w-full flex items-center justify-between px-4 py-3 text-xs text-slate-500 hover:text-slate-300 transition-colors">
            <span>Waiting for others ({waitingGames.length})</span>
            <span>{waitingOpen ? '▲' : '▼'}</span>
          </button>
          {waitingOpen && Object.entries(byPlatformWaiting).map(([platform, platformGames]) => (
            <PlatformGroup key={platform} platform={platform} games={platformGames} pins={pins} showDoneButton={false} />
          ))}
        </div>
      )}
    </>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="w-72 bg-slate-900 border-l border-slate-800 overflow-y-auto hidden lg:flex flex-col shrink-0">
        {content}
      </aside>

      {/* Mobile floating button */}
      {myTurnGames.length > 0 && (
        <button
          onClick={() => setOpen(true)}
          className="lg:hidden fixed bottom-5 right-5 bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-full shadow-lg z-40"
          aria-label="Open play session">
          Play Session ({myTurnGames.length})
        </button>
      )}

      {/* Mobile bottom drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative bg-slate-900 rounded-t-2xl max-h-[75vh] overflow-y-auto flex flex-col">
            {content}
          </div>
        </div>
      )}
    </>
  )
}
