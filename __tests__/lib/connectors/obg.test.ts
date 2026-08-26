import { fetchOBG } from '@/lib/connectors/obg'
import { readFileSync } from 'fs'
import { join } from 'path'

const mockFetch = jest.fn()
global.fetch = mockFetch
const fixture = readFileSync(join(__dirname, '../../../__fixtures__/obg-games.html'), 'utf8')

const HOME_HTML = `<html><body>
  <a class="topBarLink" href="/profile/testuser/">My Games</a>
</body></html>`

function makeLoginPageResponse() {
  return {
    ok: true, status: 200,
    text: async () => '<form><input type="hidden" name="csrfmiddlewaretoken" value="formcsrf123"></form>',
    headers: { get: (h: string) => h === 'set-cookie' ? 'csrftoken=cookiecsrf123; Path=/' : null },
  }
}

function makeLoginSuccessResponse() {
  return {
    ok: false, status: 302,
    headers: { get: (h: string) => {
      if (h === 'set-cookie') return 'sessionid=sess456; Path=/; csrftoken=newcsrf; Path=/'
      if (h === 'location') return '/'
      return null
    }},
  }
}

function makeHomeResponse() {
  return { ok: true, text: async () => HOME_HTML }
}

function makeProfileResponse() {
  return { ok: true, text: async () => fixture }
}

describe('fetchOBG', () => {
  beforeEach(() => mockFetch.mockClear())

  it('returns Game[] from scraped HTML', async () => {
    mockFetch
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginSuccessResponse())
      .mockResolvedValueOnce(makeHomeResponse())
      .mockResolvedValueOnce(makeProfileResponse())

    const games = await fetchOBG('testuser', 'pass')
    expect(games).toHaveLength(2)
    expect(games[0]).toMatchObject({
      platform: 'obg',
      id: expect.stringMatching(/^obg:/),
      myTurn: expect.any(Boolean),
      gameUrl: expect.stringContaining('onlineboardgamers.com'),
      gameName: expect.stringContaining('Food Chain Magnate'),
    })
  })

  it('correctly identifies my-turn by comparing the status cell to our own profile name', async () => {
    mockFetch
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginSuccessResponse())
      .mockResolvedValueOnce(makeHomeResponse())
      .mockResolvedValueOnce(makeProfileResponse())

    const games = await fetchOBG('testuser', 'pass')
    const g1 = games.find(g => g.id === 'obg:101')!
    expect(g1.myTurn).toBe(true)
    expect(g1.currentPlayer).toBeUndefined()
    const g2 = games.find(g => g.id === 'obg:202')!
    expect(g2.myTurn).toBe(false)
    expect(g2.currentPlayer).toBe('alice')
  })

  it('parses game URL and excludes self from players list', async () => {
    mockFetch
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginSuccessResponse())
      .mockResolvedValueOnce(makeHomeResponse())
      .mockResolvedValueOnce(makeProfileResponse())

    const games = await fetchOBG('testuser', 'pass')
    const g1 = games.find(g => g.id === 'obg:101')!
    expect(g1.gameUrl).toBe('https://www.onlineboardgamers.com/nd/FCM/101/show/')
    expect(g1.gameName).toBe("Food Chain Magnate — Dycu's Game")
    expect(g1.players).toEqual(['alice', 'bob'])
  })

  it('throws when login fails (no session cookie)', async () => {
    mockFetch
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce({ ok: true, status: 200, headers: { get: () => null } })
    await expect(fetchOBG('bad', 'creds')).rejects.toThrow('OBG login failed')
  })

  it('hits the /nd/-prefixed login and home paths (site migrated off the bare paths)', async () => {
    mockFetch
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginSuccessResponse())
      .mockResolvedValueOnce(makeHomeResponse())
      .mockResolvedValueOnce(makeProfileResponse())

    await fetchOBG('testuser', 'pass')
    expect(mockFetch.mock.calls[0][0]).toBe('https://www.onlineboardgamers.com/nd/login/')
    expect(mockFetch.mock.calls[1][0]).toBe('https://www.onlineboardgamers.com/nd/login/')
    expect(mockFetch.mock.calls[2][0]).toBe('https://www.onlineboardgamers.com/nd/')
  })

  it('extracts profile name when the nav link is /nd/profile/-prefixed', async () => {
    mockFetch
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginSuccessResponse())
      .mockResolvedValueOnce({ ok: true, text: async () => `<html><body>
        <a class="topBarLink" href="/nd/profile/testuser/">My Games</a>
      </body></html>` })
      .mockResolvedValueOnce(makeProfileResponse())

    const games = await fetchOBG('testuser', 'pass')
    expect(games).toHaveLength(2)
    expect(mockFetch.mock.calls[3][0]).toBe('https://www.onlineboardgamers.com/profile/testuser/')
  })
})
