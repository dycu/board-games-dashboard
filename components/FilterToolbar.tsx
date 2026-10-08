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

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-[2px] bg-[#f0f0f0] rounded-md p-[3px]">
        {(['all', 'my-turn', 'waiting'] as const).map(status => (
          <button
            key={status}
            onClick={() => setTurnStatus(status)}
            className={`whitespace-nowrap text-xs px-2.5 py-1 rounded font-medium transition-colors
              ${prefs.filter.turnStatus === status
                ? 'bg-white text-[#1a1a1a] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                : 'bg-transparent text-[#6b6b6b] hover:text-[#1a1a1a]'}`}>
            {status === 'all' ? 'All' : status === 'my-turn' ? 'My turn' : 'Waiting'}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-1 text-xs text-[#9b9b9b]" title="Order of games within each section">
        <span aria-hidden>⇅</span>
        <select
          id="sort-select"
          aria-label="Sort games"
          value={prefs.sort}
          onChange={e => setSort(e.target.value as UserPrefs['sort'])}
          className="text-xs bg-white text-[#6b6b6b] border border-[#e5e5e5] rounded-md px-1.5 py-1">
          <option value="longest-wait">Longest wait</option>
          <option value="most-recent">Latest move</option>
          <option value="platform">Platform</option>
          <option value="game-name">Name</option>
        </select>
      </label>
    </div>
  )
}
