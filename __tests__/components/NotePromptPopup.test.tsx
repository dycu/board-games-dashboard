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
  ({ game, onSave: () => {}, onDelete: () => {}, ...over })

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

  it('deletes the existing note with its own button, without requiring the text to be cleared first', async () => {
    const onDelete = jest.fn()
    render(<NotePromptPopup {...props({ note: 'take the north pass', onDelete })} />)
    await expand()
    await userEvent.click(screen.getByRole('button', { name: /delete the note/i }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('clears the input on delete, but does not close the popup — unlike Save', async () => {
    const onSave = jest.fn()
    render(<NotePromptPopup {...props({ note: 'take the north pass', onSave })} />)
    await expand()
    await userEvent.click(screen.getByRole('button', { name: /delete the note/i }))
    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('keeps the input focused after deleting, so a replacement can be typed right away', async () => {
    render(<NotePromptPopup {...props({ note: 'take the north pass' })} />)
    await expand()
    await userEvent.click(screen.getByRole('button', { name: /delete the note/i }))
    expect(screen.getByRole('textbox')).toHaveFocus()
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
})
