jest.mock('@vercel/kv', () => ({ kv: { get: jest.fn(), set: jest.fn(), del: jest.fn() } }))

import { kv } from '@vercel/kv'
import { fetchRally, withRallySession } from '@/lib/connectors/rally'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'

const mockFetch = jest.fn()
global.fetch = mockFetch
const store = new Map<string, unknown>()

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
    .mockResolvedValueOnce({ ok: true, url: `${'https://rally-the-troops.com'}/games/active`, text: async () => fixture })
}

describe('fetchRally', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    store.clear()
    ;(kv.get as jest.Mock).mockImplementation(async (k: string) => store.get(k) ?? null)
    ;(kv.set as jest.Mock).mockImplementation(async (k: string, v: unknown) => { store.set(k, v); return 'OK' })
    ;(kv.del as jest.Mock).mockImplementation(async (k: string) => { store.delete(k); return 1 })
  })

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

describe('withRallySession', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    store.clear()
    ;(kv.get as jest.Mock).mockImplementation(async (k: string) => store.get(k) ?? null)
    ;(kv.set as jest.Mock).mockImplementation(async (k: string, v: unknown) => { store.set(k, v); return 'OK' })
    ;(kv.del as jest.Mock).mockImplementation(async (k: string) => { store.delete(k); return 1 })
  })

  it('reuses a cached cookie instead of solving ALTCHA again', async () => {
    store.set('rally-session:v1', 'login=cached')
    const result = await withRallySession('u', 'p', async cookie => cookie)
    expect(result).toBe('login=cached')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('caches the cookie from a fresh login for next time', async () => {
    setupHappyPath()
    await withRallySession('u', 'p', async () => {})
    expect(store.get('rally-session:v1')).toBe('login=abc123')
  })

  it('drops a rejected cached cookie and logs in fresh', async () => {
    store.set('rally-session:v1', 'login=stale')
    setupHappyPath()
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('session expired'))
      .mockResolvedValueOnce('fresh result')
    const result = await withRallySession('u', 'p', fn)
    expect(result).toBe('fresh result')
    expect(fn).toHaveBeenNthCalledWith(1, 'login=stale')
    expect(fn).toHaveBeenNthCalledWith(2, 'login=abc123')
    expect(store.get('rally-session:v1')).toBe('login=abc123')
  })

  it('treats a redirect back to the login page as an expired session', async () => {
    store.set('rally-session:v1', 'login=stale')
    const ch = makeRealChallenge('testsalt', 42)
    mockFetch
      // 1: games/active with the stale cookie — bounced to the login page
      .mockResolvedValueOnce({ ok: true, url: 'https://rally-the-troops.com/login', text: async () => '<html>login</html>' })
      // 2-3: a fresh login
      .mockResolvedValueOnce({ ok: true, json: async () => ch })
      .mockResolvedValueOnce({
        ok: false, status: 302,
        headers: { get: (h: string) => h === 'set-cookie' ? 'login=abc123; Path=/; HttpOnly' : null },
      })
      // 4: games/active again, now with the fresh cookie
      .mockResolvedValueOnce({ ok: true, url: 'https://rally-the-troops.com/games/active', text: async () => fixture })
    const games = await fetchRally('u', 'p')
    expect(games).toHaveLength(3)
    expect(store.get('rally-session:v1')).toBe('login=abc123')
  })
})
