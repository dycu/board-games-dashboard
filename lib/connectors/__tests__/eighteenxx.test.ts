/**
 * @jest-environment node
 */
import { fetchEighteenXX, fetchFinishedEighteenXX } from '../eighteenxx'

const BASE = 'https://18xx.games'

const ACTIVE_GAME = {
  id: 100,
  title: '18Chesapeake',
  status: 'active',
  updated_at: '2026-01-15T10:00:00Z',
  players: [{ id: 42, name: 'Dycu' }, { id: 99, name: 'Other' }],
  acting: [42],
}

const FINISHED_GAME = {
  id: 200,
  title: '1830',
  status: 'finished',
  updated_at: '2026-01-10T10:00:00Z',
  players: [{ id: 42, name: 'Dycu' }, { id: 99, name: 'Other' }],
  acting: [],
}

function mockFetch(...responses: Array<{ ok: boolean; status?: number; data: unknown }>) {
  let call = 0
  global.fetch = jest.fn().mockImplementation(() => {
    const r = responses[call++] ?? responses[responses.length - 1]
    return Promise.resolve({
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 401),
      headers: { get: () => null },
      json: async () => r.data,
      text: async () => JSON.stringify(r.data),
    } as unknown as Response)
  })
}

afterEach(() => {
  jest.restoreAllMocks()
})

describe('fetchEighteenXX — session cookie path', () => {
  it('calls /api/user then /api/game/user with cookie, skipping login', async () => {
    mockFetch(
      { ok: true, data: { user: { id: 42, name: 'Dycu' } } },   // /api/user
      { ok: true, data: [ACTIVE_GAME] },                          // /api/game/user
    )

    const games = await fetchEighteenXX('', '', 'session_abc')

    expect(global.fetch).toHaveBeenCalledTimes(2)
    const [firstCall, secondCall] = (global.fetch as jest.Mock).mock.calls
    expect(firstCall[0]).toBe(`${BASE}/api/user`)
    expect(firstCall[1].headers).toMatchObject({ Cookie: 'session_abc' })
    expect(secondCall[0]).toBe(`${BASE}/api/game/user`)
    expect(secondCall[1].headers).toMatchObject({ Cookie: 'session_abc' })
    expect(games).toHaveLength(1)
    expect(games[0].id).toBe('eighteenxx:100')
    expect(games[0].myTurn).toBe(true)
  })

  it('throws descriptive error when cookie is expired (401 on /api/user)', async () => {
    mockFetch({ ok: false, status: 401, data: {} })

    await expect(fetchEighteenXX('', '', 'expired_cookie')).rejects.toThrow(
      '18xx.games session cookie is invalid or expired — update it in Settings'
    )
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('falls back to login flow when no cookie provided', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: (h: string) => h === 'set-cookie' ? 'sid=abc; Path=/' : null },
        json: async () => ({ user: { id: 42 } }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        json: async () => [ACTIVE_GAME],
      } as unknown as Response)

    const games = await fetchEighteenXX('user', 'pass')

    const firstUrl = (global.fetch as jest.Mock).mock.calls[0][0]
    expect(firstUrl).toBe(`${BASE}/api/user/login`)
    expect(games).toHaveLength(1)
  })
})

describe('fetchFinishedEighteenXX — session cookie path', () => {
  it('uses cookie directly and returns finished games', async () => {
    mockFetch(
      { ok: true, data: { user: { id: 42, name: 'Dycu' } } },
      { ok: true, data: [FINISHED_GAME, ACTIVE_GAME] },
    )

    const games = await fetchFinishedEighteenXX('', '', 'session_abc')

    expect(games).toHaveLength(1)
    expect(games[0].id).toBe('eighteenxx:200')
  })

  it('throws descriptive error when cookie is expired', async () => {
    mockFetch({ ok: false, status: 401, data: {} })

    await expect(fetchFinishedEighteenXX('', '', 'bad_cookie')).rejects.toThrow(
      '18xx.games session cookie is invalid or expired — update it in Settings'
    )
  })
})
