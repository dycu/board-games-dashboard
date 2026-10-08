'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import TopNav from '@/components/TopNav'
import { LoadChart, WeekChart, formatHours, MIN_RELIABLE_N } from '@/components/pace/charts'
import type { PaceStats } from '@/lib/pace/stats'

interface PaceResponse {
  stats: PaceStats
  names: Record<string, string>
  sync: {
    lastSyncAt: number | null
    trackingStartedAt: number
    indexComplete: boolean
    tables: number
    pendingHistory: number
  }
}

// Re-sync automatically on open when the last sync is older than this
const AUTO_SYNC_AFTER_S = 10 * 60
const MAX_SYNC_ROUNDS = 120
const ROUND_GAP_MS = 2000

function timeAgo(unix: number): string {
  const s = Date.now() / 1000 - unix
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-[#e5e5e5] bg-white px-4 py-3">
      <div className="text-xs text-[#6b6b6b]">{label}</div>
      <div className="text-2xl font-semibold text-[#1a1a1a] mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-[#9b9b9b] mt-0.5">{sub}</div>}
    </div>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[#e5e5e5] bg-white p-4 mb-4">
      <h2 className="text-sm font-medium text-[#1a1a1a]">{title}</h2>
      {note && <p className="text-xs text-[#6b6b6b] mt-1 mb-3">{note}</p>}
      {children}
    </section>
  )
}

export default function PacePage() {
  const [data, setData] = useState<PaceResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [showTable, setShowTable] = useState(false)
  const [scope, setScope] = useState<'bga' | 'all'>('bga')
  const syncingRef = useRef(false)

  const load = useCallback(async (): Promise<PaceResponse | null> => {
    try {
      const res = await fetch('/api/pace')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      setData(json)
      setError(null)
      return json
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      return null
    }
  }, [])

  // Each sync call does ~15s of work; keep calling until the backfill is done
  const sync = useCallback(async () => {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    setSyncError(null)
    try {
      for (let round = 0; round < MAX_SYNC_ROUNDS; round++) {
        const res = await fetch('/api/pace/sync', { method: 'POST' })
        const progress = await res.json()
        if (!res.ok) throw new Error(progress.error ?? `HTTP ${res.status}`)
        await load()
        if (progress.indexComplete && progress.pendingHistory === 0) break
        await new Promise(r => setTimeout(r, ROUND_GAP_MS)) // go easy on BGA between rounds
      }
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [load])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the page's data on mount
    load().then(d => {
      const s = d?.sync
      if (!s || !s.lastSyncAt || !s.indexComplete || s.pendingHistory > 0
        || Date.now() / 1000 - s.lastSyncAt > AUTO_SYNC_AFTER_S) {
        sync()
      }
    })
  }, [load, sync])

  const stats = data?.stats
  const s = data?.sync
  const backfilling = s ? (!s.indexComplete || s.pendingHistory > 0) : false

  const navRight = (
    <>
      {s?.lastSyncAt && <span className="hidden sm:inline">synced {timeAgo(s.lastSyncAt)}</span>}
      <button
        onClick={sync}
        disabled={syncing}
        className="text-xs bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb] px-2.5 py-1 rounded-md disabled:opacity-50"
      >
        {syncing ? 'Syncing…' : '↻ Sync'}
      </button>
    </>
  )

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav right={navRight} />
      <div className="flex-1 overflow-y-auto p-5 max-w-4xl mx-auto w-full">
        {error && !data && <p className="text-center py-12 text-red-500">Failed to load pace data: {error}</p>}
        {syncError && <p className="mb-3 text-xs text-red-600">Sync failed: {syncError}</p>}
        {!data && !error && <p className="text-center py-12 text-[#9b9b9b]">Loading…</p>}

        {s && backfilling && (
          <p className="mb-4 text-xs text-[#6b6b6b]">
            Reading your BGA move history{syncing ? '' : ' (paused — press Sync to continue)'}:{' '}
            {s.tables} tables found{s.indexComplete ? '' : ' so far'}, {s.pendingHistory} still to read.
          </p>
        )}

        {stats && stats.firstTurnAt === null && !backfilling && (
          <p className="text-center py-12 text-[#9b9b9b]">No BGA turns found yet.</p>
        )}

        {stats && stats.firstTurnAt !== null && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <Tile label="BGA games running" value={String(stats.running)}
                sub={stats.rule ? `rule of thumb: ~${stats.rule.suggestedGames}` : undefined} />
              <Tile label="Waiting on you" value={String(stats.waiting.length)}
                sub={stats.waiting[0] ? `oldest ${timeAgo(stats.waiting[0].since)}` : 'none'} />
              <Tile label={`Median response · ${stats.recent.days}d`} value={formatHours(stats.recent.medianHours)}
                sub={`slowest 10%: over ${formatHours(stats.recent.p90Hours)}`} />
              <Tile label={`Turns per day · ${stats.recent.days}d`} value={stats.recent.turnsPerDay === null ? '–' : String(stats.recent.turnsPerDay)}
                sub={stats.recent.coverage < 1 ? `estimated · history for ${Math.round(stats.recent.coverage * 100)}% of game time` : `${stats.recent.turns} turns`} />
            </div>

            <Section
              title="Response time by number of games running"
              note={scope === 'bga'
                ? `How long you took to move on BGA, depending on how many async BGA games were running at the time. Dot = median, bar = middle half of turns. Faint = fewer than ${MIN_RELIABLE_N} turns.`
                : `Same BGA turns, but counting your games on every platform. Other platforms are counted from dashboard refreshes${stats.allPlatformsSince ? ` since ${new Date(stats.allPlatformsSince * 1000).toLocaleDateString()}` : ''}, so only turns since then appear.`}
            >
              <div className="flex gap-1.5 mb-3" role="group" aria-label="Count games on">
                {([['bga', 'BGA games'], ['all', 'All platforms']] as const).map(([v, label]) => (
                  <button key={v} onClick={() => setScope(v)} aria-pressed={scope === v}
                    className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${scope === v
                      ? 'bg-[#1a1a1a] text-white'
                      : 'bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb]'}`}>
                    {label}
                  </button>
                ))}
              </div>
              {scope === 'all' && stats.byTotalLoad.length === 0 ? (
                <p className="text-xs text-[#9b9b9b] py-8 text-center">
                  Collecting — game counts from other platforms are recorded as you use the dashboard. Check back in a few days.
                </p>
              ) : (
                <LoadChart
                  buckets={scope === 'bga' ? stats.byLoad : stats.byTotalLoad}
                  knee={scope === 'bga' ? stats.knee : stats.kneeTotal}
                  xLabel={scope === 'bga' ? 'BGA games running when the turn started' : 'Games running on all platforms when the turn started'}
                />
              )}
              {!(scope === 'all' && stats.byTotalLoad.length === 0) && <p className="text-xs text-[#6b6b6b] mt-2">
                {scope === 'all'
                  ? (stats.kneeTotal !== null
                    ? <>Counting every platform, your BGA pace slips from about <strong className="text-[#1a1a1a]">{stats.kneeTotal} games in total</strong>.</>
                    : `Not enough turns yet to find a slow-down point across all platforms (${stats.byTotalLoad.reduce((a, b) => a + b.n, 0)} turns so far).`)
                  : stats.knee !== null
                    ? <>Your median response is clearly slower from about <strong className="text-[#1a1a1a]">{stats.knee} BGA games</strong> (1.5× your light-load pace){stats.otherNow ? <>, alongside your games elsewhere (currently {stats.otherNow})</> : null}.</>
                    : 'No clear slow-down point yet — your pace holds across the loads seen so far, or there isn\'t enough data.'}
                {scope === 'bga' && stats.rule && (
                  <> Rule of thumb: each game hands you {stats.rule.turnsPerGameDay} turns/day and your best week averaged {stats.rule.bestTurnsPerDay} turns/day, so about <strong className="text-[#1a1a1a]">{stats.rule.suggestedGames} games</strong> keeps you at ~75% capacity.</>
                )}
              </p>}
              <button onClick={() => setShowTable(v => !v)} className="mt-2 text-xs text-[#5e6ad2] hover:underline">
                {showTable ? 'Hide table' : 'Show as table'}
              </button>
              {showTable && (
                <table className="mt-2 w-full text-xs">
                  <thead>
                    <tr className="text-left text-[#6b6b6b] border-b border-[#e5e5e5]">
                      <th className="py-1 font-normal">Games running</th>
                      <th className="py-1 font-normal text-right">Turns</th>
                      <th className="py-1 font-normal text-right">Median</th>
                      <th className="py-1 font-normal text-right">Middle half</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(scope === 'bga' ? stats.byLoad : stats.byTotalLoad).map(b => (
                      <tr key={b.load} className={`border-b border-[#f3f3f3] ${b.n < MIN_RELIABLE_N ? 'text-[#9b9b9b]' : 'text-[#1a1a1a]'}`}>
                        <td className="py-1">{b.load}</td>
                        <td className="py-1 text-right">{b.n}</td>
                        <td className="py-1 text-right">{formatHours(b.median)}</td>
                        <td className="py-1 text-right">{formatHours(b.p25)}–{formatHours(b.p75)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            <Section title="Week by week" note="Same weeks on each row, so you can see whether slower weeks line up with more games.">
              <div className="flex flex-col gap-4">
                <WeekChart weeks={stats.weekly} title="Async BGA games running (average)" value={w => w.avgLoad} format={v => v.toFixed(0)} />
                <WeekChart weeks={stats.weekly} title="Median response time" value={w => w.medianHours} format={formatHours} />
                <WeekChart weeks={stats.weekly} title="Turns you played per day (estimated where some games have no history)" value={w => w.turnsPerDay} format={v => v.toFixed(0)} />
              </div>
            </Section>

            {stats.waiting.length > 0 && (
              <Section title="Waiting on you" note="As of the last sync.">
                <ul className="text-sm divide-y divide-[#f3f3f3]">
                  {stats.waiting.map(w => (
                    <li key={w.id} className="flex justify-between py-1.5">
                      <span className="text-[#1a1a1a]">{data!.names[w.game] ?? w.game}</span>
                      <span className="text-[#6b6b6b]">{timeAgo(w.since)}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <p className="text-[11px] text-[#9b9b9b] mb-6">
              Based on move timestamps from BGA. Real-time games (finished within 4 hours) are left out.
              BGA deletes a finished game&apos;s move log within hours, so only games read while still running have turns —
              older finished games still count toward how many games were running, and turns per day is scaled up to cover them.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
