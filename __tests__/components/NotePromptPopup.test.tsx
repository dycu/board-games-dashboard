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
  ({ game, onSave: () => {}, onDelete: () => {}, onDismiss: () => {}, ...over })

describe('NotePromptPopup', () => {
  it('shows the game name and an empty, focused input when there is no existing note', () => {
    render(<NotePromptPopup {...props()} />)
    expect(screen.getByText('Navegador')).toBeInTheDocument()
    const input = screen.getByRole('textbox', { name: /note for navegador/i })
    expect(input).toHaveValue('')
    expect(input).toHaveFocus()
  })

  it('pre-fills the existing note', () => {
    render(<NotePromptPopup {...props({ note: 'take the north pass' })} />)
    expect(screen.getByRole('textbox')).toHaveValue('take the north pass')
  })

  it('saves what was typed on Enter or the Save button', async () => {
    const onSave = jest.fn()
    render(<NotePromptPopup {...props({ onSave })} />)
    await userEvent.type(screen.getByRole('textbox'), 'go for trains{Enter}')
    expect(onSave).toHaveBeenCalledWith('go for trains')
  })

  it('is a multi-line textarea, with Shift+Enter inserting a newline instead of saving', async () => {
    const onSave = jest.fn()
    render(<NotePromptPopup {...props({ onSave })} />)
    const textarea = screen.getByRole('textbox')
    expect(textarea.tagName).toBe('TEXTAREA')
    await userEvent.type(textarea, 'go for trains{Shift>}{Enter}{/Shift}then castles')
    expect(onSave).not.toHaveBeenCalled()
    expect(textarea).toHaveValue('go for trains\nthen castles')
  })

  it('saves via the Save button without requiring Enter', async () => {
    const onSave = jest.fn()
    render(<NotePromptPopup {...props({ onSave })} />)
    await userEvent.type(screen.getByRole('textbox'), 'go for trains')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledWith('go for trains')
  })

  it('dismisses without saving on Skip, on Escape, and on a backdrop click', async () => {
    const onDismiss = jest.fn()
    const { unmount } = render(<NotePromptPopup {...props({ onDismiss })} />)
    await userEvent.click(screen.getByRole('button', { name: /skip/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    unmount()

    const onDismiss2 = jest.fn()
    render(<NotePromptPopup {...props({ onDismiss: onDismiss2 })} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onDismiss2).toHaveBeenCalledTimes(1)
  })

  it('does not close when clicking inside the dialog itself', async () => {
    const onDismiss = jest.fn()
    render(<NotePromptPopup {...props({ onDismiss })} />)
    await userEvent.click(screen.getByRole('dialog'))
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('deletes the existing note with its own button, without requiring the text to be cleared first', async () => {
    const onDelete = jest.fn()
    render(<NotePromptPopup {...props({ note: 'take the north pass', onDelete })} />)
    await userEvent.click(screen.getByRole('button', { name: /delete the note/i }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('clears the input on delete, but does not close the popup — unlike Skip/Save', async () => {
    const onDismiss = jest.fn()
    render(<NotePromptPopup {...props({ note: 'take the north pass', onDismiss })} />)
    await userEvent.click(screen.getByRole('button', { name: /delete the note/i }))
    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('keeps the input focused after deleting, so a replacement can be typed right away', async () => {
    render(<NotePromptPopup {...props({ note: 'take the north pass' })} />)
    await userEvent.click(screen.getByRole('button', { name: /delete the note/i }))
    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  it('offers no delete button when there is no existing note to delete', () => {
    render(<NotePromptPopup {...props()} />)
    expect(screen.queryByRole('button', { name: /delete the note/i })).toBeNull()
  })
})
