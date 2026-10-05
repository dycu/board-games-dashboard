jest.mock('@vercel/kv', () => ({ kv: { get: jest.fn(), set: jest.fn() } }))

import { kv } from '@vercel/kv'
import { fetchOBG } from '@/lib/connectors/obg'
import { readFileSync } from 'fs'
import { join } from 'path'

const mockKvGet = kv.get as jest.Mock
const mockKvSet = kv.set as jest.Mock

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
  beforeEach(() => {
    mockFetch.mockClear()
    mockKvGet.mockReset().mockResolvedValue(null)
    mockKvSet.mockReset().mockResolvedValue(undefined)
  })

  it('returns Game[] from scraped HTML', async () => {
    mockFetch
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginSuccessResponse())
      .mockResolvedValueOnce(makeHomeResponse())
      .mockResolvedValueOnce(makeProfileResponse())

    const games = await fetchOBG('testuser', 'pass')
    expect(games).toHaveLength(3)
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
    expect(g1.gameUrl).toBe('https://www.onlineboardgamers.com/FCM/101/show/')
    expect(g1.gameName).toBe("Food Chain Magnate — Dycu's Game")
    expect(g1.players).toEqual(['alice', 'bob'])
  })

  it('prefixes the real game type when the site shows only a plain (non-bracketed) custom title', async () => {
    // OBG's game-name cell can show just the bare custom title with no brackets
    // and no game type at all — leaving no way to tell which game it is.
    mockFetch
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginSuccessResponse())
      .mockResolvedValueOnce(makeHomeResponse())
      .mockResolvedValueOnce(makeProfileResponse())

    const games = await fetchOBG('testuser', 'pass')
    const g3 = games.find(g => g.id === 'obg:303')!
    expect(g3.gameName).toBe('Indonesia — testuser')
    expect(g3.myTurn).toBe(true)
    expect(g3.players).toEqual(['carol'])
  })

  it('never reports finished games as active, even when the finished table is the only gamesTable on the page (zero current games)', async () => {
    const noCurrentGames = fixture.replace(
      /<h2>Current Games[\s\S]*?<\/table>\s*/,
      '<p>No Current Games</p>\n'
    )
    mockFetch
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginSuccessResponse())
      .mockResolvedValueOnce(makeHomeResponse())
      .mockResolvedValueOnce({ ok: true, text: async () => noCurrentGames })

    const games = await fetchOBG('testuser', 'pass')
    expect(games).toHaveLength(0)
  })

  it('throws when login fails (no session cookie)', async () => {
    mockFetch
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce({ ok: true, status: 200, headers: { get: () => null } })
    await expect(fetchOBG('bad', 'creds')).rejects.toThrow('OBG login failed')
  })

  it('hits the bare login and home paths (site reverted the /nd/-prefixed redesign URLs)', async () => {
    mockFetch
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginSuccessResponse())
      .mockResolvedValueOnce(makeHomeResponse())
      .mockResolvedValueOnce(makeProfileResponse())

    await fetchOBG('testuser', 'pass')
    expect(mockFetch.mock.calls[0][0]).toBe('https://www.onlineboardgamers.com/login/')
    expect(mockFetch.mock.calls[1][0]).toBe('https://www.onlineboardgamers.com/login/')
    expect(mockFetch.mock.calls[2][0]).toBe('https://www.onlineboardgamers.com/')
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
    expect(games).toHaveLength(3)
    expect(mockFetch.mock.calls[3][0]).toBe('https://www.onlineboardgamers.com/profile/testuser/')
  })

  it('reuses a cached session instead of logging in again, cutting the request down to just the profile page', async () => {
    mockKvGet.mockResolvedValue({ cookieHeader: 'sessionid=cached123', profileName: 'testuser' })
    mockFetch.mockResolvedValueOnce({ ok: true, url: 'https://www.onlineboardgamers.com/profile/testuser/', text: async () => fixture })

    const games = await fetchOBG('testuser', 'pass')

    expect(games).toHaveLength(3)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][0]).toBe('https://www.onlineboardgamers.com/profile/testuser/')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ headers: expect.objectContaining({ Cookie: 'sessionid=cached123' }) })
  })

  it('caches the session after a fresh login so the next call can skip straight to the profile page', async () => {
    mockFetch
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginSuccessResponse())
      .mockResolvedValueOnce(makeHomeResponse())
      .mockResolvedValueOnce(makeProfileResponse())

    await fetchOBG('testuser', 'pass')

    expect(mockKvSet).toHaveBeenCalledWith(
      'obg-session',
      { cookieHeader: expect.stringContaining('sessionid=sess456'), profileName: 'testuser' },
      { ex: expect.any(Number) }
    )
  })

  it('transparently re-logs in when the cached session has gone stale (profile fetch redirects back to login)', async () => {
    mockKvGet.mockResolvedValue({ cookieHeader: 'sessionid=stale', profileName: 'testuser' })
    mockFetch
      .mockResolvedValueOnce({ ok: true, url: 'https://www.onlineboardgamers.com/login/', text: async () => '<form>login page</form>' })
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginSuccessResponse())
      .mockResolvedValueOnce(makeHomeResponse())
      .mockResolvedValueOnce(makeProfileResponse())

    const games = await fetchOBG('testuser', 'pass')

    expect(games).toHaveLength(3)
    expect(mockFetch).toHaveBeenCalledTimes(5)
    expect(mockFetch.mock.calls[0][0]).toBe('https://www.onlineboardgamers.com/profile/testuser/')
    expect(mockFetch.mock.calls[1][0]).toBe('https://www.onlineboardgamers.com/login/')
    expect(mockFetch.mock.calls[4][0]).toBe('https://www.onlineboardgamers.com/profile/testuser/')
  })
})
