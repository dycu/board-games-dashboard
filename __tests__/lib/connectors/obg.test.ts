import { fetchOBG } from '@/lib/connectors/obg'
import { readFileSync } from 'fs'
import { join } from 'path'

const mockFetch = jest.fn()
global.fetch = mockFetch
const fixture = readFileSync(join(__dirname, '../../../__fixtures__/obg-games.html'), 'utf8')

function makeLoginPageResponse() {
  return {
    ok: true,
    status: 200,
    text: async () => '<form><input type="hidden" name="csrfmiddlewaretoken" value="formcsrf123"></form>',
    headers: { get: (h: string) => h === 'set-cookie' ? 'csrftoken=cookiecsrf123; Path=/' : null },
  }
}

function makeLoginSuccessResponse() {
  return {
    ok: false,
    status: 302,
    headers: { get: (h: string) => {
      if (h === 'set-cookie') return 'sessionid=sess456; Path=/; csrftoken=newcsrf; Path=/'
      if (h === 'location') return '/'
      return null
    }},
  }
}

function makeGamesResponse() {
  return { ok: true, text: async () => fixture }
}

describe('fetchOBG', () => {
  beforeEach(() => mockFetch.mockClear())

  it('returns Game[] from scraped HTML', async () => {
    mockFetch
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginSuccessResponse())
      .mockResolvedValueOnce(makeGamesResponse())

    const games = await fetchOBG('testuser', 'pass')
    expect(games).toHaveLength(2)
    expect(games[0]).toMatchObject({
      platform: 'obg',
      id: expect.stringMatching(/^obg:/),
      myTurn: expect.any(Boolean),
    })
  })

  it('correctly identifies my-turn from CSS class', async () => {
    mockFetch
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginSuccessResponse())
      .mockResolvedValueOnce(makeGamesResponse())

    const games = await fetchOBG('testuser', 'pass')
    const g1 = games.find(g => g.id === 'obg:101')!
    expect(g1.myTurn).toBe(true)
    const g2 = games.find(g => g.id === 'obg:202')!
    expect(g2.myTurn).toBe(false)
    expect(g2.currentPlayer).toBe('alice')
  })

  it('throws when login fails (no session cookie)', async () => {
    mockFetch
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
      })
    await expect(fetchOBG('bad', 'creds')).rejects.toThrow('OBG login failed')
  })
})
