import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReadNotePopup from '@/components/ReadNotePopup'

const props = (over: Partial<Parameters<typeof ReadNotePopup>[0]> = {}) =>
  ({ gameName: 'Navegador', note: 'take the north pass', onConfirm: () => {}, onCancel: () => {}, ...over })

describe('ReadNotePopup', () => {
  it('shows the game name and note text', () => {
    render(<ReadNotePopup {...props()} />)
    expect(screen.getByText('Navegador')).toBeInTheDocument()
    expect(screen.getByText(/take the north pass/)).toBeInTheDocument()
  })

  it('confirms via the Play button', async () => {
    const onConfirm = jest.fn()
    render(<ReadNotePopup {...props({ onConfirm })} />)
    await userEvent.click(screen.getByRole('button', { name: /play/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('cancels on Cancel, on Escape, and on a backdrop click', async () => {
    const onCancel = jest.fn()
    const { unmount } = render(<ReadNotePopup {...props({ onCancel })} />)
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    unmount()

    const onCancel2 = jest.fn()
    render(<ReadNotePopup {...props({ onCancel: onCancel2 })} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel2).toHaveBeenCalledTimes(1)
  })

  it('does not close when clicking inside the dialog itself', async () => {
    const onCancel = jest.fn()
    render(<ReadNotePopup {...props({ onCancel })} />)
    await userEvent.click(screen.getByRole('dialog'))
    expect(onCancel).not.toHaveBeenCalled()
  })
})
