import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BacklogListChips from '@/components/BacklogListChips'

describe('BacklogListChips', () => {
  it('shows one chip per list, highlighting the ones the game is already in', () => {
    render(<BacklogListChips lists={['play', 'favorite']} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: 'Next to play' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Favorite' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Next to learn' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Solo' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('toggles a list on click, independent of the others', async () => {
    const onToggle = jest.fn()
    render(<BacklogListChips lists={['play']} onToggle={onToggle} />)
    await userEvent.click(screen.getByRole('button', { name: 'Favorite' }))
    expect(onToggle).toHaveBeenCalledWith('favorite')
  })

  it('disables every chip when adding', () => {
    render(<BacklogListChips lists={[]} onToggle={() => {}} disabled />)
    for (const name of ['Next to play', 'Next to learn', 'Solo', 'Favorite']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
  })

  it('names the game in the aria-label when given', () => {
    render(<BacklogListChips lists={[]} onToggle={() => {}} gameName="Gaia Project" />)
    expect(screen.getByRole('button', { name: 'Add Gaia Project to Next to play' })).toBeInTheDocument()
  })
})
