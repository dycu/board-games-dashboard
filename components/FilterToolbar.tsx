'use client'
import { UserPrefs } from '@/lib/types'

interface Props {
  prefs: UserPrefs
  onChange: (updated: UserPrefs) => void
}

export default function FilterToolbar({ prefs, onChange }: Props) {
  const setSort = (sort: UserPrefs['sort']) => onChange({ ...prefs, sort })
  const setTurnStatus = (turnStatus: UserPrefs['filter']['turnStatus']) =>
    onChange({ ...prefs, filter: { ...prefs.filter, turnStatus } })

  const btn = (label: string, active: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors
        ${active ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
      {label}
    </button>
  )

  return (
    <div className="flex flex-wrap items-center gap-3 mb-5">
      <div className="flex items-center gap-2">
        <label htmlFor="sort-select" className="text-xs text-slate-500 uppercase tracking-wide">Sort</label>
        <select
          id="sort-select"
          aria-label="Sort games"
          value={prefs.sort}
          onChange={e => setSort(e.target.value as UserPrefs['sort'])}
          className="text-xs bg-slate-800 text-slate-300 border border-slate-700 rounded-md px-2 py-1.5">
          <option value="longest-wait">Longest wait</option>
          <option value="most-recent">Most recent</option>
          <option value="platform">Platform</option>
          <option value="game-name">Game name</option>
        </select>
      </div>

      <div className="flex gap-1">
        {btn('All', prefs.filter.turnStatus === 'all', () => setTurnStatus('all'))}
        {btn('My turn', prefs.filter.turnStatus === 'my-turn', () => setTurnStatus('my-turn'))}
        {btn('Waiting', prefs.filter.turnStatus === 'waiting', () => setTurnStatus('waiting'))}
      </div>
    </div>
  )
}
