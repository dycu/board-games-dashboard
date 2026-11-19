'use client'
import { useMemo, useState } from 'react'
import { Platform, PLATFORM_LABELS, PLATFORM_SHORT_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import { useFinishedGamesData } from '@/hooks/useFinishedGamesData'
import { useBgaPlayTotals, totalsOf } from '@/hooks/useBgaPlayTotals'
import { readCache } from '@/hooks/useGamesData'
import { aggregatePlayed, sortPlayed, playedNote, PlayedSort, PlayedGame } from '@/lib/backlog/played'
import { useAchievements } from '@/hooks/useAchievements'
import { useAchievementUnlocks } from '@/hooks/useAchievementUnlocks'
import { progressOf, achievementLabel } from '@/lib/achievements/compute'
import { Achievement } from '@/lib/achievements/store'
import AchievementUnlockedBanner from './AchievementUnlockedBanner'
import type { SearchSite } from '@/app/backlog/page'

const SORTS: [PlayedSort, string][] = [['recent', 'Recent'], ['most', 'Most played'], ['least', 'Least played'], ['name', 'A–Z']]
const BADGE_FALLBACK = 'bg-[var(--bg-muted)] text-[var(--text-secondary)]'

function Badge({ platform }: { platform: Platform }) {
  return (
    <span title={PLATFORM_LABELS[platform]} className={`shrink-0 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${BADGE_COLORS[platform] ?? BADGE_FALLBACK}`}>
      {PLATFORM_SHORT_LABELS[platform]}
    </span>
  )
}

const fmtDate = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

function GoalRow({ achievement, progress, onDelete }: { achievement: Achievement; progress: number; onDelete: () => void }) {
  const pct = Math.min(100, Math.round((progress / achievement.target) * 100))
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      {achievement.platform && <Badge platform={achievement.platform} />}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-[var(--text-primary)] truncate">{achievementLabel(achievement)}</span>
          <span className="text-xs tabular-nums text-[var(--text-tertiary)] shrink-0">{progress} / {achievement.target}</span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-[var(--bg-muted)] overflow-hidden">
          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <button onClick={onDelete} aria-label="Delete goal" title="Delete goal" className="shrink-0 text-[var(--text-tertiary)] hover:text-red-500 text-sm px-1">✕</button>
    </div>
  )
}

function UnlockedRow({ achievement, onDelete }: { achievement: Achievement; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <span className="text-base shrink-0">🏆</span>
      {achievement.platform && <Badge platform={achievement.platform} />}
      <span className="flex-1 min-w-0 text-sm text-[var(--text-primary)] truncate">{achievementLabel(achievement)}</span>
      <span className="text-xs text-[var(--text-tertiary)] shrink-0">{fmtDate(new Date(achievement.achievedAt!))}</span>
      <button onClick={onDelete} aria-label="Delete goal" title="Delete goal" className="shrink-0 text-[var(--text-tertiary)] hover:text-red-500 text-sm px-1">✕</button>
    </div>
  )
}

// Inline, opened from the "+ Goal" button on one of your games below —
// there's no free-text game name to get wrong, since it's always exactly
// the game the row is already for.
function GoalForm({ game, onCancel, onCreate }: {
  game: PlayedGame
  onCancel: () => void
  onCreate: (goal: { platform: Platform | null; gameType: string; metric: 'played' | 'won'; target: number }) => Promise<void>
}) {
  const [platform, setPlatform] = useState<Platform | 'any'>(game.platform)
  const [metric, setMetric] = useState<'played' | 'won'>('played')
  const [target, setTarget] = useState('10')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = Number(target)
    if (!Number.isFinite(n) || n < 1) { setError('Target must be at least 1'); return }
    setSaving(true)
    setError(null)
    try {
      await onCreate({ platform: platform === 'any' ? null : platform, gameType: game.gameName, metric, target: Math.floor(n) })
      onCancel()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add goal')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 mt-2 p-2 rounded-md bg-[var(--bg-muted)]">
      <select value={metric} onChange={e => setMetric(e.target.value as 'played' | 'won')} aria-label="Metric" className="text-xs bg-[var(--bg-surface)] border border-[var(--border-default)] rounded px-1.5 py-1">
        <option value="played">Play</option>
        <option value="won">Win</option>
      </select>
      <input
        type="number" min={1} value={target} onChange={e => setTarget(e.target.value)} aria-label="Target"
        className="w-14 text-xs bg-[var(--bg-surface)] border border-[var(--border-default)] rounded px-1.5 py-1"
      />
      <span className="text-xs text-[var(--text-secondary)] truncate">of {game.gameName}</span>
      <select value={platform} onChange={e => setPlatform(e.target.value as Platform | 'any')} aria-label="Platform" className="text-xs bg-[var(--bg-surface)] border border-[var(--border-default)] rounded px-1.5 py-1">
        <option value={game.platform}>{PLATFORM_LABELS[game.platform]}</option>
        <option value="any">Any platform</option>
      </select>
      <button type="submit" disabled={saving} className="text-xs bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] px-2.5 py-1 rounded-md disabled:opacity-50">
        {saving ? 'Adding…' : 'Add'}
      </button>
      <button type="button" onClick={onCancel} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] px-1">Cancel</button>
      {error && <p className="w-full text-xs text-red-500">{error}</p>}
    </form>
  )
}

// Goals, set against your own already-played games (the same filter/sort
// list as "From your games" above it) rather than a free-text game name —
// there's no catalog of games you haven't played to pick from, since a
// goal only ever tracks finished-games history.
export default function GoalsPanel({ sites }: { sites: Set<SearchSite> }) {
  const finished = useFinishedGamesData()
  const bgaTotals = useBgaPlayTotals()
  const { achievements, error, create, remove, markAchieved } = useAchievements()
  const { celebrating, dismiss } = useAchievementUnlocks(achievements, finished.data?.games, markAchieved)

  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<PlayedSort>('recent')
  const [pickingFor, setPickingFor] = useState<string | null>(null)

  const played = useMemo(
    () => aggregatePlayed(readCache()?.data.games ?? [], finished.data?.games ?? [], totalsOf(bgaTotals)),
    [finished.data, bgaTotals],
  )

  const q = filter.trim().toLowerCase()
  const shown = sortPlayed(
    played.filter(g => sites.has(g.platform) && (!q || g.gameName.toLowerCase().includes(q))),
    sort,
  )

  const games = finished.data?.games ?? []
  const inProgress = achievements?.filter(a => !a.achievedAt) ?? []
  const unlocked = [...(achievements?.filter(a => a.achievedAt) ?? [])]
    .sort((a, b) => new Date(b.achievedAt!).getTime() - new Date(a.achievedAt!).getTime())

  return (
    <div>
      <AchievementUnlockedBanner achievements={celebrating} onDismiss={dismiss} />
      {error && <p className="text-xs text-red-500 mb-2">Failed to load goals: {error}</p>}

      {inProgress.length > 0 && (
        <div className="mb-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--text-tertiary)] mb-1.5">In progress</h3>
          <div className="flex flex-col gap-1.5">
            {inProgress.map(a => <GoalRow key={a.id} achievement={a} progress={progressOf(a, games)} onDelete={() => remove(a.id)} />)}
          </div>
        </div>
      )}

      {unlocked.length > 0 && (
        <div className="mb-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--text-tertiary)] mb-1.5">Unlocked</h3>
          <div className="flex flex-col gap-1.5">
            {unlocked.map(a => <UnlockedRow key={a.id} achievement={a} onDelete={() => remove(a.id)} />)}
          </div>
        </div>
      )}

      <h3 className="text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--text-tertiary)] mb-1.5">Set a goal for one of your games</h3>
      <input
        type="text"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="Filter your games…"
        className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] text-sm px-3 py-1.5 rounded-md border border-[var(--border-default)]"
      />
      <div className="flex flex-wrap items-center gap-1.5 mt-2 mb-2">
        {SORTS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSort(key)}
            className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium transition-colors
              ${sort === key ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-muted-hover)]'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {finished.isLoading && <p className="text-xs text-[var(--text-tertiary)] mb-2">Loading your games…</p>}
      <ul className="flex flex-col divide-y divide-[var(--border-subtle)] max-h-96 overflow-y-auto">
        {shown.map(g => {
          const key = `${g.platform}:${g.gameName}`
          return (
            <li key={key} className="py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge platform={g.platform} />
                <div className="min-w-[140px] flex-1">
                  <p className="text-sm text-[var(--text-primary)] truncate">{g.gameName}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">{playedNote(g)}</p>
                </div>
                <button
                  onClick={() => setPickingFor(pickingFor === key ? null : key)}
                  className="shrink-0 text-xs bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-muted-hover)] px-2.5 py-1 rounded-md"
                >
                  {pickingFor === key ? 'Cancel' : '+ Goal'}
                </button>
              </div>
              {pickingFor === key && <GoalForm game={g} onCancel={() => setPickingFor(null)} onCreate={create} />}
            </li>
          )
        })}
      </ul>
      {!finished.isLoading && shown.length === 0 && (
        <p className="text-xs text-[var(--text-tertiary)] mt-2">No games found</p>
      )}
    </div>
  )
}
