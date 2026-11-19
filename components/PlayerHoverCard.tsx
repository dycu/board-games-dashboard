'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Platform } from '@/lib/types'
import { playerHref, medianResponseSeconds } from '@/lib/opponents/stats'
import { formatDuration } from '@/lib/connectors/utils'
import { useOpponentsContext } from './OpponentsProvider'
import PlayerAvatar from './PlayerAvatar'

// Touch devices have no hover at all, so they can't use it as a "peek"
// gesture the way a mouse can — matched-media (not a click heuristic) so
// it reacts correctly if a hybrid device's input changes mid-session.
function usePointerIsCoarse(): boolean {
  const [coarse, setCoarse] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    const update = () => setCoarse(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return coarse
}

// A player's name, clickable like before, but now also a peek at who they
// are: on a mouse, hovering opens a small card (tags, typical reply time,
// a bigger avatar) without disturbing the click-to-open-their-page
// behavior everywhere already relies on. On touch, there's no hover to
// repurpose, so tapping the name opens the same card instead of
// navigating — the only way to actually get to their page from here on
// touch is the explicit link inside the card.
export default function PlayerHoverCard({ platform, name, avatarUrl, highlighted, className }: {
  platform: Platform; name: string; avatarUrl?: string; highlighted?: boolean; className?: string
}) {
  const [open, setOpen] = useState(false)
  const coarse = usePointerIsCoarse()
  const rootRef = useRef<HTMLSpanElement>(null)
  const { byPlatform } = useOpponentsContext()
  const entry = byPlatform?.[platform]?.[name]
  const href = playerHref(platform, name)
  const median = entry ? medianResponseSeconds(entry.responseSamples) : null
  const cardAvatar = avatarUrl ?? entry?.avatarUrl

  // Touch has no "mouse left the area" to close on, so close on the next
  // tap anywhere outside the card instead.
  useEffect(() => {
    if (!open || !coarse) return
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [open, coarse])

  return (
    <span ref={rootRef} className="relative inline-block">
      <Link
        href={href}
        className={`relative z-10 hover:text-[var(--accent)] hover:underline ${highlighted ? 'font-semibold text-[var(--text-primary)]' : ''} ${className ?? ''}`}
        onMouseEnter={() => !coarse && setOpen(true)}
        onMouseLeave={() => !coarse && setOpen(false)}
        onClick={e => { if (coarse) { e.preventDefault(); setOpen(o => !o) } }}
      >
        <PlayerAvatar url={avatarUrl} size={14} />
        {name}
      </Link>
      {open && (
        <div
          role="tooltip"
          onMouseEnter={() => !coarse && setOpen(true)}
          onMouseLeave={() => !coarse && setOpen(false)}
          className="absolute z-20 top-full left-0 mt-1 w-56 p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-lg text-xs"
        >
          <div className="flex items-center gap-2 mb-2">
            <PlayerAvatar url={cardAvatar} size={32} />
            <span className="font-semibold text-sm text-[var(--text-primary)] truncate">{name}</span>
          </div>
          {entry && entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {entry.tags.map(t => (
                <span key={t} className="text-[10px] font-medium px-1.5 py-px rounded-full bg-[var(--accent-tint)] text-[var(--accent)]">{t}</span>
              ))}
            </div>
          )}
          {median != null && (
            <p className="text-[var(--text-tertiary)] mb-2">Typically replies in ~{formatDuration(median)}</p>
          )}
          <Link href={href} className="font-medium text-[var(--accent)] hover:underline">
            View profile →
          </Link>
        </div>
      )}
    </span>
  )
}
