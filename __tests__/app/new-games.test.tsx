import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NewGamesPage from '@/app/new-games/page'

jest.mock('@/hooks/useBacklog', () => ({
  useBacklog: () => ({ items: [], error: null, listsFor: () => [], isAdding: () => false, toggleOrAdd: jest.fn() }),
}))

const event = (id: string, name: string, at = '2026-01-02T00:00:00Z') =>
  ({ id, at, source: 'bga', platform: 'bga', kind: 'new', name, url: `https://x/${id}` })

function mockFetchJson(routes: Record<string, unknown>) {
  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`
    const match = Object.keys(routes).find(k => key.startsWith(k))
    return { ok: true, json: async () => (match ? routes[match] : {}) } as Response
  }) as unknown as typeof fetch
}

describe('NewGamesPage', () => {
  it('shows every stored event, not just unseen ones', async () => {
    mockFetchJson({
      'GET /api/new-games?all=1': { events: [event('a', 'Hundo'), event('b', 'Riviera')] },
      'POST /api/new-games': { ok: true },
    })
    render(<NewGamesPage />)
    expect(await screen.findByText('Hundo')).toBeInTheDocument()
    expect(screen.getByText('Riviera')).toBeInTheDocument()
  })

  it('groups events under a day heading instead of one flat list', async () => {
    const today = new Date().toISOString()
    mockFetchJson({
      'GET /api/new-games?all=1': { events: [event('a', 'Hundo', today)] },
      'POST /api/new-games': { ok: true },
    })
    render(<NewGamesPage />)
    expect(await screen.findByText('Hundo')).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
  })

  it('marks everything shown as seen so the popup does not ask about it again', async () => {
    mockFetchJson({
      'GET /api/new-games?all=1': { events: [event('a', 'Hundo', '2026-01-02T00:00:00Z')] },
      'POST /api/new-games': { ok: true },
    })
    render(<NewGamesPage />)
    await screen.findByText('Hundo')
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/new-games', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ seenUpTo: '2026-01-02T00:00:00Z' }),
    })))
  })

  it('shows an empty state instead of a list when nothing has been found', async () => {
    mockFetchJson({ 'GET /api/new-games?all=1': { events: [] } })
    render(<NewGamesPage />)
    expect(await screen.findByText('Nothing found yet.')).toBeInTheDocument()
  })

  it('shows the load error instead of a silent empty list', async () => {
    mockFetchJson({ 'GET /api/new-games?all=1': { error: 'boom' } })
    render(<NewGamesPage />)
    expect(await screen.findByText(/boom/)).toBeInTheDocument()
  })

  it('"Check now" runs a fresh check and reloads the list', async () => {
    let found = false
    global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (url === '/api/new-games/sync' && init?.method === 'POST') {
        found = true
        return { ok: true, json: async () => ({ events: [event('a', 'Hundo')], counts: {}, errors: {}, baseline: [] }) } as Response
      }
      if (url === '/api/new-games' && init?.method === 'POST') return { ok: true, json: async () => ({ ok: true }) } as Response
      return { ok: true, json: async () => ({ events: found ? [event('a', 'Hundo')] : [] }) } as Response
    }) as unknown as typeof fetch

    render(<NewGamesPage />)
    await screen.findByText('Nothing found yet.')

    await userEvent.click(screen.getByRole('button', { name: /Check now/ }))

    expect(await screen.findByText('Hundo')).toBeInTheDocument()
    expect(screen.getByText(/found 1 new item/i)).toBeInTheDocument()
  })

  it('shows the check error without losing the already-loaded list', async () => {
    mockFetchJson({
      'GET /api/new-games?all=1': { events: [event('a', 'Hundo')] },
      'POST /api/new-games/sync': { error: 'rally library: no games found' },
      'POST /api/new-games': { ok: true },
    })
    render(<NewGamesPage />)
    await screen.findByText('Hundo')

    await userEvent.click(screen.getByRole('button', { name: /Check now/ }))

    expect(await screen.findByText(/rally library/)).toBeInTheDocument()
    expect(screen.getByText('Hundo')).toBeInTheDocument()
  })
})
