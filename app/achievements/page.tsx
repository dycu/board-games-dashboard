'use client'
import { useMemo, useState } from 'react'
import { Platform, PLATFORM_LABELS, PLATFORM_SHORT_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import { useFinishedGamesData } from '@/hooks/useFinishedGamesData'
import { useAchievements } from '@/hooks/useAchievements'
import { useAchievementUnlocks } from '@/hooks/useAchievementUnlocks'
import { Achievement } from '@/lib/achievements/store'
import { progressOf, achievementLabel } from '@/lib/achievements/compute'
import TopNav from '@/components/TopNav'
import AchievementUnlockedBanner from '@/components/AchievementUnlockedBanner'

const BADGE_FALLBACK = 'bg-[var(--bg-muted)] text-[var(--text-secondary)]'

function Badge({ platform }: { platform: Platform }) {
  return (
    <span title={PLATFORM_LABELS[platform]} className={`shrink-0 text-[10px] font-bold uppercase tracking-wide rounded-full px-1.5 py-px ${BADGE_COLORS[platform] ?? BADGE_FALLBACK}`}>
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

const PLATFORMS: Platform[] = ['bga', 'eighteenxx', 'obg', 'yucata', 'choochoo', 'hansa', 'rally', 'oldkingscrown', 'boardgamers', 'boardtogether']

function NewGoalForm({ gameTypeOptions, onCreate }: {
  gameTypeOptions: string[]
  onCreate: (goal: { platform: Platform | null; gameType: string; metric: 'played' | 'won'; target: number }) => Promise<void>
}) {
  const [platform, setPlatform] = useState<Platform | 'any'>('any')
  const [gameType, setGameType] = useState('')
  const [metric, setMetric] = useState<'played' | 'won'>('played')
  const [target, setTarget] = useState('10')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = gameType.trim()
    const n = Number(target)
    if (!name) { setFormError('Pick a game'); return }
    if (!Number.isFinite(n) || n < 1) { setFormError('Target must be at least 1'); return }
    setSaving(true)
    setFormError(null)
    try {
      await onCreate({ platform: platform === 'any' ? null : platform, gameType: name, metric, target: Math.floor(n) })
      setGameType('')
      setTarget('10')
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to add goal')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] mb-5">
      <select
        value={metric}
        onChange={e => setMetric(e.target.value as 'played' | 'won')}
        aria-label="Metric"
        className="text-sm bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded px-2 py-1.5"
      >
        <option value="played">Play</option>
        <option value="won">Win</option>
      </select>
      <input
        type="number"
        min={1}
        value={target}
        onChange={e => setTarget(e.target.value)}
        aria-label="Target"
        className="w-16 text-sm bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded px-2 py-1.5"
      />
      <input
        list="achievement-game-types"
        value={gameType}
        onChange={e => setGameType(e.target.value)}
        placeholder="Game name…"
        aria-label="Game name"
        className="flex-1 min-w-[140px] text-sm bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded px-2 py-1.5"
      />
      <datalist id="achievement-game-types">
        {gameTypeOptions.map(n => <option key={n} value={n} />)}
      </datalist>
      <select
        value={platform}
        onChange={e => setPlatform(e.target.value as Platform | 'any')}
        aria-label="Platform"
        className="text-sm bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded px-2 py-1.5"
      >
        <option value="any">Any platform</option>
        {PLATFORMS.map(p => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
      </select>
      <button
        type="submit"
        disabled={saving}
        className="text-sm bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] px-3 py-1.5 rounded-md disabled:opacity-50"
      >
        Add goal
      </button>
      {formError && <p className="w-full text-xs text-red-500">{formError}</p>}
    </form>
  )
}

export default function AchievementsPage() {
  const finished = useFinishedGamesData()
  const { achievements, error, create, remove, markAchieved } = useAchievements()
  const { celebrating, dismiss } = useAchievementUnlocks(achievements, finished.data?.games, markAchieved)

  const games = useMemo(() => finished.data?.games ?? [], [finished.data])
  const gameTypeOptions = useMemo(() => [...new Set(games.map(g => g.gameType || g.gameName))].sort(), [games])

  const inProgress = achievements?.filter(a => !a.achievedAt) ?? []
  const unlocked = [...(achievements?.filter(a => a.achievedAt) ?? [])]
    .sort((a, b) => new Date(b.achievedAt!).getTime() - new Date(a.achievedAt!).getTime())

  const loading = (!finished.data && finished.isLoading) || !achievements

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav right={loading ? <span className="animate-pulse">Loading…</span> : undefined} />
      <div className="flex-1 overflow-y-auto p-5 max-w-2xl mx-auto w-full">
        {finished.lastError && (
          <p className="text-sm text-red-500 mb-3">Failed to load finished games, progress may be out of date: {finished.lastError}</p>
        )}
        {error && <p className="text-sm text-red-500 mb-3">Failed to load goals: {error}</p>}

        <AchievementUnlockedBanner achievements={celebrating} onDismiss={dismiss} />

        <NewGoalForm gameTypeOptions={gameTypeOptions} onCreate={create} />

        <h2 className="text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--text-tertiary)] mb-2">In progress · {inProgress.length}</h2>
        {inProgress.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)] py-4">No goals yet — add one above.</p>
        ) : (
          <div className="flex flex-col gap-1.5 mb-6">
            {inProgress.map(a => (
              <GoalRow key={a.id} achievement={a} progress={progressOf(a, games)} onDelete={() => remove(a.id)} />
            ))}
          </div>
        )}

        <h2 className="text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--text-tertiary)] mb-2">Unlocked · {unlocked.length}</h2>
        {unlocked.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)] py-4">Nothing unlocked yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {unlocked.map(a => (
              <UnlockedRow key={a.id} achievement={a} onDelete={() => remove(a.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
