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
// Not a full-screen blocking dialog: most of the time there's nothing to
// actually write, and forcing a decision every single time — even a
// one-click dismissal — trained a "make it go away" reflex rather than an
// actual pause to think, and was the whole reason this existed. But not a
// corner toast either, unlike the rest of the dashboard's ambient notices
// (NotificationTray) — this is the one notice that actually asks for a
// decision (even "nothing to add" is one), where the others are pure FYI,
// and a decision point that's easy to miss defeats its own purpose. That's
// the standard toast/snackbar (passive, transient, corner) vs. banner
// (needs a decision, stays until it gets one, full-width/top) split —
// collapsed, this renders as a banner pushing the page content down, not
// a floating overlay; tapping it expands to the same note field as
// before, now with no auto-dismiss once expanded, so actually writing
// something never races the clock.
export default function NotePromptPopup({ game, note, shownAt, onSave }: {
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
  // Saving empty text deletes the note (useNotes) — that's how Delete works
  onSave: (text: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState(note ?? '')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Resets to collapsed whenever the prompt switches to a different game,
  // and fills in the note if it's still loading (useNotes) when the popup
  // first opens. Done while rendering (React's "adjust state when a prop
  // changes" pattern) rather than in an effect.
  const resetKey = `${game.id}\u0000${note ?? ''}`
  const [lastResetKey, setLastResetKey] = useState(resetKey)
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey)
    setExpanded(false)
    setDraft(note ?? '')
  }
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

  // Two separate buttons, same as the editor in the game-page note banner
  // (game-notes-banner userscript): Delete removes the note and closes —
  // saving empty text is what deletes it, and saving is also what marks the
  // prompt handled. Clear only empties the field, saving nothing, and keeps
  // the cursor in it (see its onMouseDown) so a fresh plan can be typed right
  // away without the on-screen keyboard closing and reopening.
  const remove = () => { onSave(''); setExpanded(false) }
  const clear = () => { setDraft(''); inputRef.current?.focus() }

  if (!expanded) {
    return (
      <div className="w-full bg-[var(--accent-tint)] border-b border-[var(--accent-border-hover)]">
        <div className="flex items-center gap-3 px-3 sm:px-5 py-2">
          <button
            onClick={() => setExpanded(true)}
            // Explicit aria-label: the visible content below is the note
            // itself once there is one, which would otherwise become the
            // accessible name in its place — a stable one matters more here
            // than usual, since this banner's whole point is to be found
            // again by its game, with or without an existing note.
            aria-label={`Note for ${game.gameName}`}
            className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-left text-sm">
            {/* An existing note shown in full here (wrapping, not truncated
                — a long one should still be fully readable), not just "Note
                for X?" — the point is to let the current plan be judged
                still fine at a glance, without having to expand just to
                check. */}
            <span className="font-medium text-[var(--text-primary)]">
              📝 {note ? game.gameName : `Note for ${game.gameName}?`}
            </span>
            {note && <span className="italic text-[var(--text-secondary)] break-words">{note}</span>}
            <span className="text-[var(--accent)] text-xs font-medium">{note ? 'Edit ›' : 'Add a note ›'}</span>
          </button>
          <button
            onClick={save}
            aria-label="Dismiss note prompt"
            title="Dismiss"
            className="shrink-0 text-[var(--icon-muted)] hover:text-[var(--text-primary)] text-sm leading-none px-1">
            ✕
          </button>
        </div>
      </div>
    )
  }

  return (
    // Centered under the top banner above, not left-aligned — visually
    // "expanding from" where the banner sat, same reason the banner itself
    // sits at the top rather than a corner: an on-screen keyboard (phone,
    // and especially a tablet in landscape) eats the bottom portion of the
    // viewport, which would otherwise sit right behind the very field it's
    // covering.
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center px-3 pt-3">
      <div
        ref={panelRef}
        role="dialog"
        aria-labelledby="note-prompt-title"
        className="w-full max-w-sm bg-[var(--bg-surface)] rounded-lg shadow-xl border border-[var(--border-default)] p-4"
      >
        <div className="flex items-start gap-2 mb-1">
          <h2 id="note-prompt-title" className="flex-1 text-sm font-semibold text-[var(--text-primary)]">{game.gameName}</h2>
          {/* Closes without saving: the typed text is dropped and the banner
              collapses back, note unchanged — the one way out that doesn't
              save (Escape, clicking outside and Save all do). If the banner's
              own auto-dismiss window has already run out by then, collapsing
              lets it fade right away, still without changing the note. Same
              as the editor in the game-page note banner (game-notes-banner
              userscript). */}
          <button
            onClick={() => { setDraft(note ?? ''); setExpanded(false) }}
            aria-label="Close without saving"
            title="Close without saving"
            className="shrink-0 text-sm leading-none p-0.5 text-[var(--icon-muted)] hover:text-[var(--text-primary)]">
            ✕
          </button>
        </div>
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
        <div className="flex items-center gap-3">
          {note && (
            <button
              onClick={remove}
              aria-label={`Delete the note on ${game.gameName}`}
              title="Delete the note and close"
              className="text-xs text-[var(--text-tertiary)] hover:text-red-500">
              Delete
            </button>
          )}
          {draft && (
            <button
              onClick={clear}
              onMouseDown={e => e.preventDefault()}
              title="Empty the field to write a new note (nothing is saved yet)"
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
              Clear
            </button>
          )}
          <button onClick={save} className="ml-auto text-xs font-medium px-3 py-1.5 rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]">
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
