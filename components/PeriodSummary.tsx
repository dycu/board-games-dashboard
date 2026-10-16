'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { FinishedGame, UserPrefs, DEFAULT_PREFS, PLATFORM_SHORT_LABELS, PLATFORM_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import { summarizePeriod, presetRange, PeriodPreset, GameBreakdown } from '@/lib/summary'
import Link from 'next/link'
import { gameHistoryHref } from '@/lib/gameStats'

interface Pace { turns: number; medianHours: number | null; turnsPerDay: number | null }

const PRESETS: [PeriodPreset, string][] = [['7d', '7d'], ['30d', '30d'], ['month', 'Month'], ['all', 'All time'], ['custom', 'Custom']]

const dateInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

type SortKey = 'plays' | 'record' | 'elo' | 'name'
const SORTS: [SortKey, string][] = [['plays', 'Most played'], ['record', 'Best record'], ['elo', 'ELO'], ['name', 'Name']]

// -1 for a game with no competitive results, so it sorts after real records
function winRate(g: GameBreakdown): number {
  const total = g.won + g.lost
  return total > 0 ? g.won / total : -1
}

const SORTERS: Record<SortKey, (a: GameBreakdown, b: GameBreakdown) => number> = {
  plays: (a, b) => b.played - a.played || a.gameName.localeCompare(b.gameName),
  record: (a, b) => winRate(b) - winRate(a) || b.played - a.played,
  elo: (a, b) => (b.eloNow ?? -Infinity) - (a.eloNow ?? -Infinity) || b.played - a.played,
  name: (a, b) => a.gameName.localeCompare(b.gameName),
}

// History over a chosen period: results, per-game breakdown, ELO and BGA pace
export default function PeriodSummary({ games, prefs = DEFAULT_PREFS, onPrefsChange }: { games: FinishedGame[]; prefs?: UserPrefs; onPrefsChange?: (p: UserPrefs) => void }) {
  const [preset, setPreset] = useState<PeriodPreset>('7d')
  const [now] = useState(() => new Date())
  const [customFrom, setCustomFrom] = useState(() => dateInput(new Date(now.getTime() - 14 * 86_400_000)))
  const [customTo, setCustomTo] = useState(() => dateInput(now))
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('plays')

  // prefs arrives asynchronously (localStorage, then the server) — adopt the
  // saved timeframe once, the first time it's defined, so it doesn't fight a
  // later click. Saved to prefs (local + server) the same way other choices
  // across the app are — otherwise it'd only ever live here and reset to 7d
  // on the next visit.
  const hydrated = useRef(false)
  useEffect(() => {
    if (hydrated.current || prefs.summaryPeriod === undefined) return
    hydrated.current = true
    setPreset(prefs.summaryPeriod)
    if (prefs.summaryPeriod === 'custom') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time adoption of the async-loaded saved prefs value
      if (prefs.summaryCustomFrom) setCustomFrom(prefs.summaryCustomFrom)
      if (prefs.summaryCustomTo) setCustomTo(prefs.summaryCustomTo)
    }
  }, [prefs.summaryPeriod, prefs.summaryCustomFrom, prefs.summaryCustomTo])

  const savePeriod = (partial: Partial<Pick<UserPrefs, 'summaryPeriod' | 'summaryCustomFrom' | 'summaryCustomTo'>>) => {
    if (!onPrefsChange) return
    onPrefsChange({ ...prefs, ...partial })
    fetch('/api/prefs', { method: 'POST', body: JSON.stringify(partial), headers: { 'Content-Type': 'application/json' } }).catch(() => {})
  }
  const choosePreset = (key: PeriodPreset) => {
    setPreset(key)
    savePeriod({ summaryPeriod: key })
  }
  const chooseCustomFrom = (value: string) => {
    setCustomFrom(value)
    savePeriod({ summaryCustomFrom: value })
  }
  const chooseCustomTo = (value: string) => {
    setCustomTo(value)
    savePeriod({ summaryCustomTo: value })
  }

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

  const { results, winRate: periodWinRate, eloChange, byGame, partial } = summary
  const pill = (active: boolean) => `text-xs px-2.5 py-0.5 rounded-full font-medium transition-colors
    ${active ? 'bg-[#1a1a1a] text-white' : 'bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb]'}`

  const visibleGames = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = q ? byGame.filter(g => g.gameName.toLowerCase().includes(q)) : byGame
    return [...rows].sort(SORTERS[sortKey])
  }, [byGame, search, sortKey])

  return (
    <section className="bg-white rounded-xl border border-[#e5e5e5] p-4">
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <h2 className="text-sm font-semibold text-[#1a1a1a] mr-1">Summary</h2>
        {PRESETS.map(([key, label]) => (
          <button key={key} onClick={() => choosePreset(key)} className={pill(preset === key)}>{label}</button>
        ))}
        {preset === 'custom' && (
          <span className="flex items-center gap-1 text-xs text-[#6b6b6b]">
            <input type="date" aria-label="From" value={customFrom} max={customTo} onChange={e => chooseCustomFrom(e.target.value)}
              className="bg-white border border-[#e5e5e5] rounded px-1.5 py-0.5" />
            –
            <input type="date" aria-label="To" value={customTo} min={customFrom} max={dateInput(now)} onChange={e => chooseCustomTo(e.target.value)}
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
            {periodWinRate !== null && <Stat value={`${Math.round(periodWinRate * 100)}%`} label="win rate" />}
            {eloChange !== null && <Stat value={signed(eloChange)} label="ELO (BGA)" accent={eloChange >= 0 ? 'text-green-700' : 'text-red-600'} />}
          </div>

          {byGame.length > 1 && (
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Filter ${byGame.length} games…`}
                className="flex-1 min-w-0 text-xs bg-white border border-[#e5e5e5] rounded px-2 py-1 placeholder:text-[#9b9b9b]"
              />
              <select
                value={sortKey}
                onChange={e => setSortKey(e.target.value as SortKey)}
                aria-label="Sort by"
                className="text-xs bg-white border border-[#e5e5e5] rounded px-1.5 py-1 text-[#6b6b6b]"
              >
                {SORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
          )}

          {/* Fixed column widths, so long names are cut off instead of widening the table */}
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-14" />
              <col className="w-14" />
              <col className="w-24 hidden sm:table-column" />
            </colgroup>
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[#9b9b9b] text-left">
                <th className="font-medium py-1">Game</th>
                <th className="font-medium py-1 text-right">Plays</th>
                <th className="font-medium py-1 text-right">W–L</th>
                <th className="font-medium py-1 text-right hidden sm:table-cell">ELO</th>
              </tr>
            </thead>
            <tbody>
              {visibleGames.length === 0 && (
                <tr><td colSpan={4} className="py-3 text-center text-[#9b9b9b]">No games match &quot;{search}&quot;</td></tr>
              )}
              {visibleGames.map(g => (
                <tr key={`${g.platform}:${g.gameName}`} className="border-t border-[#f0f0f0]">
                  <td className="py-1.5 pr-2 overflow-hidden" title={g.gameName}>
                    <span className="flex items-start gap-2 min-w-0">
                      <span title={PLATFORM_LABELS[g.platform]} className={`shrink-0 mt-0.5 text-[10px] font-bold uppercase tracking-wide px-1.5 py-px rounded-full ${BADGE_COLORS[g.platform] ?? 'bg-[#f3f3f3] text-[#6b6b6b]'}`}>
                        {PLATFORM_SHORT_LABELS[g.platform]}
                      </span>
                      {/* up to two lines: one cuts names like "Next Station: Tokyo" too short */}
                      <Link href={gameHistoryHref(g)} className="text-[#1a1a1a] leading-snug break-words line-clamp-2 hover:text-[#5e6ad2] hover:underline">{g.gameName}</Link>
                    </span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums align-top">{g.played}</td>
                  <td className="py-1.5 text-right tabular-nums text-[#6b6b6b] align-top">{g.won + g.lost > 0 ? `${g.won}–${g.lost}` : '—'}</td>
                  <td className="py-1.5 text-right tabular-nums whitespace-nowrap hidden sm:table-cell text-[#6b6b6b] align-top">
                    {g.eloNow !== undefined ? <>{g.eloNow}{g.eloChange ? <span className={g.eloChange > 0 ? ' text-green-700' : ' text-red-600'}> ({signed(g.eloChange)})</span> : null}</> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
