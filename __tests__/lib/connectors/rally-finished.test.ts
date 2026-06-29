import { fetchFinishedRally } from '@/lib/connectors/rally'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'

const mockFetch = jest.fn()
global.fetch = mockFetch

const fixture = readFileSync(join(__dirname, '../../../__fixtures__/rally-finished.html'), 'utf8')

function makeRealChallenge(salt: string, answer: number, maxnumber = 1000) {
  const challenge = createHash('sha256').update(salt + String(answer)).digest('hex')
  return { algorithm: 'SHA-256', challenge, maxnumber, salt, signature: 'sig' }
}

function setupRallyLogin() {
  const ch = makeRealChallenge('testsalt', 42)
  mockFetch
    .mockResolvedValueOnce({ ok: true, json: async () => ch })
    .mockResolvedValueOnce({
      ok: false, status: 302,
      headers: { get: (h: string) => h === 'set-cookie' ? 'login=sid123; Path=/' : null },
    })
}

describe('fetchFinishedRally', () => {
  beforeEach(() => mockFetch.mockReset())

  it('returns FinishedGame[] from /games/finished', async () => {
    setupRallyLogin()
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => fixture })

    const games = await fetchFinishedRally('testuser', 'pass')
    expect(games).toHaveLength(2)
    expect(games[0]).toMatchObject({
      id: 'rally:501',
      platform: 'rally',
      gameName: 'Twilight Struggle',
      gameUrl: expect.stringContaining('rally-the-troops.com'),
      completedAgo: expect.any(String),
    })
    expect(games[0].completedAt).toBeInstanceOf(Date)
    expect(games[1].id).toBe('rally:502')
    expect(games[1].gameName).toBe('Paths of Glory')
  })

  it('returns empty array when Finished section missing', async () => {
    setupRallyLogin()
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => '<html><body><h2>Other</h2></body></html>' })

    const games = await fetchFinishedRally('testuser', 'pass')
    expect(games).toHaveLength(0)
  })
})
