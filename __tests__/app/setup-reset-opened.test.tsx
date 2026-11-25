import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SetupPage from '@/app/setup/page'
import { OPENED_KEY, writeStoredOpened } from '@/lib/dismissal'

beforeEach(() => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch
  localStorage.clear()
})

describe('Setup page: reset opened games', () => {
  it('clears the stored opened-games state, leaving nothing behind', async () => {
    writeStoredOpened({ 'bga:1': { openedAt: 1000 } })
    expect(localStorage.getItem(OPENED_KEY)).not.toBeNull()

    render(<SetupPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Reset opened games' }))

    expect(localStorage.getItem(OPENED_KEY)).toBeNull()
    expect(await screen.findByRole('button', { name: 'Reset!' })).toBeInTheDocument()
  })

  it('does nothing else — no network call beyond the page\'s own prefs load', async () => {
    render(<SetupPage />)
    const callsBefore = (global.fetch as jest.Mock).mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: 'Reset opened games' }))
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(callsBefore)
  })
})
