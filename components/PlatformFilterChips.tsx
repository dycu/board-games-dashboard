'use client'
import { Platform, PLATFORM_LABELS, PLATFORM_SHORT_LABELS, PLATFORM_URLS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'

// One shared platform-chip filter, used everywhere a list of games gets
// filtered by platform (the Active dashboard, History, Backlog's site
// picker, its Setup-page default). All three things the chips need to
// support, consistently:
//   - "All": every platform at once, one click
//   - picking an arbitrary subset: toggle platforms in one at a time
//   - dropping just one out of an otherwise-full selection: toggle it off
// `selected` is always the explicit resolved list (never an "empty means
// all" sentinel) — callers that store it that way (prefs.filter.platforms)
// translate at their own boundary; this component doesn't need to know.
interface Props {
  platforms: Platform[]                        // every chip to render, in this order
  selected: Platform[]                          // which of them are currently "on"
  onChange: (next: Platform[]) => void
  counts?: Partial<Record<Platform, number>>    // optional per-chip count, e.g. "BGA (12)"
  allLabel?: string                             // defaults to "All"
  allCount?: number                             // optional count on the "All" chip
  openLinks?: boolean                           // also show a small ↗ link to the platform's own site
  className?: string
}

export default function PlatformFilterChips({
  platforms, selected, onChange, counts, allLabel = 'All', allCount, openLinks, className,
}: Props) {
  if (platforms.length <= 1) return null

  const isOn = (p: Platform) => selected.includes(p)
  const allOn = platforms.every(isOn)
  const toggle = (p: Platform) => onChange(isOn(p) ? selected.filter(x => x !== p) : [...selected, p])

  return (
    <div className={`flex items-center gap-1.5 overflow-x-auto py-1 [scrollbar-width:none] ${className ?? ''}`}>
      <button
        onClick={() => onChange(allOn ? [] : platforms)}
        aria-pressed={allOn}
        title={allOn ? `Hide all` : `Show all`}
        className={`shrink-0 whitespace-nowrap text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors
          ${allOn ? 'bg-[#1a1a1a] text-white' : 'bg-[#f3f3f3] text-[#6b6b6b] hover:bg-[#ebebeb]'}`}>
        {allLabel}{allCount !== undefined ? ` (${allCount})` : ''}
      </button>
      {platforms.map(p => (
        <span
          key={p}
          className={`shrink-0 inline-flex items-center whitespace-nowrap text-[11px] font-bold uppercase tracking-wide rounded-full transition-opacity ${BADGE_COLORS[p] ?? 'bg-[#f3f3f3] text-[#6b6b6b]'}
            ${isOn(p) ? 'opacity-100' : 'opacity-40 hover:opacity-70'}`}>
          <button
            onClick={() => toggle(p)}
            aria-pressed={isOn(p)}
            title={isOn(p) ? `Hide ${PLATFORM_LABELS[p]}` : `Show ${PLATFORM_LABELS[p]}`}
            className={openLinks ? 'pl-2 pr-1 py-0.5 uppercase' : 'px-2 py-0.5 uppercase'}>
            {PLATFORM_SHORT_LABELS[p]}{counts?.[p] !== undefined ? ` (${counts[p]})` : ''}
          </button>
          {openLinks && (
            <a
              href={PLATFORM_URLS[p]}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${PLATFORM_LABELS[p]}`}
              title={`Open ${PLATFORM_LABELS[p]}`}
              className="pl-0.5 pr-2 py-0.5 opacity-70 hover:opacity-100">
              ↗
            </a>
          )}
        </span>
      ))}
    </div>
  )
}
