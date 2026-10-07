'use client'
import { useState } from 'react'
import { PLATFORM_LABELS } from '@/lib/types'
import { PlayedGame } from '@/lib/backlog/played'
import { formatTimeAgo } from '@/lib/connectors/utils'

const ACCENT = '#5e6ad2'
const TOP_N = 15

function summary(g: PlayedGame): string {
  return [
    `${g.plays} ${g.plays === 1 ? 'play' : 'plays'}`,
    g.lastPlayedAt && `last ${formatTimeAgo(g.lastPlayedAt)}`,
    g.playingNow > 0 && `${g.playingNow} running`,
  ].filter(Boolean).join(' · ')
}

// Finished plays per game, most played first. One measure, so one color and no
// legend; the site is part of each label.
export default function PlayCountChart({ games }: { games: PlayedGame[] }) {
  const [showAll, setShowAll] = useState(false)
  const [hover, setHover] = useState<string | null>(null)

  const ranked = games
    .filter(g => g.plays > 0)
    .sort((a, b) => b.plays - a.plays || a.gameName.localeCompare(b.gameName))
  if (ranked.length === 0) return null

  const shown = showAll ? ranked : ranked.slice(0, TOP_N)
  const max = ranked[0].plays
  const total = ranked.reduce((s, g) => s + g.plays, 0)
  const hovered = shown.find(g => `${g.platform}:${g.gameName}` === hover)

  return (
    <div className="bg-white rounded-xl border border-[#e5e5e5] p-5 mb-5">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-[#1a1a1a]">Plays per game</h2>
        <span className="text-xs text-[#9b9b9b]">{total} plays · {ranked.length} games</span>
      </div>
      <ul className="flex flex-col gap-0.5" aria-label="Finished plays per game">
        {shown.map(g => {
          const key = `${g.platform}:${g.gameName}`
          const active = hover === key
          return (
            <li
              key={key}
              onMouseEnter={() => setHover(key)}
              onMouseLeave={() => setHover(null)}
              title={`${g.gameName} (${PLATFORM_LABELS[g.platform]}): ${summary(g)}`}
              className={`grid grid-cols-[minmax(0,11rem)_1fr_2.5rem] sm:grid-cols-[minmax(0,15rem)_1fr_2.5rem] items-center gap-3 px-1.5 py-1 rounded-md
                ${active ? 'bg-[#f5f5f5]' : ''}`}
            >
              <span className="min-w-0 truncate text-xs text-[#1a1a1a]">
                {g.gameName}
                <span className="text-[#9b9b9b]"> · {PLATFORM_LABELS[g.platform]}</span>
              </span>
              <span className="h-3 relative">
                <span
                  className="absolute inset-y-0 left-0 rounded-r"
                  style={{ width: `${Math.max(1, (g.plays / max) * 100)}%`, background: ACCENT, opacity: hover && !active ? 0.55 : 1 }}
                />
              </span>
              <span className="text-xs tabular-nums text-right text-[#6b6b6b]">{g.plays}</span>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 min-h-4 text-xs text-[#6b6b6b] truncate">
        {hovered && <><span className="font-medium text-[#1a1a1a]">{hovered.gameName}</span> · {PLATFORM_LABELS[hovered.platform]} · {summary(hovered)}</>}
      </p>
      {ranked.length > TOP_N && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="mt-3 text-xs bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb] px-3 py-1 rounded-md"
        >
          {showAll ? `Show top ${TOP_N}` : `Show all ${ranked.length}`}
        </button>
      )}
    </div>
  )
}
