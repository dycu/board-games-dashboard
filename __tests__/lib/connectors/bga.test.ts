import { fetchBGA } from '@/lib/connectors/bga'
import fixture from '@/__fixtures__/bga-games.json'

const mockFetch = jest.fn()
global.fetch = mockFetch

function makeInitMock() {
  return {
    ok: true,
    headers: {
      get: () => 'bga_cookie=init; Path=/',
      getSetCookie: () => ['bga_cookie=init; Path=/'],
    },
    text: async () => 'var bgaConfig = {requestToken: "deadbeef1234", someOther: true}',
  }
}

function makeLoginMock(payload: object) {
  return {
    ok: true,
    headers: {
      get: () => 'PHPSESSID=abc123; Path=/',
      getSetCookie: () => ['PHPSESSID=abc123; Path=/'],
    },
    text: async () => JSON.stringify(payload),
  }
}

function makeGamesMock(data: object) {
  return {
    ok: true,
    json: async () => data,
  }
}

describe('fetchBGA', () => {
  beforeEach(() => mockFetch.mockClear())

  it('returns Game[] from API response', async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitMock())
      .mockResolvedValueOnce(makeLoginMock({ status: 1, data: { id: '42' } }))
      .mockResolvedValueOnce(makeGamesMock(fixture))

    const games = await fetchBGA('user@example.com', 'password')
    expect(games.length).toBe(2)
    expect(games[0]).toMatchObject({
      platform: 'bga',
      id: expect.stringMatching(/^bga:/),
      myTurn: expect.any(Boolean),
      gameUrl: expect.stringContaining('boardgamearena.com'),
      gameName: expect.any(String),
    })
  })

  it('correctly identifies whose turn it is', async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitMock())
      .mockResolvedValueOnce(makeLoginMock({ status: 1, data: { id: '42' } }))
      .mockResolvedValueOnce(makeGamesMock(fixture))

    const games = await fetchBGA('user@example.com', 'password')
    // Game 12345: active_player=99, me=42 → NOT my turn
    const wingspan = games.find(g => g.id === 'bga:12345')!
    expect(wingspan.myTurn).toBe(false)
    expect(wingspan.currentPlayer).toBe('alice')

    // Game 67890: active_player=42, me=42 → MY turn
    const agricola = games.find(g => g.id === 'bga:67890')!
    expect(agricola.myTurn).toBe(true)
  })

  it('throws when login fails', async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitMock())
      .mockResolvedValueOnce(makeLoginMock({ status: 0, error: 'Invalid credentials' }))

    await expect(fetchBGA('bad', 'creds')).rejects.toThrow('BGA login failed')
  })

  it('throws a descriptive error when BGA returns HTML instead of JSON', async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitMock())
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => '', getSetCookie: () => [] },
        text: async () => '<html><body>Access denied</body></html>',
      })

    await expect(fetchBGA('user', 'pass')).rejects.toThrow('HTML instead of JSON')
  })
})
