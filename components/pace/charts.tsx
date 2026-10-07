'use client'
import { useState } from 'react'
import type { LoadBucket, WeekPoint } from '@/lib/pace/stats'

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
