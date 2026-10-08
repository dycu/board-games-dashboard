jest.mock('@/lib/connectors/bga', () => ({
  withBgaSession: jest.fn(),
  cookieString: (c: Record<string, string>) => Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; '),
}))

import { parseBgaCatalog, fetchBgaCatalog } from '@/lib/catalogs/bga'
import { withBgaSession } from '@/lib/connectors/bga'

const mockWithSession = withBgaSession as jest.MockedFunction<typeof withBgaSession>

const page = (games: object[]) => `<script>var x = {"game_list":${JSON.stringify(games)},"other":[1]}</script>`

const publicGame = { name: 'carcassonne', display_name_en: 'Carcassonne', status: 'public' }
const betaGame = { name: 'arknova', display_name_en: 'Ark Nova', status: 'beta' }
const alphaGame = { name: 'brasslancashire', display_name_en: 'Brass: Lancashire', status: 'alpha' }
const privateAlpha = { name: 'secret', display_name_en: 'Secret', status: 'private_alpha' }

describe('parseBgaCatalog', () => {
  it('lists public, beta and alpha games but not private alpha ones', () => {
    expect(parseBgaCatalog(page([publicGame, betaGame, alphaGame, privateAlpha])).map(e => e.name))
      .toEqual(['Carcassonne', 'Ark Nova', 'Brass: Lancashire'])
  })

  it('links to the gamepanel page', () => {
    expect(parseBgaCatalog(page([alphaGame]))[0].url).toBe('https://en.boardgamearena.com/gamepanel?game=brasslancashire')
  })
})

describe('fetchBgaCatalog', () => {
  const env = process.env
  let fetchMock: jest.Mock

  beforeEach(() => {
    process.env = { ...env, BGA_USERNAME: 'u', BGA_PASSWORD: 'p' }
    fetchMock = jest.fn()
    global.fetch = fetchMock
    mockWithSession.mockReset()
    mockWithSession.mockImplementation(async (_u, _p, fn) => fn({ cookies: { a: '1' }, myId: '1', token: 't' }))
  })
  afterAll(() => { process.env = env })

  const ok = (games: object[]) => ({ ok: true, status: 200, headers: new Headers(), text: async () => page(games) })

  it('fetches the list with the BGA session so alpha games are included', async () => {
    fetchMock.mockResolvedValueOnce(ok([publicGame, alphaGame]))
    const names = (await fetchBgaCatalog()).map(e => e.name)
    expect(names).toContain('Brass: Lancashire')
    expect(fetchMock.mock.calls[0][1].headers.Cookie).toBe('a=1')
  })

  it('keeps the session cookie across BGA redirects', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 302, headers: new Headers({ location: 'https://boardgamearena.com/gamelist?section=all' }) })
      .mockResolvedValueOnce({ ...ok([alphaGame]), status: 200, headers: new Headers() })
    expect((await fetchBgaCatalog()).map(e => e.name)).toEqual(['Brass: Lancashire'])
    expect(fetchMock.mock.calls[1][0]).toBe('https://boardgamearena.com/gamelist?section=all')
    expect(fetchMock.mock.calls[1][1].headers.Cookie).toBe('a=1')
  })

  it('falls back to the public list when the session is not logged in', async () => {
    mockWithSession.mockImplementation(async (_u, _p, fn) => fn({ cookies: {}, myId: '', token: '' }))
    fetchMock.mockResolvedValue(ok([publicGame, betaGame]))
    expect((await fetchBgaCatalog()).map(e => e.name)).toEqual(['Carcassonne', 'Ark Nova'])
    expect(fetchMock.mock.calls[1][1].headers.Cookie).toBeUndefined()
  })

  it('uses the public list without credentials', async () => {
    delete process.env.BGA_USERNAME
    fetchMock.mockResolvedValueOnce(ok([publicGame]))
    expect((await fetchBgaCatalog()).map(e => e.name)).toEqual(['Carcassonne'])
    expect(mockWithSession).not.toHaveBeenCalled()
  })
})
