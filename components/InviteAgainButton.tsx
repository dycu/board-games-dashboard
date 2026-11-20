'use client'
import { useEffect, useMemo, useState } from 'react'
import { Platform, PLATFORM_SHORT_LABELS } from '@/lib/types'
import { globalOpponents, GlobalOpponent } from '@/lib/opponents/stats'
import { readFinishedGamesCache } from '@/hooks/useFinishedGamesData'
import { useOpponentsContext } from './OpponentsProvider'
import { SMALL_BUTTON } from './GameLink'

// Wherever the app hands off to actually creating a new game on some
// platform (Find a game's search results, a "new game" library listing, …),
// the next real question is who to invite — but nicknames only mean
// anything per platform, so this is scoped to one, and renders nothing (not
// even the button) when there's no opponent history for it yet. A popup
// rather than something inline, since several of these entry points are
// tight single-line rows with no room to spare, and it needs to look the
// same wherever it's dropped in.
//
// Reads whatever finished-games cache the browser already has (from a past
// Players/History visit) rather than triggering its own live fetch — same
// "cheap data only" boundary PlayerHoverCard draws.
export default function InviteAgainButton({ platform }: { platform: Platform }) {
  const { byPlatform } = useOpponentsContext()
  const [cache] = useState(() => readFinishedGamesCache())
  const opponents = useMemo(
    () => (byPlatform ? globalOpponents(cache?.games ?? [], byPlatform).filter(o => o.platform === platform && !o.hidden) : []),
    [byPlatform, cache, platform],
  )
  const [open, setOpen] = useState(false)

  if (opponents.length === 0) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Invite someone you've played with before"
        className={SMALL_BUTTON}
      >
        👥 Invite
      </button>
      {open && <InviteAgainModal platform={platform} opponents={opponents} onClose={() => setOpen(false)} />}
    </>
  )
}

function InviteAgainModal({ platform, opponents, onClose }: {
  platform: Platform
  opponents: GlobalOpponent[]
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-again-title"
        className="w-full max-w-sm max-h-[80vh] flex flex-col bg-[var(--bg-surface)] rounded-lg shadow-xl border border-[var(--border-default)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
          <h2 id="invite-again-title" className="text-sm font-semibold text-[var(--text-primary)] truncate">
            Invite again — {PLATFORM_SHORT_LABELS[platform] ?? platform}
          </h2>
          {selected.size > 0 && (
            <button
              onClick={() => copy([...selected].join(', '), '__selected__')}
              className="shrink-0 text-[11px] font-medium text-[var(--accent)] hover:underline"
            >
              {copied === '__selected__' ? 'Copied!' : `Copy ${selected.size}`}
            </button>
          )}
        </div>
        <ul className="flex-1 overflow-y-auto px-4 divide-y divide-[var(--border-subtle)]">
          {opponents.map(o => (
            <li key={o.name} className="flex items-center gap-2 py-2 text-sm">
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
                className="min-w-0 truncate text-left font-medium text-[var(--text-primary)] hover:text-[var(--accent)]"
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
              <span className="ml-auto shrink-0 text-xs text-[var(--text-tertiary)]">{o.games}×</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-end px-4 py-3 border-t border-[var(--border-subtle)]">
          <button
            onClick={onClose}
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
