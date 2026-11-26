import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NewGamesPopup from '@/components/NewGamesPopup'
import { subscribeNotices, dismissNotice } from '@/lib/notify'

const baseEvent = {
  id: 'bga:1:new', at: '2026-10-20T17:00:00Z', source: 'bga', platform: 'bga',
  kind: 'new', name: 'Hundo', url: 'https://x',
}

function mockFetch(opts: { events?: unknown[]; backlogFails?: boolean } = {}) {
  const { events = [baseEvent], backlogFails = false } = opts
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/new-games' && init?.method === 'POST') return { ok: true, json: async () => ({}) }
    if (url === '/api/new-games') return { ok: true, json: async () => ({ events }) }
    if (url === '/api/backlog' && init?.method === 'POST') {
      return backlogFails
        ? { ok: false, json: async () => ({ error: 'Server error 500' }) }
        : { ok: true, json: async () => ({ items: [] }) }
    }
    if (url === '/api/backlog') {
      // A real macrotask delay, not just a resolved promise — useBacklog
      // reloads via this same GET right after a failed add, and without an
      // actual gap here that reload's own setError(null) lands in the very
      // same React batch as the failed add's setError(message), so the
      // transient error state this test is about never gets its own render
      // to be observed in.
      await new Promise(r => setTimeout(r, 10))
      return { ok: true, json: async () => ({ items: [] }) }
    }
    return { ok: true, json: async () => ({}) }
  }) as unknown as typeof fetch
}

afterEach(() => {
  const unsubscribe = subscribeNotices(current => current.forEach(n => dismissNotice(n.id)))
  unsubscribe()
})

describe('NewGamesPopup', () => {
  it('renders nothing when there is nothing new', async () => {
    mockFetch({ events: [] })
    const { container } = render(<NewGamesPopup />)
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('starts collapsed to a chip naming the count, not the full list', async () => {
    mockFetch()
    render(<NewGamesPopup />)
    expect(await screen.findByRole('button', { name: /1 new item found/ })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('Hundo')).toBeNull()
  })

  it('expands to the full list on click', async () => {
    mockFetch()
    render(<NewGamesPopup />)
    await userEvent.click(await screen.findByRole('button', { name: /1 new item found/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Hundo')).toBeInTheDocument()
  })

  it('dismisses straight from the collapsed chip, without expanding first', async () => {
    mockFetch()
    render(<NewGamesPopup />)
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss new games notice' }))
    expect(screen.queryByRole('button', { name: /new item/ })).toBeNull()
  })

  it('reports a toast when adding to the backlog fails, since this popup has nowhere inline to show it', async () => {
    mockFetch({ backlogFails: true })
    render(<NewGamesPopup />)
    await userEvent.click(await screen.findByRole('button', { name: /1 new item found/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Next to play' }))

    await waitFor(() => {
      let messages: string[] = []
      const unsubscribe = subscribeNotices(current => { messages = current.map(n => n.message) })
      unsubscribe()
      expect(messages).toContain('Server error 500')
    })
  })
})
