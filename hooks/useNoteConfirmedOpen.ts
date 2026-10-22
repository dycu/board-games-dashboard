'use client'
import { useState } from 'react'
import { Game } from '@/lib/types'

// Clicking straight into a game is the easiest way to miss a note written
// for it (the plan for this round) — this intercepts the open, however it
// was triggered (a plain click or a middle-click, which normally target
// different tabs), and makes the note something you have to act on before
// the link is actually followed. A game with no note opens exactly as
// before — zero extra friction. `target` is whatever the link's own
// target would be (see GameCard's openTarget); passed in rather than
// computed here to avoid a circular import with components/GameCard.tsx.
export function useNoteConfirmedOpen(game: Game | undefined, target: string, note: string | undefined, onOpen: () => void) {
  const [pendingTarget, setPendingTarget] = useState<string | null>(null)

  const onClick = (e: React.MouseEvent) => {
    if (!game || !note) { onOpen(); return }
    e.preventDefault()
    setPendingTarget(target)
  }

  // Middle-click always opens a new tab regardless of the link's own
  // target (that's the point of middle-clicking) — preserved once
  // confirmed, even for BGA (whose target is otherwise "_self").
  const onAuxClick = (e: React.MouseEvent) => {
    if (!game || e.button !== 1 || !note) { onOpen(); return }
    e.preventDefault()
    setPendingTarget('_blank')
  }

  const confirm = () => {
    if (game && pendingTarget) window.open(game.gameUrl, pendingTarget, 'noopener,noreferrer')
    onOpen()
    setPendingTarget(null)
  }
  const cancel = () => setPendingTarget(null)

  return { onClick, onAuxClick, pendingTarget, confirm, cancel }
}
