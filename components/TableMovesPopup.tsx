'use client'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Game } from '@/lib/types'
import { useAnchoredPopover } from '@/hooks/useAnchoredPopover'

// Mirrors lib/perPlayerMoves/track.ts's ME_KEY/OPPONENTS_KEY — duplicated
// as plain string literals rather than imported, since that module (via
// lib/moveCounts/track and the KV-backed store modules) pulls in
// @vercel/kv, which has no business in a client bundle.
const ME_KEY = 'me'
const OPPONENTS_KEY = 'opponents'

type DayCounts = Record<string, number> // playerKey -> moves that day
type GameDays = Record<string, DayCounts> // date (YYYY-MM-DD) -> DayCounts

const INK = '#1a1a1a'
const MUTED = '#9b9b9b'
const GRID = '#efefef'
const ME_COLOR = '#5e6ad2' // var(--accent) — this popup is always rendered light, so the literal is fine
const OPPONENTS_COLOR = '#c7c7c7'
// Cycled for each named opponent, in order of first appearance — stable
// for as long as this popup is open, even though it's recomputed on refetch
const OPPONENT_PALETTE = ['#f59e0b', '#0d9488', '#f43f5e', '#0ea5e9', '#65a30d', '#a855f7']

function niceMax(v: number): number {
  if (v <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p
  return 10 * p
}

function label(playerKey: string): string {
  if (playerKey === ME_KEY) return 'You'
  if (playerKey === OPPONENTS_KEY) return 'Others (unresolved)'
  return playerKey
}

// Bottom-to-top: me first, then each named opponent (in the order they
// first show up across the days, oldest day first), "opponents" last —
// keeps the same player in the same stacking position on every bar.
function orderedKeys(days: GameDays): string[] {
  const dates = Object.keys(days).sort()
  const named: string[] = []
  for (const date of dates) {
    for (const key of Object.keys(days[date])) {
      if (key !== ME_KEY && key !== OPPONENTS_KEY && !named.includes(key)) named.push(key)
    }
  }
  const keys = [ME_KEY, ...named]
  if (dates.some(d => days[d][OPPONENTS_KEY])) keys.push(OPPONENTS_KEY)
  return keys.filter(k => dates.some(d => days[d][k]))
}

function colorFor(playerKey: string, namedOpponents: string[]): string {
  if (playerKey === ME_KEY) return ME_COLOR
  if (playerKey === OPPONENTS_KEY) return OPPONENTS_COLOR
  const i = namedOpponents.indexOf(playerKey)
  return OPPONENT_PALETTE[i % OPPONENT_PALETTE.length]
}

// Each day gets a fixed pixel width, however long the table's history
// is — cramming every day into one fixed-width chart (the previous
// approach) made the bars illegible after a couple of weeks, which is
// exactly when a "how's this table been going" glance matters most. A
// long history just makes a wider, horizontally-scrollable chart instead,
// defaulted scrolled to the most recent days.
const DAY_SLOT = 14

// A stacked bar per day — each segment is one player's share of that day's
// moves, in the same order/color on every bar, so a glance across days
// reads as "who's been carrying this table along".
function StackedMovesChart({ days }: { days: GameDays }) {
  const [hover, setHover] = useState<{ i: number; x: number } | null>(null)
  const [scrollLeft, setScrollLeft] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dates = Object.keys(days).sort()
  const keys = orderedKeys(days)
  const namedOpponents = keys.filter(k => k !== ME_KEY && k !== OPPONENTS_KEY)

  const AXIS_W = 28, H = 150, T = 10, B = 20
  const totals = dates.map(d => keys.reduce((sum, k) => sum + (days[d][k] ?? 0), 0))
  const yMax = niceMax(Math.max(1, ...totals))
  const n = dates.length
  const chartW = n * DAY_SLOT
  const barW = Math.max(3, DAY_SLOT * 0.6)
  const y = (v: number) => T + (1 - v / yMax) * (H - T - B)
  const labelEvery = Math.max(1, Math.ceil(40 / DAY_SLOT))

  // Scrolled to the end (most recent days) by default — and again whenever
  // the history grows (a later day added while the popup happens to still
  // be open), rather than leaving the view pinned to wherever it was.
  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollLeft = el.scrollWidth
      setScrollLeft(el.scrollLeft)
    }
  }, [n])

  return (
    <div>
      <div className="relative flex">
        <svg width={AXIS_W} height={H} className="shrink-0" aria-hidden="true">
          {[0, 0.5, 1].map(f => (
            <g key={f}>
              <line x1={0} x2={AXIS_W} y1={y(f * yMax)} y2={y(f * yMax)} stroke={GRID} />
              <text x={AXIS_W - 6} y={y(f * yMax)} dy="0.32em" textAnchor="end" fontSize="9" fill={MUTED}>{Math.round(f * yMax)}</text>
            </g>
          ))}
        </svg>
        <div ref={scrollRef} className="flex-1 min-w-0 overflow-x-auto" onScroll={e => setScrollLeft(e.currentTarget.scrollLeft)}>
          <svg width={chartW} height={H} role="img" aria-label="Moves per day, by player">
            {[0, 0.5, 1].map(f => (
              <line key={f} x1={0} x2={chartW} y1={y(f * yMax)} y2={y(f * yMax)} stroke={GRID} />
            ))}
            {dates.map((date, i) => {
              const barX = i * DAY_SLOT + (DAY_SLOT - barW) / 2
              let cumulative = 0
              return (
                <g key={date} opacity={hover === null || hover.i === i ? 1 : 0.4}>
                  {keys.map(k => {
                    const v = days[date][k] ?? 0
                    if (v === 0) return null
                    const segY = y(cumulative + v)
                    const segH = Math.max(0, y(cumulative) - segY)
                    cumulative += v
                    return <rect key={k} x={barX} y={segY} width={barW} height={segH} fill={colorFor(k, namedOpponents)} />
                  })}
                  <rect x={i * DAY_SLOT} y={T} width={DAY_SLOT} height={H - T - B} fill="transparent"
                    tabIndex={0}
                    onPointerEnter={() => setHover({ i, x: i * DAY_SLOT + DAY_SLOT / 2 })}
                    onPointerLeave={() => setHover(null)}
                    onFocus={() => setHover({ i, x: i * DAY_SLOT + DAY_SLOT / 2 })}
                    onBlur={() => setHover(null)} />
                </g>
              )
            })}
            {dates.map((date, i) => i % labelEvery === 0 && (
              <text key={date} x={i * DAY_SLOT + DAY_SLOT / 2} y={H - 4} textAnchor="middle" fontSize="9" fill={MUTED}>{date.slice(5)}</text>
            ))}
          </svg>
        </div>
        {hover !== null && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-[#e5e5e5] bg-white px-2.5 py-1.5 text-xs shadow-sm whitespace-nowrap"
            style={{ left: AXIS_W + hover.x - scrollLeft, top: 0, transform: 'translate(-50%, -100%)' }}
          >
            <div className="font-semibold" style={{ color: INK }}>{dates[hover.i]}</div>
            {keys.filter(k => days[dates[hover.i]][k]).map(k => (
              <div key={k} className="flex items-center gap-1.5" style={{ color: INK }}>
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: colorFor(k, namedOpponents) }} />
                {label(k)} · {days[dates[hover.i]][k]}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px]" style={{ color: MUTED }}>
        {keys.map(k => (
          <span key={k} className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: colorFor(k, namedOpponents) }} />
            {label(k)}
          </span>
        ))}
      </div>
    </div>
  )
}

// Opened from a card's move-count dots — same anchored-popover approach as
// ProgressBar's own tap/hover tooltip (components/ProgressBar.tsx's
// HoldTooltip), not a centered modal with a dimming backdrop: it belongs
// right next to the dots that opened it, not taking over the whole screen.
// Unlike that tooltip this one has to stay interactive (hovering the
// chart, a close button), so it can't be pointer-events-none — closing
// instead happens on Escape, a click anywhere outside it, or scrolling
// (see useAnchoredPopover).
export default function TableMovesPopup({ game, anchorRef, onClose }: { game: Game; anchorRef: RefObject<HTMLElement | null>; onClose: () => void }) {
  const [days, setDays] = useState<GameDays | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { panelRef, pos, width, margin } = useAnchoredPopover(anchorRef, onClose, { heightEstimate: 260 })

  useEffect(() => {
    let cancelled = false
    fetch(`/api/table-moves?id=${encodeURIComponent(game.id)}`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setDays(data.days ?? {}) })
      .catch(() => { if (!cancelled) setError('Could not load this table’s move history.') })
    return () => { cancelled = true }
  }, [game.id])

  if (!pos) return null

  const hasHistory = days !== null && Object.keys(days).length > 0

  return (
    <div
      ref={panelRef}
      className="fixed z-50 bg-[var(--bg-surface)] rounded-lg shadow-xl border border-[var(--border-default)] p-3"
      style={{ top: pos.top, left: pos.left, width: `min(${width}px, calc(100vw - ${margin * 2}px))` }}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] truncate">{game.gameName}</h2>
        <button onClick={onClose} aria-label="Close" className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] leading-none">✕</button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {!error && days === null && <p className="text-xs text-[var(--text-tertiary)] py-6 text-center">Loading…</p>}
      {!error && days !== null && !hasHistory && (
        <p className="text-xs text-[var(--text-tertiary)] py-6 text-center">No moves recorded yet for this table.</p>
      )}
      {!error && hasHistory && <StackedMovesChart days={days} />}
    </div>
  )
}
