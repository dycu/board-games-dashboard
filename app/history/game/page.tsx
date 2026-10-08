'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { FinishedGame, Platform, PLATFORM_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import { useFinishedGamesData } from '@/hooks/useFinishedGamesData'
import { readCache } from '@/hooks/useGamesData'
import { useBacklog } from '@/hooks/useBacklog'
import { useNotes } from '@/hooks/useNotes'
import { gameStats, gamesOf } from '@/lib/gameStats'
import { placeLabel, withEloDeltas } from '@/lib/results'
import { formatTimeAgo } from '@/lib/connectors/utils'
import TopNav from '@/components/TopNav'
import GameLink, { playedGameUrl } from '@/components/GameLink'
import AddToBacklogButton from '@/components/AddToBacklogButton'

const RESULT_STYLE = {
  won: 'bg-green-50 text-green-700',
  lost: 'bg-[#f3f3f3] text-[#6b6b6b]',
  draw: 'bg-sky-50 text-sky-700',
  coop: 'bg-violet-50 text-violet-700',
} as const

const fmtDate = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

function days(n: number): string {
  if (n < 1) return `${Math.max(1, Math.round(n * 24))}h`
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} days`
}

function Stat({ value, label, accent }: { value: React.ReactNode; label: string; accent?: string }) {
  return (
    <div className="bg-white rounded-lg border border-[#e5e5e5] px-3 py-2">
      <div className={`text-lg font-semibold tabular-nums ${accent ?? 'text-[#1a1a1a]'}`}>{value}</div>
      <div className="text-[11px] text-[#9b9b9b]">{label}</div>
    </div>
  )
}

// ELO over time as a small line; the axis labels are the lowest and highest rating
function EloChart({ series }: { series: { t: number; elo: number }[] }) {
  if (series.length < 2) return null
  const W = 600, H = 120, P = 6
  const t0 = series[0].t, t1 = series[series.length - 1].t
  const lo = Math.min(...series.map(p => p.elo)), hi = Math.max(...series.map(p => p.elo))
  const x = (t: number) => P + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * P)
  const y = (e: number) => H - P - ((e - lo) / Math.max(1, hi - lo)) * (H - 2 * P)
  const d = series.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.elo).toFixed(1)}`).join(' ')
  return (
    <div className="bg-white rounded-lg border border-[#e5e5e5] p-3">
      <div className="flex justify-between text-[11px] text-[#9b9b9b] mb-1">
        <span>ELO over time</span>
        <span>{lo}–{hi}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28" preserveAspectRatio="none" role="img" aria-label={`ELO from ${series[0].elo} to ${series[series.length - 1].elo}`}>
        <path d={d} fill="none" stroke="#5e6ad2" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {series.map(p => <circle key={p.t} cx={x(p.t)} cy={y(p.elo)} r="2.5" fill="#5e6ad2"><title>{`${fmtDate(new Date(p.t))}: ${p.elo}`}</title></circle>)}
      </svg>
      <div className="flex justify-between text-[11px] text-[#9b9b9b]">
        <span>{fmtDate(new Date(t0))}</span>
        <span>{fmtDate(new Date(t1))}</span>
      </div>
    </div>
  )
}

function GameHistory() {
  const params = useSearchParams()
  const platform = (params.get('platform') ?? '') as Platform
  const name = params.get('name') ?? ''
  const keyParam = params.get('key') ?? ''

  const finished = useFinishedGamesData()
  const backlog = useBacklog()
  const { notes } = useNotes()

  // BGA can list every game of one game since the account began; elsewhere
  // only what the general history fetch got
  const [full, setFull] = useState<FinishedGame[] | null>(null)
  const [fullError, setFullError] = useState<string | null>(null)
  const fromHistory = useMemo(
    () => gamesOf(finished.data?.games ?? [], platform, name),
    [finished.data, platform, name],
  )
  // Links from places that don't know BGA's game id (e.g. the chart) find it here
  const key = keyParam || fromHistory.find(g => g.gameKey)?.gameKey || ''

  useEffect(() => {
    if (platform !== 'bga' || !key) return
    let cancelled = false
    fetch(`/api/game-history?platform=bga&key=${encodeURIComponent(key)}`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return
        if (json.error) setFullError(json.error)
        else setFull((json.games as (Omit<FinishedGame, 'completedAt'> & { completedAt: string })[]).map(g => ({ ...g, completedAt: new Date(g.completedAt) })))
      })
      .catch(e => { if (!cancelled) setFullError(String(e)) })
    return () => { cancelled = true }
  }, [platform, key])

  const games = useMemo(
    () => withEloDeltas(full ?? fromHistory).sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime()),
    [full, fromHistory],
  )
  const stats = useMemo(() => gameStats(games), [games])

  const running = useMemo(() => (readCache()?.data.games ?? []).filter(g =>
    g.platform === platform && (g.gameType || g.gameName).toLowerCase() === name.toLowerCase()), [platform, name])

  const latest = games[0]
  const loading = (platform === 'bga' && key && !full && !fullError) || (!finished.data && finished.isLoading)
  const source = full
    ? `Every ${PLATFORM_LABELS[platform]} game of it since your account began`
    : fromHistory.length
      ? `From your recent ${PLATFORM_LABELS[platform] ?? platform} history, so older games may be missing`
      : null

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav right={loading ? <span className="animate-pulse">Loading…</span> : undefined} />
      <div className="flex-1 overflow-y-auto p-5 max-w-5xl mx-auto w-full">
        <Link href="/overview" className="text-xs text-[#6b6b6b] hover:text-[#1a1a1a]">← History</Link>

        <div className="flex flex-wrap items-center gap-2 mt-2 mb-1">
          <span className={`shrink-0 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${BADGE_COLORS[platform] ?? 'bg-[#f3f3f3] text-[#6b6b6b]'}`}>
            {PLATFORM_LABELS[platform] ?? platform}
          </span>
          <h1 className="text-xl font-semibold text-[#1a1a1a] mr-2">{name}</h1>
          {latest && <GameLink url={playedGameUrl(latest)} platform={platform} />}
          {backlog.items && (
            <AddToBacklogButton
              inList={backlog.listFor(platform, name)}
              adding={backlog.isAdding(platform, name)}
              onAdd={() => backlog.add({ platform, gameName: name, gameUrl: latest?.gameUrl, list: 'play' })}
            />
          )}
        </div>
        {source && <p className="text-xs text-[#9b9b9b] mb-4">{source}{fullError && ` (full history unavailable: ${fullError})`}</p>}

        {games.length === 0 ? (
          !loading && <p className="text-sm text-[#9b9b9b] py-8">No finished games of {name} found.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-4">
              <Stat value={stats.plays} label="games played" />
              {stats.last && <Stat value={formatTimeAgo(stats.last)} label={`last, ${fmtDate(stats.last)}`} />}
              {stats.first && <Stat value={fmtDate(stats.first)} label="first" />}
              {stats.winRate !== null && <Stat value={`${Math.round(stats.winRate * 100)}%`} label={`won (${stats.results.won}–${stats.results.lost})`} accent="text-green-700" />}
              {stats.results.coop > 0 && <Stat value={stats.results.coop} label="co-op games" />}
              {stats.avgRank !== null && <Stat value={stats.avgRank.toFixed(1)} label="average place" />}
              {stats.eloNow !== null && <Stat value={stats.eloNow} label={`ELO now (best ${stats.eloBest})`} />}
              {stats.avgDurationDays !== null && <Stat value={days(stats.avgDurationDays)} label="average length" />}
              {stats.usualPlayerCount !== null && <Stat value={stats.usualPlayerCount} label="usual players" />}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 mb-5 items-start">
              <EloChart series={stats.eloSeries} />
              {stats.opponents.length > 0 && (
                <div className="bg-white rounded-lg border border-[#e5e5e5] p-3 lg:col-start-2">
                  <div className="text-[11px] text-[#9b9b9b] mb-1">Most played opponents · you–them</div>
                  <ul className="text-sm">
                    {stats.opponents.slice(0, 8).map(o => (
                      <li key={o.name} className="flex justify-between gap-2 py-0.5">
                        <span className="truncate text-[#1a1a1a]">{o.name}</span>
                        <span className="shrink-0 tabular-nums text-[#6b6b6b]">{o.games}× · {o.iWon}–{o.theyWon}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}

        {running.length > 0 && (
          <section className="mb-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#9b9b9b] mb-2">Going now · {running.length}</h2>
            <div className="flex flex-col gap-1.5">
              {running.map(g => (
                <a key={g.id} href={g.gameUrl} target={platform === 'bga' ? '_self' : '_blank'} rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-md border border-[#ececec] bg-white hover:border-[#c5c9f0] text-sm">
                  <span className="truncate text-[#1a1a1a]">{g.gameName}</span>
                  <span className="text-xs text-[#9b9b9b]">{g.myTurn ? 'your turn' : `waiting for ${g.currentPlayer ?? 'others'}`} · {g.lastMoveAgo}</span>
                  {notes[g.id] && <span className="text-xs italic text-[#6b6b6b] truncate">✎ {notes[g.id]}</span>}
                </a>
              ))}
            </div>
          </section>
        )}

        {games.length > 0 && (
          <section>
            <h2 className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#9b9b9b] mb-2">Games · {games.length}</h2>
            <div className="bg-white rounded-lg border border-[#e5e5e5] overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-[#9b9b9b] text-left">
                    <th className="font-medium px-3 py-2">Finished</th>
                    <th className="font-medium px-3 py-2">Result</th>
                    <th className="font-medium px-3 py-2 text-right">Score</th>
                    <th className="font-medium px-3 py-2">Opponents</th>
                    <th className="font-medium px-3 py-2 text-right">ELO</th>
                    <th className="font-medium px-3 py-2 text-right">Length</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {games.map(g => {
                    const place = placeLabel(g)
                    const len = g.startedAt ? (g.completedAt.getTime() - new Date(g.startedAt).getTime()) / 86_400_000 : null
                    return (
                      <tr key={g.id} className="border-t border-[#f0f0f0]">
                        <td className="px-3 py-1.5 whitespace-nowrap text-[#6b6b6b]">{g.completedAt.getTime() > 0 ? fmtDate(g.completedAt) : '—'}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          {g.result && place ? (
                            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${RESULT_STYLE[g.result]}`}>{g.result === 'won' ? '🏆 ' : ''}{place}</span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-[#6b6b6b]">{g.score ?? '—'}</td>
                        <td className="px-3 py-1.5 text-[#6b6b6b] min-w-[10rem]">{g.opponents?.map(o => o.name).join(', ') || '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-[#6b6b6b]">
                          {g.elo !== undefined ? <>{g.elo}{g.eloDelta ? <span className={g.eloDelta > 0 ? ' text-green-700' : ' text-red-600'}> ({signed(g.eloDelta)})</span> : null}</> : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap text-[#6b6b6b]">{len !== null && len >= 0 ? days(len) : '—'}</td>
                        <td className="px-3 py-1.5 text-right">
                          <a href={g.gameUrl} target={platform === 'bga' ? '_self' : '_blank'} rel="noopener noreferrer" className="text-xs text-[#5e6ad2] hover:underline whitespace-nowrap">View →</a>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

// useSearchParams needs a Suspense boundary for the static build
export default function GameHistoryPage() {
  return (
    <Suspense>
      <GameHistory />
    </Suspense>
  )
}
