'use client'
import { useEffect, useMemo, useState } from 'react'
import { FinishedGame, PLATFORM_SHORT_LABELS, PLATFORM_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import { summarizePeriod, presetRange, PeriodPreset } from '@/lib/summary'

interface Pace { turns: number; medianHours: number | null; turnsPerDay: number | null }

const PRESETS: [PeriodPreset, string][] = [['7d', '7d'], ['30d', '30d'], ['month', 'Month'], ['custom', 'Custom']]

const dateInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

// History over a chosen period: results, per-game breakdown, ELO and BGA pace
const TABLE_ROWS = 6

export default function PeriodSummary({ games }: { games: FinishedGame[] }) {
  const [preset, setPreset] = useState<PeriodPreset>('7d')
  const [showAllGames, setShowAllGames] = useState(false)
  const [now] = useState(() => new Date())
  const [customFrom, setCustomFrom] = useState(() => dateInput(new Date(now.getTime() - 14 * 86_400_000)))
  const [customTo, setCustomTo] = useState(() => dateInput(now))

  const { from, to } = useMemo(() => {
    if (preset !== 'custom') return presetRange(preset, now)
    const f = new Date(`${customFrom}T00:00:00`)
    const t = new Date(`${customTo}T23:59:59`)
    return { from: f, to: t > now ? now : t }
  }, [preset, customFrom, customTo, now])

  const summary = useMemo(() => summarizePeriod(games, from, to), [games, from, to])

  const [pace, setPace] = useState<Pace | null>(null)
  useEffect(() => {
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from) return
    let cancelled = false
    fetch(`/api/pace?from=${Math.floor(from.getTime() / 1000)}&to=${Math.floor(to.getTime() / 1000)}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setPace(json.recent ?? null) })
      .catch(() => { if (!cancelled) setPace(null) })
    return () => { cancelled = true }
  }, [from, to])

  const { results, winRate, eloChange, byGame, partial } = summary
  const pill = (active: boolean) => `text-xs px-2.5 py-0.5 rounded-full font-medium transition-colors
    ${active ? 'bg-[#1a1a1a] text-white' : 'bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb]'}`

  return (
    <section className="bg-white rounded-xl border border-[#e5e5e5] p-4">
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <h2 className="text-sm font-semibold text-[#1a1a1a] mr-1">Summary</h2>
        {PRESETS.map(([key, label]) => (
          <button key={key} onClick={() => setPreset(key)} className={pill(preset === key)}>{label}</button>
        ))}
        {preset === 'custom' && (
          <span className="flex items-center gap-1 text-xs text-[#6b6b6b]">
            <input type="date" aria-label="From" value={customFrom} max={customTo} onChange={e => setCustomFrom(e.target.value)}
              className="bg-white border border-[#e5e5e5] rounded px-1.5 py-0.5" />
            –
            <input type="date" aria-label="To" value={customTo} min={customFrom} max={dateInput(now)} onChange={e => setCustomTo(e.target.value)}
              className="bg-white border border-[#e5e5e5] rounded px-1.5 py-0.5" />
          </span>
        )}
      </div>

      {summary.games.length === 0 ? (
        <p className="text-sm text-[#9b9b9b]">No games finished in this period.</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-x-3 gap-y-2 mb-3">
            <Stat value={summary.games.length} label="finished" />
            <Stat value={results.won} label="won" accent="text-green-700" />
            <Stat value={results.lost} label="lost" />
            {results.draws > 0 && <Stat value={results.draws} label="drawn" />}
            {results.coop > 0 && <Stat value={results.coop} label="co-op" />}
            {winRate !== null && <Stat value={`${Math.round(winRate * 100)}%`} label="win rate" />}
            {eloChange !== null && <Stat value={signed(eloChange)} label="ELO (BGA)" accent={eloChange >= 0 ? 'text-green-700' : 'text-red-600'} />}
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[#9b9b9b] text-left">
                <th className="font-medium py-1">Game</th>
                <th className="font-medium py-1 text-right">Played</th>
                <th className="font-medium py-1 pl-3 text-right">W–L</th>
                <th className="font-medium py-1 pl-4 text-right hidden sm:table-cell">ELO</th>
              </tr>
            </thead>
            <tbody>
              {(showAllGames ? byGame : byGame.slice(0, TABLE_ROWS)).map(g => (
                <tr key={`${g.platform}:${g.gameName}`} className="border-t border-[#f0f0f0]">
                  <td className="py-1.5 pr-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <span title={PLATFORM_LABELS[g.platform]} className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-px rounded-full ${BADGE_COLORS[g.platform] ?? 'bg-[#f3f3f3] text-[#6b6b6b]'}`}>
                        {PLATFORM_SHORT_LABELS[g.platform]}
                      </span>
                      <span className="truncate text-[#1a1a1a]">{g.gameName}</span>
                    </span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{g.played}</td>
                  <td className="py-1.5 pl-3 text-right tabular-nums text-[#6b6b6b]">{g.won + g.lost > 0 ? `${g.won}–${g.lost}` : '—'}</td>
                  <td className="py-1.5 pl-4 text-right tabular-nums whitespace-nowrap hidden sm:table-cell text-[#6b6b6b]">
                    {g.eloNow !== undefined ? <>{g.eloNow}{g.eloChange ? <span className={g.eloChange > 0 ? ' text-green-700' : ' text-red-600'}> ({signed(g.eloChange)})</span> : null}</> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {byGame.length > TABLE_ROWS && (
            <button onClick={() => setShowAllGames(v => !v)} className="mt-1 text-xs text-[#6b6b6b] hover:text-[#1a1a1a]">
              {showAllGames ? 'Show fewer' : `Show all ${byGame.length} games`}
            </button>
          )}
        </>
      )}

      {pace && pace.turns > 0 && (
        <p className="text-xs text-[#6b6b6b] mt-3">
          BGA pace: {pace.turns} moves{pace.medianHours !== null && `, median ${pace.medianHours}h to answer`}
          {pace.turnsPerDay !== null && `, ${pace.turnsPerDay} moves/day`}
        </p>
      )}
      {partial.length > 0 && (
        <p className="text-xs text-amber-600 mt-2">
          {partial.map(p => `${PLATFORM_LABELS[p.platform]} history only goes back to ${p.since.toLocaleDateString()}`).join('; ')}, so earlier games there are missing.
        </p>
      )}
    </section>
  )
}

function Stat({ value, label, accent }: { value: number | string; label: string; accent?: string }) {
  return (
    <div>
      <div className={`text-lg font-semibold tabular-nums ${accent ?? 'text-[#1a1a1a]'}`}>{value}</div>
      <div className="text-[11px] text-[#9b9b9b]">{label}</div>
    </div>
  )
}
