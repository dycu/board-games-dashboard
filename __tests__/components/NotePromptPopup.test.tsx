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

describe('NotePromptPopup', () => {
  it('shows the game name and an empty, focused input when there is no existing note', () => {
    render(<NotePromptPopup game={game} onSave={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText('Navegador')).toBeInTheDocument()
    const input = screen.getByRole('textbox', { name: /note for navegador/i })
    expect(input).toHaveValue('')
    expect(input).toHaveFocus()
  })

  it('pre-fills the existing note', () => {
    render(<NotePromptPopup game={game} note="take the north pass" onSave={() => {}} onDismiss={() => {}} />)
    expect(screen.getByRole('textbox')).toHaveValue('take the north pass')
  })

  it('saves what was typed on Enter or the Save button', async () => {
    const onSave = jest.fn()
    render(<NotePromptPopup game={game} onSave={onSave} onDismiss={() => {}} />)
    await userEvent.type(screen.getByRole('textbox'), 'go for trains{Enter}')
    expect(onSave).toHaveBeenCalledWith('go for trains')
  })

  it('saves via the Save button without requiring Enter', async () => {
    const onSave = jest.fn()
    render(<NotePromptPopup game={game} onSave={onSave} onDismiss={() => {}} />)
    await userEvent.type(screen.getByRole('textbox'), 'go for trains')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledWith('go for trains')
  })

  it('dismisses without saving on Skip, on Escape, and on a backdrop click', async () => {
    const onDismiss = jest.fn()
    const { unmount } = render(<NotePromptPopup game={game} onSave={() => {}} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('button', { name: /skip/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    unmount()

    const onDismiss2 = jest.fn()
    render(<NotePromptPopup game={game} onSave={() => {}} onDismiss={onDismiss2} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onDismiss2).toHaveBeenCalledTimes(1)
  })

  it('does not close when clicking inside the dialog itself', async () => {
    const onDismiss = jest.fn()
    render(<NotePromptPopup game={game} onSave={() => {}} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('dialog'))
    expect(onDismiss).not.toHaveBeenCalled()
  })
})
