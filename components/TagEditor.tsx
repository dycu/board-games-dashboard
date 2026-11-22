'use client'
import { useState } from 'react'

// Add by clicking an existing tag (shown as its own chip, not hidden behind
// a <datalist> — mobile browsers' native autocomplete for that is spotty
// to nonexistent) or by typing a new one and pressing Enter/blurring.
// `suggestions` is every tag already in use wherever this is mounted
// (opponents, game titles, ...), so a tag like "slow" or "live" only needs
// to be typed out once across the whole set it belongs to.
export default function TagEditor({ tags, suggestions, onSave }: { tags: string[]; suggestions: string[]; onSave: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const addTag = (tag: string) => {
    const t = tag.trim()
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
      {options.map(t => (
        <button
          key={t}
          onClick={() => addTag(t)}
          title={`Add the "${t}" tag`}
          className="text-[10px] font-medium px-1.5 py-px rounded-full border border-dashed border-[var(--border-dashed)] text-[var(--text-tertiary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          + {t}
        </button>
      ))}
      <input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') addTag(draft) }}
        onBlur={() => addTag(draft)}
        placeholder="+ new"
        aria-label="Add a new tag"
        className="w-16 text-[10px] bg-transparent border-b border-dashed border-[var(--border-dashed)] focus:outline-none focus:border-[var(--accent)] text-[var(--text-secondary)] placeholder:text-[var(--text-tertiary)]"
      />
    </div>
  )
}
