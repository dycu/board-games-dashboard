import { resolvePlayUrl, bgaSlugFromTableUrl } from '../playUrl'

const catalog = jest.fn()

describe('bgaSlugFromTableUrl', () => {
  it('reads the slug with a gameserver segment', () => {
    expect(bgaSlugFromTableUrl('https://boardgamearena.com/3/arknova?table=123')).toBe('arknova')
  })
  it('reads the slug without a gameserver segment', () => {
    expect(bgaSlugFromTableUrl('https://boardgamearena.com/arknova?table=123')).toBe('arknova')
  })
  it('reads the slug from a game panel URL', () => {
    expect(bgaSlugFromTableUrl('https://boardgamearena.com/gamepanel?game=azul')).toBe('azul')
  })
  it('returns null for other URLs', () => {
    expect(bgaSlugFromTableUrl('https://boardgamearena.com/gameinprogress')).toBeNull()
  })
})

describe('resolvePlayUrl', () => {
  beforeEach(() => catalog.mockReset())

  it('keeps a URL the client gave', async () => {
    const url = await resolvePlayUrl({ platform: 'yucata', gameName: 'X', playUrl: 'https://www.yucata.de/en/GameInfo/X' }, catalog)
    expect(url).toBe('https://www.yucata.de/en/GameInfo/X')
    expect(catalog).not.toHaveBeenCalled()
  })

  it('ignores a non-http URL from the client', async () => {
    catalog.mockResolvedValue([])
    const url = await resolvePlayUrl({ platform: 'obg', gameName: 'X', playUrl: 'javascript:alert(1)' }, catalog)
    expect(url).toBe('https://www.onlineboardgamers.com')
  })

  it('turns a BGA table URL into the game panel', async () => {
    const url = await resolvePlayUrl({ platform: 'bga', gameName: 'Ark Nova', gameUrl: 'https://boardgamearena.com/2/arknova?table=9' }, catalog)
    expect(url).toBe('https://boardgamearena.com/gamepanel?game=arknova')
  })

  it('uses a close catalog match', async () => {
    catalog.mockResolvedValue([
      { name: 'Agricola', url: 'https://www.yucata.de/en/GameInfo/Agricola' },
      { name: 'Ark Nova', url: 'https://www.yucata.de/en/GameInfo/ArkNova' },
    ])
    const url = await resolvePlayUrl({ platform: 'yucata', gameName: 'Ark Nova', gameUrl: 'https://www.yucata.de/en/game/1' }, catalog)
    expect(url).toBe('https://www.yucata.de/en/GameInfo/ArkNova')
  })

  it('guesses the BGA game page from the name when the catalog has no match (alpha games)', async () => {
    catalog.mockResolvedValue([{ name: 'Agricola', url: 'https://en.boardgamearena.com/gamepanel?game=agricola' }])
    const url = await resolvePlayUrl({ platform: 'bga', gameName: 'Civolution' }, catalog)
    expect(url).toBe('https://boardgamearena.com/gamepanel?game=civolution')
  })

  it('falls back to the platform home without a close match', async () => {
    catalog.mockResolvedValue([{ name: 'Agricola', url: 'https://www.yucata.de/en/GameInfo/Agricola' }])
    const url = await resolvePlayUrl({ platform: 'yucata', gameName: 'Ark Nova' }, catalog)
    expect(url).toBe('https://www.yucata.de')
  })

  it('falls back to the platform home when the catalog fails', async () => {
    catalog.mockRejectedValue(new Error('down'))
    const url = await resolvePlayUrl({ platform: 'rally', gameName: 'Votes for Women' }, catalog)
    expect(url).toBe('https://rally-the-troops.com')
  })

  it('uses the platform home for platforms without a catalog', async () => {
    const url = await resolvePlayUrl({ platform: 'obg', gameName: 'Antiquity' }, catalog)
    expect(url).toBe('https://www.onlineboardgamers.com')
    expect(catalog).not.toHaveBeenCalled()
  })
})
