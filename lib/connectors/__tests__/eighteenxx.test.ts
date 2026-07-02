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

const OTHER_USER_GAME = {
  id: 300,
  title: 'Other Game',
  status: 'active',
  updated_at: '2026-01-15T10:00:00Z',
  players: [{ id: 77, name: 'Player1' }, { id: 88, name: 'Player2' }],
  acting: [77],
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
  it('calls /api/game/user with auth_token cookie, filters to Dycu games only', async () => {
    mockFetch({ ok: true, data: { games: [ACTIVE_GAME, OTHER_USER_GAME] } })

    const games = await fetchEighteenXX('Dycu', '', 'session_abc')

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [call] = (global.fetch as jest.Mock).mock.calls
    expect(call[0]).toBe(`${BASE}/api/game/user`)
    expect(call[1].headers).toMatchObject({ Cookie: 'auth_token=session_abc' })
    expect(games).toHaveLength(1)
    expect(games[0].id).toBe('eighteenxx:100')
    expect(games[0].myTurn).toBe(true)
  })

  it('accepts a cookie that already includes the name= prefix', async () => {
    mockFetch({ ok: true, data: { games: [ACTIVE_GAME] } })

    await fetchEighteenXX('Dycu', '', 'auth_token=session_abc')

    const [call] = (global.fetch as jest.Mock).mock.calls
    expect(call[1].headers).toMatchObject({ Cookie: 'auth_token=session_abc' })
  })

  it('throws descriptive error when cookie is expired (non-ok response from /api/game/user)', async () => {
    mockFetch({ ok: false, status: 401, data: {} })

    await expect(fetchEighteenXX('Dycu', '', 'expired_cookie')).rejects.toThrow(
      '18xx.games session cookie is invalid or expired — update it in Settings'
    )
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('throws descriptive error when username not found in any game', async () => {
    mockFetch({ ok: true, data: { games: [OTHER_USER_GAME] } })

    await expect(fetchEighteenXX('Dycu', '', 'session_abc')).rejects.toThrow(
      'player "Dycu" not found'
    )
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
        json: async () => ({ games: [ACTIVE_GAME] }),
      } as unknown as Response)

    const games = await fetchEighteenXX('Dycu', 'pass')

    const firstUrl = (global.fetch as jest.Mock).mock.calls[0][0]
    expect(firstUrl).toBe(`${BASE}/api/user/login`)
    expect(games).toHaveLength(1)
  })
})

describe('fetchFinishedEighteenXX — session cookie path', () => {
  it('uses cookie directly and returns finished games only', async () => {
    mockFetch({ ok: true, data: { games: [FINISHED_GAME, ACTIVE_GAME] } })

    const games = await fetchFinishedEighteenXX('Dycu', '', 'session_abc')

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(games).toHaveLength(1)
    expect(games[0].id).toBe('eighteenxx:200')
  })

  it('throws descriptive error when cookie is expired', async () => {
    mockFetch({ ok: false, status: 401, data: {} })

    await expect(fetchFinishedEighteenXX('Dycu', '', 'bad_cookie')).rejects.toThrow(
      '18xx.games session cookie is invalid or expired — update it in Settings'
    )
  })
})
