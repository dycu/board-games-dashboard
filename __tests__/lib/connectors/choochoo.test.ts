/**
 * @jest-environment node
 */
import { fetchChoochoo } from '@/lib/connectors/choochoo'

const mockFetch = jest.fn()
global.fetch = mockFetch

function makeMockHeaders(cookieStr: string | null): Headers {
  return {
    get: (name: string) => name === 'set-cookie' ? cookieStr : null,
    getSetCookie: () => cookieStr ? [cookieStr] : [],
  } as unknown as Headers
}

const XSRF_RESPONSE = { xsrfToken: 'test-xsrf-abc' }
const LOGIN_RESPONSE = { user: { id: 42, username: 'testuser' } }
const GAMES_RESPONSE = {
  games: [
    {
      id: 101,
      name: 'Brass: Birmingham',
      activePlayerId: 42,
      playerIds: [42, 99, 100],
      updatedAt: '2026-06-20T10:00:00Z',
    },
    {
      id: 202,
      name: 'Hive',
      activePlayerId: 99,
      playerIds: [42, 99],
      updatedAt: '2026-06-24T08:00:00Z',
    },
  ],
}

function setupHappyPath() {
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: async () => XSRF_RESPONSE,
      headers: makeMockHeaders('_xsrf=xsrf-cookie; Path=/'),
    })
    .mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify(LOGIN_RESPONSE),
      headers: makeMockHeaders('connect.sid=auth-session; Path=/'),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => GAMES_RESPONSE,
      headers: makeMockHeaders(null),
    })
}

describe('fetchChoochoo', () => {
  beforeEach(() => mockFetch.mockClear())

  it('returns Game[] from API response', async () => {
    setupHappyPath()
    const games = await fetchChoochoo('testuser', 'pass')
    expect(games).toHaveLength(2)
    expect(games[0]).toMatchObject({
      platform: 'choochoo',
      id: expect.stringMatching(/^choochoo:/),
      myTurn: expect.any(Boolean),
      gameUrl: expect.stringContaining('choochoo.games'),
    })
  })

  it('correctly identifies my-turn from activePlayerId', async () => {
    setupHappyPath()
    const games = await fetchChoochoo('testuser', 'pass')
    const g1 = games.find(g => g.id === 'choochoo:101')!
    expect(g1.myTurn).toBe(true)
    const g2 = games.find(g => g.id === 'choochoo:202')!
    expect(g2.myTurn).toBe(false)
  })

  it('excludes self from players list', async () => {
    setupHappyPath()
    const games = await fetchChoochoo('testuser', 'pass')
    const g1 = games.find(g => g.id === 'choochoo:101')!
    expect(g1.players).not.toContain('42')
    expect(g1.players).toEqual(expect.arrayContaining(['99', '100']))
    const g2 = games.find(g => g.id === 'choochoo:202')!
    expect(g2.players).toEqual(['99'])
  })

  it('throws when XSRF token or cookie is missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
      headers: makeMockHeaders(null),
    })
    await expect(fetchChoochoo('user', 'pass')).rejects.toThrow(/choochoo: no xsrf token/)
  })

  it('throws when login response has no user', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => XSRF_RESPONSE,
        headers: makeMockHeaders('_xsrf=xsrf-cookie; Path=/'),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ error: 'Invalid credentials' }),
        headers: makeMockHeaders(null),
      })
    await expect(fetchChoochoo('bad', 'creds')).rejects.toThrow(/choochoo: login failed/)
  })
})
