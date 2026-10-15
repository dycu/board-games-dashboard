jest.mock('@vercel/kv', () => ({ kv: { hgetall: jest.fn(), hset: jest.fn() } }))
jest.mock('../../connectors/eighteenxx', () => ({
  BASE: 'https://18xx.games',
  loginEighteenxx: jest.fn(),
  fetchProfileGames: jest.fn(),
}))

import { kv } from '@vercel/kv'
import { loginEighteenxx, fetchProfileGames } from '../../connectors/eighteenxx'
import { syncEighteenxx } from '../sync'

const mockFetch = jest.fn()
global.fetch = mockFetch
const mockLogin = loginEighteenxx as jest.Mock
const mockProfileGames = fetchProfileGames as jest.Mock
const mockHgetall = kv.hgetall as jest.Mock
const mockHset = kv.hset as jest.Mock

const jsonRes = (body: any, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body })

describe('syncEighteenxx', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockLogin.mockReset().mockResolvedValue('auth_token=abc')
    mockProfileGames.mockReset().mockResolvedValue({ myId: 1, games: [] })
    mockHgetall.mockReset().mockResolvedValue({})
    mockHset.mockReset()
  })

  it('reads an action count for each active game and stores it keyed by id', async () => {
    mockFetch
      // /api/game/user
      .mockResolvedValueOnce(jsonRes({ games: [{ id: 10, title: '1846', status: 'active', players: [{ id: 1, name: 'me' }] }] }))
      // /api/game/10 detail
      .mockResolvedValueOnce(jsonRes({ actions: [1, 2, 3] }))

    const result = await syncEighteenxx('me', 'pass', undefined, 15000)
    expect(result).toEqual({ active: 1, finished: 0, read: 1 })
    expect(mockHset).toHaveBeenCalledWith('eighteenxxpace:v2:games', {
      '10': { id: '10', title: '1846', end: null, actionCount: 3, playerCount: 1, lastCheckedAt: expect.any(Number) },
    })
  })

  it('records the game\'s created_at as start, for the time-based progress fallback', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonRes({ games: [{ id: 10, title: '1846', status: 'active', created_at: 1700000000, players: [{ id: 1, name: 'me' }] }] }))
      .mockResolvedValueOnce(jsonRes({ actions: [1, 2, 3] }))

    await syncEighteenxx('me', 'pass', undefined, 15000)
    expect(mockHset).toHaveBeenCalledWith('eighteenxxpace:v2:games', {
      '10': { id: '10', title: '1846', end: null, actionCount: 3, playerCount: 1, start: 1700000000, lastCheckedAt: expect.any(Number) },
    })
  })

  it('never re-fetches a finished game that already has a recorded action count', async () => {
    mockHgetall.mockResolvedValue({ '20': { id: '20', title: '1846', end: 500, actionCount: 90 } })
    mockProfileGames.mockResolvedValue({
      myId: 1,
      games: [{ id: 20, title: '1846', status: 'finished', finished_at: 500, players: [{ id: 1, name: 'me' }] }],
    })
    mockFetch.mockResolvedValueOnce(jsonRes({ games: [] })) // /api/game/user: nothing active

    const result = await syncEighteenxx('me', 'pass', undefined, 15000)
    expect(result).toEqual({ active: 0, finished: 1, read: 0 })
    // Only the games-list call — no per-game detail fetch for the already-cached finished game
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('records lastError without discarding a previously-read action count on failure', async () => {
    mockHgetall.mockResolvedValue({ '10': { id: '10', title: '1846', end: null, actionCount: 55, playerCount: 4 } })
    mockFetch
      .mockResolvedValueOnce(jsonRes({ games: [{ id: 10, title: '1846', status: 'active', players: [{ id: 1, name: 'me' }] }] }))
      .mockResolvedValueOnce(jsonRes({}, false)) // detail fetch fails

    await syncEighteenxx('me', 'pass', undefined, 15000)
    expect(mockHset).toHaveBeenCalledWith('eighteenxxpace:v2:games', {
      '10': { id: '10', title: '1846', end: null, actionCount: 55, playerCount: 4, lastError: 'HTTP 500', lastCheckedAt: expect.any(Number) },
    })
  })

  it('freezes a game that fell out of the active list as finished', async () => {
    mockHgetall.mockResolvedValue({ '30': { id: '30', title: '1846', end: null, actionCount: 70 } })
    mockFetch.mockResolvedValueOnce(jsonRes({ games: [] })) // no longer active
    mockProfileGames.mockResolvedValue({ myId: 1, games: [] }) // not yet showing in the profile page either

    await syncEighteenxx('me', 'pass', undefined, 15000)
    expect(mockHset).toHaveBeenCalledWith('eighteenxxpace:v2:games', {
      '30': { id: '30', title: '1846', end: expect.any(Number), actionCount: 70 },
    })
  })

  it('propagates the "player not found" error from resolving the session', async () => {
    mockProfileGames.mockRejectedValue(new Error('18xx.games: player "nobody" not found in any game — set EIGHTEENXX_USER_ID'))
    await expect(syncEighteenxx('nobody', 'pass', undefined, 15000)).rejects.toThrow('not found in any game')
  })
})
