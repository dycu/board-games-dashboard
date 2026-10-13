import { fetchRally } from '@/lib/connectors/rally'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'

const mockFetch = jest.fn()
global.fetch = mockFetch

const fixture = readFileSync(join(__dirname, '../../../__fixtures__/rally-games.html'), 'utf8')

// Build a real ALTCHA challenge with a known answer so the pure-JS SHA-256 can solve it
function makeRealChallenge(salt: string, answer: number, maxnumber = 1000) {
  const challenge = createHash('sha256').update(salt + String(answer)).digest('hex')
  return { algorithm: 'SHA-256', challenge, maxnumber, salt, signature: 'sig' }
}

function setupHappyPath() {
  const ch = makeRealChallenge('testsalt', 42)
  mockFetch
    // Step 1: ALTCHA challenge
    .mockResolvedValueOnce({ ok: true, json: async () => ch })
    // Step 2: login — 302 redirect with session cookie
    .mockResolvedValueOnce({
      ok: false,
      status: 302,
      headers: { get: (h: string) => h === 'set-cookie' ? 'login=abc123; Path=/; HttpOnly' : null },
    })
    // Step 3: games/active HTML page
    .mockResolvedValueOnce({ ok: true, text: async () => fixture })
}

describe('fetchRally', () => {
  beforeEach(() => mockFetch.mockReset())

  it('returns Game[] from scraped HTML', async () => {
    setupHappyPath()
    const games = await fetchRally('testuser', 'pass')
    expect(games).toHaveLength(3)
    expect(games[0]).toMatchObject({
      platform: 'rally',
      id: expect.stringMatching(/^rally:/),
      myTurn: expect.any(Boolean),
      gameUrl: expect.stringContaining('rally-the-troops.com'),
    })
  })

  it('identifies whose turn it is from each game_item\'s own "your_turn" class', async () => {
    setupHappyPath()
    const games = await fetchRally('testuser', 'pass')
    const g1 = games.find(g => g.id === 'rally:101')!
    expect(g1.myTurn).toBe(true)
    expect(g1.gameName).toBe('Paths of Glory')
    expect(g1.gameUrl).toContain('/paths-of-glory/play.html?game=101')

    const g2 = games.find(g => g.id === 'rally:202')!
    expect(g2.myTurn).toBe(false)
    expect(g2.gameName).toBe('Julius Caesar')
  })

  it('includes a solo game (its own "Solo" section) and still reports its turn correctly', async () => {
    setupHappyPath()
    const games = await fetchRally('testuser', 'pass')
    const solo = games.find(g => g.id === 'rally:303')!
    expect(solo).toBeDefined()
    expect(solo.gameName).toBe('Traces of War')
    expect(solo.myTurn).toBe(true)
  })

  it('excludes games under "Recently finished" from the active list', async () => {
    setupHappyPath()
    const games = await fetchRally('testuser', 'pass')
    expect(games.find(g => g.id === 'rally:404')).toBeUndefined()
  })

  it('excludes the logged-in user from players list', async () => {
    setupHappyPath()
    const games = await fetchRally('testuser', 'pass')
    expect(games.find(g => g.id === 'rally:101')!.players).toEqual(['alice'])
    expect(games.find(g => g.id === 'rally:202')!.players).toEqual(['bob'])
  })

  it('leaves a solo game with no other players, since both seats are the same user', async () => {
    setupHappyPath()
    const games = await fetchRally('testuser', 'pass')
    expect(games.find(g => g.id === 'rally:303')!.players).toEqual([])
  })

  it('solves an ALTCHA answer beyond the batch size (boundary check)', async () => {
    // Default batch is 200; an answer at 437 with maxnumber 1000 crosses
    // several batch boundaries and isn't a multiple of the batch size
    const ch = makeRealChallenge('testsalt', 437, 1000)
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ch })
      .mockResolvedValueOnce({
        ok: false,
        status: 302,
        headers: { get: (h: string) => h === 'set-cookie' ? 'login=abc123; Path=/; HttpOnly' : null },
      })
      .mockResolvedValueOnce({ ok: true, text: async () => fixture })
    const games = await fetchRally('testuser', 'pass')
    expect(games).toHaveLength(3)
  })

  it('throws when login returns non-302', async () => {
    const ch = makeRealChallenge('testsalt', 7)
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ch })
      .mockResolvedValueOnce({ ok: true, status: 200, headers: { get: () => null } })
    await expect(fetchRally('bad', 'creds')).rejects.toThrow('Rally the Troops login failed')
  })
})
