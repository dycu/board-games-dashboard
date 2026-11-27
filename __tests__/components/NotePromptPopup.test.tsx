import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NotePromptPopup from '@/components/NotePromptPopup'
import { Game } from '@/lib/types'

const game: Game = {
  id: 'yucata:1',
  platform: 'yucata',
  gameName: 'Navegador',
  myTurn: false,
  lastMoveAt: new Date('2026-06-24T10:00:00Z'),
  lastMoveAgo: 'just now',
  urgent: false,
  gameUrl: 'https://yucata.de/table/1',
  platformUrl: 'https://yucata.de',
  players: ['bob'],
}

const props = (over: Partial<Parameters<typeof NotePromptPopup>[0]> = {}) =>
  ({ game, onSave: () => {}, ...over })

async function expand() {
  await userEvent.click(screen.getByRole('button', { name: /Note for Navegador/ }))
}

describe('NotePromptPopup', () => {
  it('starts collapsed, as a chip naming the game', () => {
    render(<NotePromptPopup {...props()} />)
    expect(screen.getByRole('button', { name: /Note for Navegador/ })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the game name and the existing note on the collapsed chip itself, so it can be judged still fine without expanding', () => {
    render(<NotePromptPopup {...props({ note: 'take the north pass' })} />)
    const chip = screen.getByRole('button', { name: /Note for Navegador/ })
    expect(chip).toHaveTextContent('Navegador')
    expect(chip).toHaveTextContent('take the north pass')
    expect(chip).not.toHaveTextContent('Note for Navegador?')
  })

  it('expands to an empty, focused input when there is no existing note', async () => {
    render(<NotePromptPopup {...props()} />)
    await expand()
    const input = screen.getByRole('textbox', { name: /note for navegador/i })
    expect(input).toHaveValue('')
    expect(input).toHaveFocus()
  })

  it('pre-fills the existing note once expanded', async () => {
    render(<NotePromptPopup {...props({ note: 'take the north pass' })} />)
    await expand()
    expect(screen.getByRole('textbox')).toHaveValue('take the north pass')
  })

  // Plain .focus() alone leaves the cursor at the start of the existing
  // text (a browser default), so typing right away — especially with no
  // mouse click into the field to reposition it, e.g. right after Enter
  // opened this same popup — inserted before the note instead of
  // continuing it.
  it('places the cursor at the end of an existing note once expanded, not the start', async () => {
    render(<NotePromptPopup {...props({ note: 'take the north pass' })} />)
    await expand()
    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(input.selectionStart).toBe(input.value.length)
    expect(input.selectionEnd).toBe(input.value.length)
  })

  it('saves what was typed on Enter or the Save button', async () => {
    const onSave = jest.fn()
    render(<NotePromptPopup {...props({ onSave })} />)
    await expand()
    await userEvent.type(screen.getByRole('textbox'), 'go for trains{Enter}')
    expect(onSave).toHaveBeenCalledWith('go for trains')
  })

  it('is a multi-line textarea, with Shift+Enter inserting a newline instead of saving', async () => {
    const onSave = jest.fn()
    render(<NotePromptPopup {...props({ onSave })} />)
    await expand()
    const textarea = screen.getByRole('textbox')
    expect(textarea.tagName).toBe('TEXTAREA')
    await userEvent.type(textarea, 'go for trains{Shift>}{Enter}{/Shift}then castles')
    expect(onSave).not.toHaveBeenCalled()
    expect(textarea).toHaveValue('go for trains\nthen castles')
  })

  it('saves via the Save button without requiring Enter', async () => {
    const onSave = jest.fn()
    render(<NotePromptPopup {...props({ onSave })} />)
    await expand()
    await userEvent.type(screen.getByRole('textbox'), 'go for trains')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledWith('go for trains')
  })

  it('saves whatever is in the field on Escape and on an outside click', async () => {
    const onSave = jest.fn()
    const { unmount } = render(<NotePromptPopup {...props({ onSave })} />)
    await expand()
    await userEvent.type(screen.getByRole('textbox'), 'go for trains')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onSave).toHaveBeenCalledWith('go for trains')
    unmount()

    const onSave2 = jest.fn()
    render(<NotePromptPopup {...props({ onSave: onSave2 })} />)
    await expand()
    await userEvent.type(screen.getByRole('textbox'), 'go for trains')
    fireEvent.pointerDown(document.body)
    expect(onSave2).toHaveBeenCalledWith('go for trains')
  })

  it('does not save or close when clicking inside the panel itself', async () => {
    const onSave = jest.fn()
    render(<NotePromptPopup {...props({ onSave })} />)
    await expand()
    fireEvent.pointerDown(screen.getByRole('dialog'))
    expect(onSave).not.toHaveBeenCalled()
  })

  // Delete removes the note and closes; Clear only empties the field to
  // write a new one. Same two buttons as the editor in the game-page note
  // banner (game-notes-banner userscript).
  it('Delete removes the note and closes the editor, without needing the text cleared first', async () => {
    const onSave = jest.fn()
    render(<NotePromptPopup {...props({ note: 'take the north pass', onSave })} />)
    await expand()
    await userEvent.click(screen.getByRole('button', { name: /delete the note/i }))
    expect(onSave).toHaveBeenCalledWith('')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Clear empties the field but keeps the editor open and focused, saving nothing', async () => {
    const onSave = jest.fn()
    render(<NotePromptPopup {...props({ note: 'take the north pass', onSave })} />)
    await expand()
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(screen.getByRole('textbox')).toHaveFocus()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
    await userEvent.type(screen.getByRole('textbox'), 'new plan{Enter}')
    expect(onSave).toHaveBeenCalledWith('new plan')
  })

  it('offers no Clear button while the field is already empty', async () => {
    render(<NotePromptPopup {...props()} />)
    await expand()
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
  })

  it('offers no delete button when there is no existing note to delete', async () => {
    render(<NotePromptPopup {...props()} />)
    await expand()
    expect(screen.queryByRole('button', { name: /delete the note/i })).toBeNull()
  })

  it('expands on Enter from anywhere on the page, not just a click on the chip', () => {
    render(<NotePromptPopup {...props()} />)
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  // Moving focus into the textarea as a side effect of this same keydown
  // (above) makes the browser apply the key's own default action — insert
  // a newline — to wherever focus just landed, not to whatever was
  // focused when the key was actually pressed, unless that default action
  // is prevented outright.
  it('prevents the opening Enter\'s own default action, so it can\'t leak a newline into the textarea it just focused', () => {
    render(<NotePromptPopup {...props()} />)
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('does not expand on Enter while a text field elsewhere is focused — that keypress is theirs', () => {
    render(
      <>
        <input aria-label="elsewhere" />
        <NotePromptPopup {...props()} />
      </>,
    )
    screen.getByLabelText('elsewhere').focus()
    fireEvent.keyDown(screen.getByLabelText('elsewhere'), { key: 'Enter' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('dismisses the collapsed chip outright with its own close button, saving the draft unchanged', async () => {
    const onSave = jest.fn()
    render(<NotePromptPopup {...props({ note: 'take the north pass', onSave })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss note prompt' }))
    expect(onSave).toHaveBeenCalledWith('take the north pass')
  })

  it('fades itself away if left collapsed and ignored for a while', () => {
    jest.useFakeTimers()
    const onSave = jest.fn()
    render(<NotePromptPopup {...props({ onSave, shownAt: Date.now() })} />)
    jest.advanceTimersByTime(20_000)
    expect(onSave).toHaveBeenCalledWith('')
    jest.useRealTimers()
  })

  it('does not auto-dismiss once expanded — typing never races the clock', async () => {
    jest.useFakeTimers({ advanceTimers: true })
    const onSave = jest.fn()
    render(<NotePromptPopup {...props({ onSave, shownAt: Date.now() })} />)
    await expand()
    jest.advanceTimersByTime(20_000)
    expect(onSave).not.toHaveBeenCalled()
    jest.useRealTimers()
  })

  it('does not auto-dismiss at all when shownAt is unknown', () => {
    jest.useFakeTimers()
    const onSave = jest.fn()
    render(<NotePromptPopup {...props({ onSave })} />)
    jest.advanceTimersByTime(60_000)
    expect(onSave).not.toHaveBeenCalled()
    jest.useRealTimers()
  })

  // A plain setTimeout from mount would have been throttled for the whole
  // time the tab sat backgrounded (a game opened in a new tab), or reset to
  // zero by a same-tab navigation and back (BGA) — shownAt instead comes
  // from outside the component (lib/dismissal.ts's persisted movedSeenAt),
  // so the dismiss is already overdue the moment this re-mounts, however
  // long it's actually been.
  it('dismisses immediately on mount if shownAt is already well past the window', () => {
    const onSave = jest.fn()
    render(<NotePromptPopup {...props({ onSave, shownAt: Date.now() - 5 * 60_000 })} />)
    expect(onSave).toHaveBeenCalledWith('')
  })

  it('catches up the moment the tab regains visibility, instead of waiting for an unthrottled timer', () => {
    jest.useFakeTimers()
    const onSave = jest.fn()
    const shownAt = Date.now()
    render(<NotePromptPopup {...props({ onSave, shownAt })} />)

    // Simulates the tab sitting backgrounded well past the window without
    // its timer ever actually firing (throttled), then regaining focus
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    jest.setSystemTime(shownAt + 5 * 60_000)
    document.dispatchEvent(new Event('visibilitychange'))

    expect(onSave).toHaveBeenCalledWith('')
    jest.useRealTimers()
  })

  // Same editor as the note banner on game pages (game-notes-banner userscript):
  // ✕ in the corner closes without saving, deleting is a labelled button.
  it('closes the editor without saving with the ✕ in its corner, back to the banner', async () => {
    const onSave = jest.fn()
    render(<NotePromptPopup {...props({ note: 'take the north pass', onSave })} />)
    await expand()
    await userEvent.type(screen.getByRole('textbox'), ' and abandon this')
    await userEvent.click(screen.getByRole('button', { name: 'Close without saving' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onSave).not.toHaveBeenCalled()
    // back to the collapsed banner, still showing the unchanged note
    expect(screen.getByRole('button', { name: /Note for Navegador/ })).toHaveTextContent('take the north pass')
    await expand()
    expect(screen.getByRole('textbox')).toHaveValue('take the north pass')
  })

  it('labels the delete button "Delete" rather than a bare ✕', async () => {
    render(<NotePromptPopup {...props({ note: 'take the north pass' })} />)
    await expand()
    expect(screen.getByRole('button', { name: /delete the note/i })).toHaveTextContent('Delete')
  })
})
