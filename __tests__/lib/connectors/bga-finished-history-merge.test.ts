jest.mock('@vercel/kv', () => ({ kv: { get: jest.fn(), set: jest.fn(), mget: jest.fn(), hgetall: jest.fn(), hset: jest.fn() } }))

import { kv } from '@vercel/kv'
import { fetchFinishedBGA } from '@/lib/connectors/bga'

const mockFetch = jest.fn()
global.fetch = mockFetch
const mockHgetall = kv.hgetall as jest.Mock
const mockMget = kv.mget as jest.Mock

const TOKEN = 'a'.repeat(64)

function makeMockHeaders(cookies: string[], extra: Record<string, string> = {}): Headers {
  return {
    getSetCookie: () => cookies,
    get: (name: string) => {
      if (name === 'set-cookie') return cookies.join(', ') || null
      return extra[name.toLowerCase()] ?? null
    },
  } as unknown as Headers
}

function setupBGALogin(playerId = '42') {
  mockFetch
    .mockResolvedValueOnce({
      ok: true, status: 302,
      headers: makeMockHeaders(['PHPSESSID=session123; Path=/; HttpOnly'], { location: 'https://en.boardgamearena.com/account' }),
    })
    .mockResolvedValueOnce({ ok: true, status: 200, headers: makeMockHeaders([]) })
    .mockResolvedValueOnce({
      ok: true, status: 200,
      text: async () => `<html><script>var request_token = '${TOKEN}'</script></html>`,
      headers: makeMockHeaders([]),
    })
    .mockResolvedValueOnce({
      ok: true, status: 200,
      text: async () => JSON.stringify({ status: 1, data: { user_id: playerId } }),
      headers: makeMockHeaders([`TournoiEnLigneidt=authtoken123; Path=/`]),
    })
}

const row = (id: string, name: string) => ({
  table_id: id, game_name: name, game_id: id, start: '1700000000', end: '1700086400',
  players: '42,99', player_names: 'testuser,alice', scores: '100,90', ranks: '1,2', elo_after: '1300',
})

describe('fetchFinishedBGA: merging the background-synced history store with a live page', () => {
  beforeEach(() => {
    mockFetch.mockClear()
    mockHgetall.mockReset()
    mockMget.mockReset()
    mockMget.mockResolvedValue([]) // no cached display names — fall back to the slug
  })

  it('fetches only the live first page once the store has history, and includes stored-only games', async () => {
    mockHgetall.mockResolvedValue({
      '1': row('1', 'ancientgame'), // only in the store — far older than any live page would reach
      '55555': row('55555', 'brass'), // also on the live page — live should win, not duplicate
    })
    setupBGALogin('42')
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      text: async () => JSON.stringify({ status: 1, data: { tables: [row('55555', 'brass')] } }),
      headers: makeMockHeaders([]),
    })

    const games = await fetchFinishedBGA('testuser', 'pass')

    const gamesPageCalls = mockFetch.mock.calls.filter(([url]) => String(url).includes('getGames.html') && !String(url).includes('game_id'))
    expect(gamesPageCalls).toHaveLength(1) // no multi-page walk once the store has history
    const ids = games.map(g => g.id).sort()
    expect(ids).toEqual(['bga:1', 'bga:55555'])
    expect(games.find(g => g.id === 'bga:1')?.gameName).toBe('ancientgame')
  })

  it('falls back to the old multi-page live walk when the store is empty', async () => {
    mockHgetall.mockResolvedValue({})
    setupBGALogin('42')
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      text: async () => JSON.stringify({ status: 1, data: { tables: [row('1', 'brass')] } }), // fewer than 10: stops after page 1
      headers: makeMockHeaders([]),
    })

    const games = await fetchFinishedBGA('testuser', 'pass')
    expect(games.map(g => g.id)).toEqual(['bga:1'])
    const gamesPageCalls = mockFetch.mock.calls.filter(([url]) => String(url).includes('getGames.html') && !String(url).includes('game_id'))
    expect(gamesPageCalls).toHaveLength(1) // a short page (<10 rows) stops the walk after page 1
  })
})
