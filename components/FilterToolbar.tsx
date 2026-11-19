'use client'
import { UserPrefs } from '@/lib/types'

interface Props {
  prefs: UserPrefs
  onChange: (updated: UserPrefs) => void
}

// Saved to the server too (not just local state via onChange) — otherwise
// it only ever lives in localStorage, and the plain fetch('/api/prefs') on
// mount (app/page.tsx) overwrites it back to the stale server copy on the
// very next load, same gap togglePin/toggleSink don't have.
function save(partial: Partial<UserPrefs>) {
  fetch('/api/prefs', { method: 'POST', body: JSON.stringify(partial), headers: { 'Content-Type': 'application/json' } }).catch(() => {})
}

export default function FilterToolbar({ prefs, onChange }: Props) {
  const setSort = (sort: UserPrefs['sort']) => {
    onChange({ ...prefs, sort })
    save({ sort })
  }
  const setTurnStatus = (turnStatus: UserPrefs['filter']['turnStatus']) => {
    const filter = { ...prefs.filter, turnStatus }
    onChange({ ...prefs, filter })
    save({ filter })
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-[2px] bg-[var(--bg-subtle)] rounded-md p-[3px]">
        {(['all', 'my-turn', 'waiting'] as const).map(status => (
          <button
            key={status}
            onClick={() => setTurnStatus(status)}
            className={`whitespace-nowrap text-xs px-2.5 py-1 rounded font-medium transition-colors
              ${prefs.filter.turnStatus === status
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                : 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
            {status === 'all' ? 'All' : status === 'my-turn' ? 'My turn' : 'Waiting'}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]" title="Order of games within each section">
        <span aria-hidden>⇅</span>
        <select
          id="sort-select"
          aria-label="Sort games"
          value={prefs.sort}
          onChange={e => setSort(e.target.value as UserPrefs['sort'])}
          className="text-xs bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-default)] rounded-md px-1.5 py-1">
          <option value="longest-wait">Longest wait</option>
          <option value="most-recent">Latest move</option>
          <option value="platform">Platform</option>
          <option value="game-name">Name</option>
          <option value="closest-to-end">Closest to the end</option>
          <option value="most-moves-today">Most moves today</option>
          <option value="least-moves-today">Fewest moves today</option>
          <option value="soonest-reply">Likely to reply soonest</option>
        </select>
      </label>
    </div>
  )
}
