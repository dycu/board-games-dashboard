'use client'

// Single-select tag filter chips — click a tag to show only rows with it,
// click it again (or any other chip while it's selected) to clear it back
// to showing everything. Shared by every page that lists games or
// opponents and wants to let someone filter down by tag, so they all look
// and behave the same way.
interface Props {
  tags: string[]
  selected: string | null
  onChange: (tag: string | null) => void
  className?: string
}

export default function TagFilterChips({ tags, selected, onChange, className }: Props) {
  if (tags.length === 0) return null
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className ?? ''}`}>
      {tags.map(t => (
        <button
          key={t}
          onClick={() => onChange(selected === t ? null : t)}
          aria-pressed={selected === t}
          className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full transition-colors
            ${selected === t ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted-hover)]'}`}
        >
          {t}
        </button>
      ))}
    </div>
  )
}
