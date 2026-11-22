'use client'
import { useId, useState } from 'react'

// Add via Enter or blur, remove with a click on the tag itself. `suggestions`
// (every tag already in use, from wherever this is mounted — opponents, game
// titles, ...) is offered as a datalist, so a tag like "slow" or "live" only
// needs to be typed out once across the whole set it belongs to.
export default function TagEditor({ tags, suggestions, onSave }: { tags: string[]; suggestions: string[]; onSave: (tags: string[]) => void }) {
  const listId = useId()
  const [draft, setDraft] = useState('')
  const addTag = () => {
    const t = draft.trim()
    setDraft('')
    if (t && !tags.includes(t)) onSave([...tags, t])
  }
  const options = suggestions.filter(t => !tags.includes(t))
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map(t => (
        <button
          key={t}
          onClick={() => onSave(tags.filter(x => x !== t))}
          title={`Remove the "${t}" tag`}
          className="text-[10px] font-medium px-1.5 py-px rounded-full bg-[var(--accent-tint)] text-[var(--accent)] hover:bg-red-50 hover:text-red-600"
        >
          {t} ✕
        </button>
      ))}
      <input
        list={listId}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') addTag() }}
        onBlur={addTag}
        placeholder="+ tag"
        aria-label="Add a tag"
        className="w-16 text-[10px] bg-transparent border-b border-dashed border-[var(--border-dashed)] focus:outline-none focus:border-[var(--accent)] text-[var(--text-secondary)] placeholder:text-[var(--text-tertiary)]"
      />
      {options.length > 0 && (
        <datalist id={listId}>
          {options.map(t => <option key={t} value={t} />)}
        </datalist>
      )}
    </div>
  )
}
