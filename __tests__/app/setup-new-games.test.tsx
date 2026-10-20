import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SetupPage from '@/app/setup/page'

beforeEach(() => {
  global.fetch = jest.fn(async (url: RequestInfo | URL) => {
    if (url === '/api/prefs') return { ok: true, json: async () => ({}) } as Response
    return { ok: true, json: async () => ({}) } as Response
  }) as unknown as typeof fetch
})

describe('Setup page: New games check', () => {
  it('runs the real check on demand and reports what it found', async () => {
    const result = {
      events: [
        { id: 'bga:1:new', at: '2026-10-20T17:00:00Z', source: 'bga', platform: 'bga', kind: 'new', name: 'Hundo', url: 'https://x', status: 'alpha' },
        { id: 'bga:2:new', at: '2026-10-20T17:00:00Z', source: 'bga', platform: 'bga', kind: 'new', name: 'Riviera', url: 'https://x', status: 'alpha' },
      ],
      counts: { bga: 1700 },
      errors: {},
      baseline: [],
      email: { sent: true },
    }
    global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (url === '/api/new-games/sync' && init?.method === 'POST') return { ok: true, json: async () => result } as Response
      return { ok: true, json: async () => ({}) } as Response
    }) as unknown as typeof fetch

    render(<SetupPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Check now' }))

    expect(await screen.findByText(/Found 2 items: Hundo, Riviera\. Email sent\./)).toBeInTheDocument()
  })

  it('says so when nothing new was found', async () => {
    global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (url === '/api/new-games/sync' && init?.method === 'POST') {
        return { ok: true, json: async () => ({ events: [], counts: {}, errors: {}, baseline: [] }) } as Response
      }
      return { ok: true, json: async () => ({}) } as Response
    }) as unknown as typeof fetch

    render(<SetupPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Check now' }))

    expect(await screen.findByText('No new games or changes found.')).toBeInTheDocument()
  })

  it('surfaces a source error without hiding anything else that was found', async () => {
    global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (url === '/api/new-games/sync' && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            events: [{ id: 'bga:1:new', at: '', source: 'bga', platform: 'bga', kind: 'new', name: 'Hundo', url: 'https://x' }],
            counts: {}, baseline: [], errors: { rally: 'timed out' },
          }),
        } as Response
      }
      return { ok: true, json: async () => ({}) } as Response
    }) as unknown as typeof fetch

    render(<SetupPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Check now' }))

    expect(await screen.findByText(/Found 1 item: Hundo\./)).toBeInTheDocument()
    expect(screen.getByText(/rally: timed out/)).toBeInTheDocument()
  })

  it('shows an error if the check endpoint itself fails', async () => {
    global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (url === '/api/new-games/sync' && init?.method === 'POST') {
        return { ok: true, json: async () => ({ error: 'BGA_USERNAME not set' }) } as Response
      }
      return { ok: true, json: async () => ({}) } as Response
    }) as unknown as typeof fetch

    render(<SetupPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Check now' }))

    expect(await screen.findByText(/BGA_USERNAME not set/)).toBeInTheDocument()
  })
})
