'use client'
import { useEffect, useRef, useState } from 'react'
import { Game } from '@/lib/types'

// How long the collapsed chip waits before fading itself away if ignored —
// long enough to actually notice it (a glance back at the dashboard right
// after a move), short enough that it doesn't linger as clutter once the
// moment's passed.
const AUTO_DISMISS_MS = 20_000

// Shown once a fetch made while actually back on the dashboard confirms a
// move landed (see lib/dismissal.ts's nextNotePrompt) — the moment the plan
// for next round is still fresh, and the one moment that's reliably true
// regardless of whether the game opened in this tab or a new one.
//
// A small corner chip, not a full-screen blocking dialog: most of the time
// there's nothing to actually write, and forcing a decision every single
// time — even a one-click dismissal — trained a "make it go away" reflex
// rather than an actual pause to think, and was the whole reason this
// existed. Collapsed, it just names the game and fades on its own if
// ignored (or is dismissed outright); tapping it expands to the same note
// field as before, now with no auto-dismiss once expanded, so actually
// writing something never races the clock. The collapsed chip is a plain
// (non-fixed) child of the shared NotificationTray (app/page.tsx), which
// does the actual corner positioning; the expanded panel still positions
// itself (see below, top not bottom).
export default function NotePromptPopup({ game, note, shownAt, onSave, onDelete }: {
  game: Game
  note?: string
  // When this prompt actually became due (Unix ms) — lib/dismissal.ts's
  // movedSeenAt, already persisted to localStorage for exactly this reason.
  // The auto-dismiss clock is computed from this, not just "20s after this
  // component happened to mount": a plain in-component timer either gets
  // throttled for minutes while the tab sits backgrounded (a game opened in
  // a new tab), or is wiped out and restarted from zero by a same-tab
  // navigation and back (BGA) — both left a long-stale chip waiting
  // indefinitely for a tick that was never coming.
  shownAt?: number
  onSave: (text: string) => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState(note ?? '')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Set right before the delete button below calls onDelete, so the
  // `note` prop update that causes (useNotes clearing it) doesn't bounce
  // through this same effect and collapse the very panel the deletion was
  // made from. This effect's job is an *external* note change — a
  // different game's prompt, or the note still arriving from useNotes'
  // own initial load — not one this component just caused itself.
  const justDeletedRef = useRef(false)

  // Resets to collapsed whenever the prompt switches to a different game,
  // and fills in the note if it's still loading (useNotes) when the popup
  // first opens
  useEffect(() => {
    if (justDeletedRef.current) { justDeletedRef.current = false; return }
    setExpanded(false)
    setDraft(note ?? '')
  }, [note, game.id])
  // Plain .focus() alone leaves the cursor at the very start of an
  // existing note (a browser default, not something either side chose),
  // so typing right away inserts before it instead of continuing it —
  // easy to miss with a mouse (a click into the field repositions it
  // anyway) but not with a keyboard-only flow (Enter to open, then type).
  useEffect(() => {
    if (!expanded) return
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [expanded, game.id])

  // Every way of closing (Escape, clicking outside, the Save button, the
  // collapsed chip's own dismiss, or it simply timing out) saves whatever's
  // in the field — there's no separate "discard my edit" path, since that
  // scenario doesn't come up in practice. Closing collapsed (nothing ever
  // typed) saves the draft unchanged, which is just the existing note, if
  // any — the point isn't the save itself, it's that this is what marks
  // the prompt handled (see dismissNotePrompt in app/page.tsx), so it
  // doesn't show again for this same move.
  const save = () => onSave(draft)
  const saveRef = useRef(save)
  useEffect(() => { saveRef.current = save })

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') saveRef.current() }
    const onPointerDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) saveRef.current()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [expanded])

  // On desktop, expanding shouldn't require reaching for the mouse: Enter
  // opens the chip from wherever focus happens to be, the same as clicking
  // it, as long as that isn't itself a field being typed into (a filter
  // box elsewhere on the page, say) — that keypress belongs to whatever's
  // actually focused, not to this chip sitting quietly in the corner.
  useEffect(() => {
    if (expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      // Without this, the same Enter press's own default action (insert a
      // newline) lands in the textarea anyway: moving focus into it mid-
      // keydown, below, makes the browser apply that default action to
      // wherever focus ends up, not to whatever was focused when the key
      // was actually pressed.
      e.preventDefault()
      setExpanded(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  // The collapsed chip fades on its own if ignored, timed from `shownAt`
  // rather than "now" — see that prop's own comment. Re-checked (and its
  // timer re-armed for whatever's actually left) the moment the tab regains
  // visibility or focus, not just on whatever cadence an unthrottled
  // setTimeout would otherwise tick at, so a chip left waiting through a
  // backgrounded tab resolves the instant the user is back rather than
  // whenever the browser next deigns to run it.
  useEffect(() => {
    if (expanded || shownAt === undefined) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const check = () => {
      if (timer) clearTimeout(timer)
      const remaining = shownAt + AUTO_DISMISS_MS - Date.now()
      if (remaining <= 0) { saveRef.current(); return }
      timer = setTimeout(check, remaining)
    }
    check()
    const onVisible = () => { if (!document.hidden) check() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [expanded, shownAt, game.id])

  // Just clears the saved note, without also closing the popup the way
  // Save does — deleting an old plan is a reason to write a fresh one, not
  // to walk away from the prompt entirely. Keeps the input focused (see
  // the delete button's onMouseDown below) so a replacement can be typed
  // right away, without the on-screen keyboard closing and reopening.
  const remove = () => { justDeletedRef.current = true; onDelete(); setDraft(''); inputRef.current?.focus() }

  if (!expanded) {
    return (
      <div className="flex items-start gap-1.5">
        <button
          onClick={() => setExpanded(true)}
          // Explicit aria-label: the visible content below is the note
          // itself once there is one, which would otherwise become the
          // accessible name in its place — a stable one matters more here
          // than usual, since this chip's whole point is to be found again
          // by its game, with or without an existing note.
          aria-label={`Note for ${game.gameName}`}
          className="max-w-[min(calc(100vw-4.5rem),20rem)] text-left text-xs bg-[var(--accent-tint)] text-[var(--text-primary)] border border-[var(--accent-border-hover)] rounded-xl px-3 py-1.5 shadow-sm hover:border-[var(--accent)]">
          {/* An existing note shown in full here (wrapping, not truncated —
              a long one should still be fully readable), not just "Note for
              X?" — the point is to let the current plan be judged still
              fine at a glance, without having to expand just to check. */}
          {note ? (
            <>
              <div className="font-medium">📝 {game.gameName}</div>
              <div className="italic text-[var(--text-secondary)] whitespace-normal break-words">{note}</div>
            </>
          ) : (
            <>📝 Note for {game.gameName}?</>
          )}
        </button>
        <button
          onClick={save}
          aria-label="Dismiss note prompt"
          title="Dismiss"
          className="shrink-0 text-[var(--icon-muted)] hover:text-[var(--text-primary)] bg-[var(--accent-tint)] border border-[var(--accent-border-hover)] rounded-full w-6 h-6 flex items-center justify-center shadow-sm text-xs leading-none">
          ✕
        </button>
      </div>
    )
  }

  return (
    // Top, not bottom, once there's a keyboard to type into: an on-screen
    // keyboard (phone, and especially a tablet in landscape) eats the
    // bottom portion of the viewport, which would otherwise sit right
    // behind the very field it's covering. The collapsed chip has no such
    // problem — nothing to type into yet — so it's free to live in the
    // tray at the bottom instead.
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby="note-prompt-title"
      className="fixed top-3 left-3 z-50 w-[calc(100vw-1.5rem)] max-w-sm bg-[var(--bg-surface)] rounded-lg shadow-xl border border-[var(--border-default)] p-4"
    >
      <h2 id="note-prompt-title" className="text-sm font-semibold text-[var(--text-primary)] mb-1">{game.gameName}</h2>
      <p className="text-xs text-[var(--text-tertiary)] mb-3">Plan for next round?</p>
      <textarea
        ref={inputRef}
        value={draft}
        maxLength={300}
        rows={3}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save() } }}
        placeholder="Note for this game…"
        aria-label={`Note for ${game.gameName}`}
        className="w-full text-sm bg-[var(--bg-surface)] text-[var(--text-primary)] px-2.5 py-1.5 rounded border border-[var(--accent)] mb-3 resize-none"
      />
      <div className="flex items-center justify-between gap-2">
        {note ? (
          <button
            onClick={remove}
            onMouseDown={e => e.preventDefault()}
            aria-label={`Delete the note on ${game.gameName}`}
            title="Delete note"
            className="text-xs text-[var(--icon-muted)] hover:text-red-500">
            ✕
          </button>
        ) : <span />}
        <button onClick={save} className="text-xs font-medium px-3 py-1.5 rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]">
          Save
        </button>
      </div>
    </div>
  )
}
