import { fetchFinishedOBG } from '@/lib/connectors/obg'
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

describe('fetchFinishedOBG', () => {
  beforeEach(() => mockFetch.mockClear())

  it('returns FinishedGame[] from second gamesTable', async () => {
    mockFetch
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginSuccessResponse())
      .mockResolvedValueOnce({ ok: true, text: async () => HOME_HTML })
      .mockResolvedValueOnce({ ok: true, text: async () => fixture })

    const games = await fetchFinishedOBG('testuser', 'pass')
    expect(games).toHaveLength(2)
    expect(games[0]).toMatchObject({
      id: 'obg:301',
      platform: 'obg',
      gameName: 'Food Chain Magnate — Finished Match',
      gameUrl: 'https://www.onlineboardgamers.com/FCM/301/show/',
      completedAgo: expect.any(String),
    })
    expect(games[0].completedAt).toBeInstanceOf(Date)
    expect(games[1].id).toBe('obg:302')
    expect(games[1].gameName).toBe('Antiquity')
  })

  it('returns empty array when no finished games table exists', async () => {
    const noFinished = fixture.split('<h2>Finished Games')[0] + '</body></html>'
    mockFetch
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginSuccessResponse())
      .mockResolvedValueOnce({ ok: true, text: async () => HOME_HTML })
      .mockResolvedValueOnce({ ok: true, text: async () => noFinished })

    const games = await fetchFinishedOBG('testuser', 'pass')
    expect(games).toHaveLength(0)
  })
})
