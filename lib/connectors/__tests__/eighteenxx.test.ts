/**
 * @jest-environment node
 */
import { fetchEighteenXX, fetchFinishedEighteenXX, parseProfileGames } from '../eighteenxx'

const BASE = 'https://18xx.games'

const ACTIVE_GAME = {
  id: 100,
  title: '18Chesapeake',
  status: 'active',
  updated_at: '2026-01-15T10:00:00Z',
  players: [{ id: 42, name: 'Dycu' }, { id: 99, name: 'Other' }],
  acting: [42],
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

// Shape of the real /profile/<id> page (trimmed)
const PROFILE_HTML = `<html><body><script>Opal.App.$attach('app', Opal.hash("app_route","/profile/42","games",[` +
  `Opal.hash("id",100,"description","","user",Opal.hash("id",42,"name","Dycu"),"players",[Opal.hash("id",42,"name","Dycu"),Opal.hash("id",99,"name","Other")],"title","18Chesapeake","settings",Opal.hash("seed",1,"player_order",Opal.nil,"optional_rules",[]),"status","active","acting",[42],"result",Opal.hash(),"loaded",false,"created_at",1790932943,"updated_at",1791497548,"finished_at",Opal.nil),` +
  `Opal.hash("id",200,"description","say \\"hi\\"","players",[Opal.hash("id",42,"name","Dycu"),Opal.hash("id",99,"name","Other"),Opal.hash("id",7,"name","Third")],"title","1830","status","archived","acting",[42,99,7],"result",Opal.hash("7",4180,"42",5232,"99",3038),"created_at",1757820638,"updated_at",1789376420,"finished_at",1762249025),` +
  `Opal.hash("id",201,"players",[Opal.hash("id",42,"name","Dycu"),Opal.hash("id",99,"name","Other")],"title","1882","status","finished","result",Opal.hash("42",100,"99",250),"created_at",1757820000,"updated_at",1789376000,"finished_at",1762000000)` +
  `],"production",true))</script></body></html>`

describe('parseProfileGames', () => {
  it('reads the Opal literals into plain objects', () => {
    const games = parseProfileGames(PROFILE_HTML)
    expect(games).toHaveLength(3)
    expect(games[0]).toMatchObject({ id: 100, status: 'active', finished_at: null, loaded: false, acting: [42] })
    expect(games[1].description).toBe('say "hi"')
    expect(games[1].result).toEqual({ '7': 4180, '42': 5232, '99': 3038 })
  })

  it('throws when the page has no games list', () => {
    expect(() => parseProfileGames('<html></html>')).toThrow('no games list')
  })
})

describe('fetchFinishedEighteenXX', () => {
  it('reads finished and archived games from the profile page, with places from scores', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ games: [ACTIVE_GAME] }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, text: async () => PROFILE_HTML } as unknown as Response)

    const games = await fetchFinishedEighteenXX('Dycu', '', 'session_abc')

    expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe(`${BASE}/profile/42`)
    expect(games.map(g => g.id)).toEqual(['eighteenxx:200', 'eighteenxx:201'])
    expect(games[0]).toMatchObject({
      gameName: '1830',
      result: 'won',
      rank: 1,
      playerCount: 3,
      score: '5232',
      gameUrl: `${BASE}/game/200`,
      opponents: [{ name: 'Other', rank: 3 }, { name: 'Third', rank: 2 }],
    })
    expect(games[0].completedAt.getTime()).toBe(1762249025 * 1000)
    expect(games[1]).toMatchObject({ result: 'lost', rank: 2, playerCount: 2 })
  })

  it('takes the id from the login response when there is no cookie', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ user: { id: 42 } }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, text: async () => PROFILE_HTML } as unknown as Response)

    const games = await fetchFinishedEighteenXX('Dycu', 'pass')

    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(`${BASE}/api/user/login`)
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe(`${BASE}/profile/42`)
    expect(games).toHaveLength(2)
  })

  it('uses EIGHTEENXX_USER_ID without looking the id up', async () => {
    process.env.EIGHTEENXX_USER_ID = '42'
    try {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => PROFILE_HTML } as unknown as Response)
      const games = await fetchFinishedEighteenXX('Dycu', '', 'session_abc')
      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(games).toHaveLength(2)
    } finally {
      delete process.env.EIGHTEENXX_USER_ID
    }
  })

  it('throws descriptive error when cookie is expired', async () => {
    mockFetch({ ok: false, status: 401, data: {} })

    await expect(fetchFinishedEighteenXX('Dycu', '', 'bad_cookie')).rejects.toThrow(
      '18xx.games session cookie is invalid or expired — update it in Settings'
    )
  })
})
