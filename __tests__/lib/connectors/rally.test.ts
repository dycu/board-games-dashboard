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
    expect(games).toHaveLength(2)
    expect(games[0]).toMatchObject({
      platform: 'rally',
      id: expect.stringMatching(/^rally:/),
      myTurn: expect.any(Boolean),
      gameUrl: expect.stringContaining('rally-the-troops.com'),
    })
  })

  it('correctly identifies whose turn it is from Move/Active sections', async () => {
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

  it('excludes the logged-in user from players list', async () => {
    setupHappyPath()
    const games = await fetchRally('testuser', 'pass')
    expect(games.find(g => g.id === 'rally:101')!.players).toEqual(['alice'])
    expect(games.find(g => g.id === 'rally:202')!.players).toEqual(['bob'])
  })

  it('throws when login returns non-302', async () => {
    const ch = makeRealChallenge('testsalt', 7)
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ch })
      .mockResolvedValueOnce({ ok: true, status: 200, headers: { get: () => null } })
    await expect(fetchRally('bad', 'creds')).rejects.toThrow('Rally the Troops login failed')
  })
})
