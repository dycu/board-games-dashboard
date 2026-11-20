'use client'
import { useEffect, useMemo, useState } from 'react'
import { Platform } from '@/lib/types'
import { gameOpponents, GameOpponent } from '@/lib/opponents/stats'
import { formatDuration } from '@/lib/connectors/utils'
import { readFinishedGamesCache } from '@/hooks/useFinishedGamesData'
import { useOpponentsContext } from './OpponentsProvider'
import { SMALL_BUTTON } from './GameLink'
import PlayerAvatar from './PlayerAvatar'

const fmtDate = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

// Wherever the app hands off to actually creating a new game (Find a game's
// search results, a "new game" library listing, a Play/Favorite/GM
// suggestion, …), the next real question is who to invite — scoped to this
// specific title, not just the platform, so it answers "who's played THIS
// with me" rather than "who do I know here at all". Renders nothing (not
// even the button) when there's no history for this title yet. A popup
// rather than something inline, since several of these entry points are
// tight single-line rows with no room to spare, and it needs to look the
// same wherever it's dropped in.
//
// Reads whatever finished-games cache the browser already has (from a past
// Players/History visit) rather than triggering its own live fetch — same
// "cheap data only" boundary PlayerHoverCard draws.
export default function InviteAgainButton({ platform, gameName }: { platform: Platform; gameName: string }) {
  const { byPlatform } = useOpponentsContext()
  const [cache] = useState(() => readFinishedGamesCache())
  const opponents = useMemo(
    () => (byPlatform ? gameOpponents(cache?.games ?? [], platform, gameName, byPlatform).filter(o => !o.hidden) : []),
    [byPlatform, cache, platform, gameName],
  )
  const [open, setOpen] = useState(false)

  if (opponents.length === 0) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Invite someone you've played ${gameName} with before`}
        className={SMALL_BUTTON}
      >
        👥 Invite
      </button>
      {open && <InviteAgainModal gameName={gameName} opponents={opponents} onClose={() => setOpen(false)} />}
    </>
  )
}

function InviteAgainModal({ gameName, opponents, onClose }: {
  gameName: string
  opponents: GameOpponent[]
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
            Invite again — {gameName}
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
          {opponents.map(o => {
            const competitive = o.iWon + o.theyWon > 0
            const details = [
              `${o.games}× together`,
              competitive && `${o.iWon}–${o.theyWon}`,
              o.lastPlayedAt && `last ${fmtDate(o.lastPlayedAt)}`,
              o.avgDurationDays != null && `~${formatDuration(o.avgDurationDays * 86400)} to finish`,
              o.medianResponseSeconds != null && `replies in ~${formatDuration(o.medianResponseSeconds)}`,
            ].filter(Boolean).join(' · ')
            return (
              <li key={o.name} className="flex items-center gap-2 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.has(o.name)}
                  onChange={() => toggle(o.name)}
                  aria-label={`Select ${o.name}`}
                  className="shrink-0"
                />
                <PlayerAvatar url={o.avatarUrl} size={20} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => copy(o.name, o.name)}
                      title="Copy nickname"
                      className="min-w-0 truncate text-left font-medium text-[var(--text-primary)] hover:text-[var(--accent)]"
                    >
                      {copied === o.name ? 'Copied!' : o.name}
                    </button>
                    {o.tags.slice(0, 3).map(t => (
                      <span key={t} className="text-[10px] font-medium px-1.5 py-px rounded-full bg-[var(--accent-tint)] text-[var(--accent)]">{t}</span>
                    ))}
                  </div>
                  <p className="text-[11px] text-[var(--text-tertiary)] truncate">{details}</p>
                </div>
              </li>
            )
          })}
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
