'use client'
import { useMemo, useState } from 'react'
import { Platform } from '@/lib/types'
import { globalOpponents } from '@/lib/opponents/stats'
import { readFinishedGamesCache } from '@/hooks/useFinishedGamesData'
import { useOpponentsContext } from './OpponentsProvider'

// Right where "Find a game" hands off to actually creating one (its "Open →"
// link), the next thing you need is who to invite — but nicknames are only
// meaningful per platform, so this is scoped to one. Reads whatever
// finished-games cache the browser already has (from a past Players/History
// visit) rather than triggering its own live fetch — same "cheap data only"
// boundary PlayerHoverCard draws — so it's either there already or this
// quietly renders nothing instead of adding a slow fetch to this page.
export default function InviteAgainPicker({ platform }: { platform: Platform }) {
  const { byPlatform } = useOpponentsContext()
  // Read once per mount — a stale cache is still useful here, and this isn't
  // meant to track live changes while the page sits open.
  const [cache] = useState(() => readFinishedGamesCache())
  const opponents = useMemo(
    () => (byPlatform ? globalOpponents(cache?.games ?? [], byPlatform).filter(o => o.platform === platform && !o.hidden) : []),
    [byPlatform, cache, platform],
  )

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)

  if (opponents.length === 0) return null

  const toggle = (name: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    return next
  })

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied(c => (c === label ? null : c)), 1500)
    } catch {
      // clipboard access denied/unavailable — nothing more to do here
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--text-tertiary)]">Invite again</p>
        {selected.size > 0 && (
          <button
            onClick={() => copy([...selected].join(', '), '__selected__')}
            className="text-[11px] font-medium text-[var(--accent)] hover:underline"
          >
            {copied === '__selected__' ? 'Copied!' : `Copy ${selected.size} selected`}
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
        {opponents.map(o => (
          <div key={o.name} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={selected.has(o.name)}
              onChange={() => toggle(o.name)}
              aria-label={`Select ${o.name}`}
              className="shrink-0"
            />
            <button
              type="button"
              onClick={() => copy(o.name, o.name)}
              title="Copy nickname"
              className="min-w-0 truncate font-medium text-[var(--text-primary)] hover:text-[var(--accent)]"
            >
              {copied === o.name ? 'Copied!' : o.name}
            </button>
            {o.tags.length > 0 && (
              <span className="flex gap-1 shrink-0">
                {o.tags.slice(0, 3).map(t => (
                  <span key={t} className="text-[10px] font-medium px-1.5 py-px rounded-full bg-[var(--accent-tint)] text-[var(--accent)]">{t}</span>
                ))}
              </span>
            )}
            <span className="ml-auto shrink-0 text-[var(--text-tertiary)]">{o.games}×</span>
          </div>
        ))}
      </div>
    </div>
  )
}
