'use client'
import { useMemo, useState } from 'react'
import type { LoadBucket, WeekPoint } from '@/lib/pace/stats'
import { PLATFORM_SHORT_LABELS, PLATFORM_LABELS, type Platform } from '@/lib/types'

const ACCENT = '#5e6ad2'
const INK = '#1a1a1a'
const MUTED = '#9b9b9b'
const GRID = '#efefef'
// Buckets with fewer turns than this are drawn faint: too few to trust
export const MIN_RELIABLE_N = 15

export function formatHours(h: number | null): string {
  if (h === null || isNaN(h)) return '–'
  if (h < 1) return `${Math.round(h * 60)}m`
  if (h < 48) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}d`
}

function niceMax(v: number): number {
  if (v <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p
  return 10 * p
}

function Tooltip({ x, top, width, children }: { x: number; top: string; width: number; children: React.ReactNode }) {
  // Keep the tooltip inside the plot horizontally
  const left = Math.min(Math.max(x, 70), width - 70)
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-[#e5e5e5] bg-white px-2.5 py-1.5 text-xs shadow-sm whitespace-nowrap"
      style={{ left: `${(left / width) * 100}%`, top }}
    >
      {children}
    </div>
  )
}

// Median response per load level, with the middle 50% of turns as a bar
export function LoadChart({ buckets, knee, xLabel }: { buckets: LoadBucket[]; knee: number | null; xLabel: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 640, H = 240, L = 44, R = 12, T = 12, B = 34
  if (buckets.length === 0) return null

  const minLoad = buckets[0].load
  const maxLoad = buckets[buckets.length - 1].load
  const span = Math.max(1, maxLoad - minLoad)
  const yMax = niceMax(Math.max(...buckets.map(b => b.p75)))
  const x = (load: number) => L + ((load - minLoad + 0.5) / (span + 1)) * (W - L - R)
  const y = (h: number) => T + (1 - h / yMax) * (H - T - B)
  const slot = (W - L - R) / (span + 1)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * yMax)
  const xEvery = Math.max(1, Math.ceil((span + 1) / 12))

  const hovered = hover !== null ? buckets.find(b => b.load === hover) : undefined

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
        aria-label={`Median response time by ${xLabel.toLowerCase()}`}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={L - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10" fill={MUTED}>{formatHours(t)}</text>
          </g>
        ))}
        {knee !== null && (
          <g>
            <line x1={x(knee) - slot / 2} x2={x(knee) - slot / 2} y1={T} y2={H - B} stroke={INK} strokeDasharray="3 3" strokeOpacity={0.5} />
            <text x={x(knee) - slot / 2 + 4} y={T + 8} fontSize="10" fill={INK}>slows down here</text>
          </g>
        )}
        {buckets.map(b => {
          const faint = b.n < MIN_RELIABLE_N
          const active = hover === b.load
          return (
            <g key={b.load} opacity={faint ? 0.35 : 1}>
              <rect x={x(b.load) - 3} width={6} y={y(b.p75)} height={Math.max(2, y(b.p25) - y(b.p75))}
                rx={3} fill={ACCENT} fillOpacity={0.25} />
              <circle cx={x(b.load)} cy={y(b.median)} r={active ? 6 : 4.5} fill={ACCENT} stroke="white" strokeWidth={2} />
              {/* hit target wider than the mark */}
              <rect x={x(b.load) - slot / 2} width={slot} y={T} height={H - T - B} fill="transparent"
                tabIndex={0}
                onPointerEnter={() => setHover(b.load)} onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(b.load)} onBlur={() => setHover(null)} />
            </g>
          )
        })}
        {buckets.filter(b => (b.load - minLoad) % xEvery === 0).map(b => (
          <text key={b.load} x={x(b.load)} y={H - B + 14} textAnchor="middle" fontSize="10" fill={MUTED}>{b.load}</text>
        ))}
        <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" fontSize="10" fill={MUTED}>{xLabel}</text>
      </svg>
      {hovered && (
        <Tooltip x={x(hovered.load)} top={`${(y(hovered.p75) / H) * 100}%`} width={W}>
          <div className="font-semibold text-[#1a1a1a]">{formatHours(hovered.median)} median</div>
          <div className="text-[#6b6b6b]">middle half {formatHours(hovered.p25)}–{formatHours(hovered.p75)}</div>
          <div className="text-[#6b6b6b]">{hovered.load} games running · {hovered.n} turns{hovered.n < MIN_RELIABLE_N ? ' (few)' : ''}</div>
        </Tooltip>
      )}
    </div>
  )
}

export interface ActiveGameEta {
  id: string // globally unique, e.g. "bga:12345" — the platform prefix also disambiguates ids that collide across platforms
  platform: Platform
  game: string // BGA: a slug, resolve to a display name via `names`; other platforms: already a display title
  percent: number
  sampleCount: number
  timeBased?: boolean
  etaSeconds?: number
}

function formatEtaShort(seconds: number): string {
  if (seconds <= 0) return 'any time'
  const days = seconds / 86400
  if (days < 1) return `${Math.max(1, Math.round(seconds / 3600))}h`
  if (days < 14) return `${days.toFixed(1)}d`
  return `${Math.round(days / 7)}w`
}

// One horizontal bar per active game, soonest-to-finish at the top — games
// with no eta yet (just started, or nothing to estimate from) aren't shown;
// there's nothing useful to place on a timeline for them.
export function FinishTimelineChart({ games, names }: { games: ActiveGameEta[]; names: Record<string, string> }) {
  const [hover, setHover] = useState<string | null>(null)
  // eslint-disable-next-line react-hooks/purity -- the finish date shown on hover is relative to now
  const now = useMemo(() => Date.now(), [hover])
  const withEta = games.filter((g): g is ActiveGameEta & { etaSeconds: number } => g.etaSeconds !== undefined)
  if (withEta.length === 0) {
    return <p className="text-xs text-[#9b9b9b] py-6 text-center">No active games with an estimate yet.</p>
  }

  const ROW_H = 28
  const W = 640, L = 150, R = 46, T = 6, B = 16
  const H = T + withEta.length * ROW_H + B
  const maxDays = niceMax(Math.max(1, ...withEta.map(g => g.etaSeconds / 86400)))
  const x = (days: number) => L + Math.min(1, days / maxDays) * (W - L - R)
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Projected finish time for each active game">
        {ticks.map(f => (
          <line key={f} x1={L + f * (W - L - R)} x2={L + f * (W - L - R)} y1={T} y2={H - B + 2} stroke={GRID} />
        ))}
        {withEta.map((g, i) => {
          const y = T + i * ROW_H + ROW_H / 2
          const days = g.etaSeconds / 86400
          const overflow = days > maxDays
          const faint = !!g.timeBased || g.sampleCount < 3
          const label = names[g.game] ?? g.game
          const truncated = label.length > 18 ? `${label.slice(0, 17)}…` : label
          return (
            <g key={g.id} opacity={faint ? 0.55 : 1}>
              <text x={L - 8} y={y} dy="0.32em" textAnchor="end" fontSize="11" fill={INK}>
                <tspan fill={MUTED} fontSize="9">{PLATFORM_SHORT_LABELS[g.platform]} </tspan>
                {truncated}
              </text>
              <line x1={L} x2={x(days)} y1={y} y2={y} stroke={ACCENT} strokeWidth={7} strokeLinecap="round" />
              <text x={x(days) + 6} y={y} dy="0.32em" fontSize="10" fill={MUTED}>
                {formatEtaShort(g.etaSeconds)}{overflow ? '+' : ''}
              </text>
              <rect x={0} y={y - ROW_H / 2} width={W} height={ROW_H} fill="transparent"
                tabIndex={0}
                onPointerEnter={() => setHover(g.id)} onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(g.id)} onBlur={() => setHover(null)} />
            </g>
          )
        })}
        {ticks.map(f => (
          <text key={f} x={L + f * (W - L - R)} y={H - 2} textAnchor="middle" fontSize="9" fill={MUTED}>{Math.round(f * maxDays)}d</text>
        ))}
      </svg>
      {hover && (() => {
        const g = withEta.find(w => w.id === hover)
        if (!g) return null
        const i = withEta.indexOf(g)
        const finishDate = new Date(now + g.etaSeconds * 1000)
        return (
          <Tooltip x={x(g.etaSeconds / 86400)} top={`${((T + i * ROW_H) / H) * 100}%`} width={W}>
            <div className="font-semibold text-[#1a1a1a]">{PLATFORM_LABELS[g.platform]} · {names[g.game] ?? g.game} · {g.percent}%</div>
            <div className="text-[#6b6b6b]">
              {g.etaSeconds <= 0 ? 'any time now' : `around ${finishDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
            </div>
            <div className="text-[#6b6b6b]">
              {g.timeBased ? 'time-based' : 'turn-based'} · {g.sampleCount} sample{g.sampleCount === 1 ? '' : 's'}{g.sampleCount < 3 ? ' (few)' : ''}
            </div>
          </Tooltip>
        )
      })()}
    </div>
  )
}

// One measure over weeks; several of these stacked share the x axis instead of a dual-axis chart
export function WeekChart({
  weeks, value, format, title,
}: {
  weeks: WeekPoint[]
  value: (w: WeekPoint) => number | null
  format: (v: number) => string
  title: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 640, H = 110, L = 44, R = 12, T = 10, B = 20
  const vals = weeks.map(value)
  const present = vals.filter((v): v is number => v !== null)
  if (present.length === 0) return null

  const yMax = niceMax(Math.max(...present))
  const n = weeks.length
  const x = (i: number) => L + (n === 1 ? 0.5 : i / (n - 1)) * (W - L - R)
  const y = (v: number) => T + (1 - v / yMax) * (H - T - B)

  // Break the line at weeks without data
  const segments: string[] = []
  let cur = ''
  vals.forEach((v, i) => {
    if (v === null) { if (cur) segments.push(cur); cur = ''; return }
    cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
  })
  if (cur) segments.push(cur)

  const labelEvery = Math.max(1, Math.ceil(n / 8))
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * (W - L - R)
    setHover(Math.max(0, Math.min(n - 1, Math.round((px / (W - L - R)) * (n - 1)))))
  }
  const hv = hover !== null ? vals[hover] : null

  return (
    <div className="relative">
      <div className="text-xs text-[#6b6b6b] mb-1">{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={title}>
        {[0, 0.5, 1].map(f => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(f * yMax)} y2={y(f * yMax)} stroke={GRID} />
            <text x={L - 6} y={y(f * yMax)} dy="0.32em" textAnchor="end" fontSize="10" fill={MUTED}>{format(f * yMax)}</text>
          </g>
        ))}
        {segments.map((d, i) => <path key={i} d={d} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
        {weeks.map((w, i) => i % labelEvery === 0 && (
          <text key={w.weekStart} x={x(i)} y={H - 4} textAnchor="middle" fontSize="10" fill={MUTED}>{w.weekStart.slice(5)}</text>
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke={INK} strokeOpacity={0.3} />
            {hv !== null && <circle cx={x(hover)} cy={y(hv)} r={4.5} fill={ACCENT} stroke="white" strokeWidth={2} />}
          </g>
        )}
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent"
          onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hover !== null && (
        <Tooltip x={x(hover)} top="1.5rem" width={W}>
          <div className="font-semibold text-[#1a1a1a]">{hv === null ? 'no turns' : format(hv)}</div>
          <div className="text-[#6b6b6b]">week of {weeks[hover].weekStart} · {weeks[hover].n} turns</div>
        </Tooltip>
      )}
    </div>
  )
}
