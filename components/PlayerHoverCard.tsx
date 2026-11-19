'use client'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

const CARD_WIDTH = 224 // px — keep in sync with the w-56 class below

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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const coarse = usePointerIsCoarse()
  const triggerRef = useRef<HTMLAnchorElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const { byPlatform } = useOpponentsContext()
  const entry = byPlatform?.[platform]?.[name]
  const href = playerHref(platform, name)
  const median = entry ? medianResponseSeconds(entry.responseSamples) : null
  const cardAvatar = avatarUrl ?? entry?.avatarUrl

  // The card is portaled to <body> (see below) so an ancestor's `truncate`/
  // overflow-hidden — the "with {players}" line always has one — can't
  // clip it the way it would if it were just absolutely positioned inside
  // that line. Position computed from the trigger's own rect instead of
  // CSS anchoring, then, since there's no DOM relationship to anchor to
  // anymore.
  useLayoutEffect(() => {
    if (!open) return
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const left = Math.min(rect.left, window.innerWidth - CARD_WIDTH - 8)
    setPos({ top: rect.bottom + 4, left: Math.max(8, left) })
  }, [open])

  // Scrolling would leave the card pointing at empty space since its
  // position isn't continuously tracked — simplest correct behavior is to
  // just close it, the same as a mouse moving away would.
  useEffect(() => {
    if (!open) return
    const onScroll = () => setOpen(false)
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [open])

  // Touch has no "mouse left the area" to close on, so close on the next
  // tap anywhere outside the trigger AND the (portaled, so DOM-separate)
  // card instead.
  useEffect(() => {
    if (!open || !coarse) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || cardRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [open, coarse])

  return (
    <>
      <Link
        ref={triggerRef}
        href={href}
        className={`relative z-10 hover:text-[var(--accent)] hover:underline ${highlighted ? 'font-semibold text-[var(--text-primary)]' : ''} ${className ?? ''}`}
        onMouseEnter={() => !coarse && setOpen(true)}
        onMouseLeave={() => !coarse && setOpen(false)}
        onClick={e => { if (coarse) { e.preventDefault(); setOpen(o => !o) } }}
      >
        <PlayerAvatar url={avatarUrl} size={14} className="mr-1" />
        {name}
      </Link>
      {open && pos && createPortal(
        <div
          ref={cardRef}
          role="tooltip"
          onMouseEnter={() => !coarse && setOpen(true)}
          onMouseLeave={() => !coarse && setOpen(false)}
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-50 w-56 p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-lg text-xs"
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
        </div>,
        document.body,
      )}
    </>
  )
}
