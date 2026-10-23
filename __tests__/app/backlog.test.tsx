import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BacklogPage from '@/app/backlog/page'

function mockFetch() {
  global.fetch = jest.fn(async (url: string) => {
    if (url === '/api/prefs') return { ok: true, json: async () => ({}) }
    if (url === '/api/backlog') return { ok: true, json: async () => ({ items: [] }) }
    if (url.startsWith('/api/game-search')) {
      return {
        ok: true,
        json: async () => ({
          results: [
            { platform: 'bga', matches: [{ name: 'Wingspan', url: 'https://boardgamearena.com/wingspan' }] },
            { platform: 'tabletapas', matches: [{ name: 'Indonesia', url: 'https://play.tabletapasgames.com/library' }] },
          ],
          errors: [],
        }),
      }
    }
    return { ok: true, json: async () => ({}) }
  }) as unknown as typeof fetch
}

describe('BacklogPage search — TableTapas', () => {
  beforeEach(() => mockFetch())

  async function searchFor(text: string) {
    // Both panels are always mounted (the inactive one just CSS-hidden), so
    // "Search" names both the source-tab pill and the panel's own submit
    // button — the tab pill comes first in document order.
    await userEvent.click(screen.getAllByRole('button', { name: 'Search' })[0])
    await userEvent.type(screen.getByPlaceholderText('Game name…'), `${text}{Enter}`)
  }

  it('is hidden from results until its own chip is turned on', async () => {
    render(<BacklogPage />)
    await searchFor('a')
    expect(await screen.findByText('Wingspan')).toBeInTheDocument()
    expect(screen.queryByText('Indonesia')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'TblTapas' }))
    expect(await screen.findByText('Indonesia')).toBeInTheDocument()
  })

  it('shows only a play link for a TableTapas match, no backlog chips or history link', async () => {
    render(<BacklogPage />)
    await userEvent.click(screen.getByRole('button', { name: 'TblTapas' }))
    await searchFor('a')

    const row = (await screen.findByText('Indonesia')).closest('li')!
    expect(row).toHaveTextContent('Play ↗')
    expect(row.querySelector('a[href="https://play.tabletapasgames.com/library"]')).not.toBeNull()
    expect(row.querySelector('[aria-label*="Favorite"]')).toBeNull()

    // The real-platform row right next to it still gets the full treatment
    const bgaRow = screen.getByText('Wingspan').closest('li')!
    expect(bgaRow.querySelector('[aria-label*="Favorite"]')).not.toBeNull()
  })
})
