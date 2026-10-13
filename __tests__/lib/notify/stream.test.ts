import { parseGamesStream, fetchGamesStream } from '@/lib/notify/stream'

const ev = (o: object) => `data: ${JSON.stringify(o)}\n\n`

describe('parseGamesStream', () => {
  it('turns platform events into counts and errors', () => {
    const body = ev({ type: 'start', platforms: ['bga', 'obg'] })
      + ev({ type: 'platform', platform: 'bga', games: [{}, {}], error: null })
      + ev({ type: 'platform', platform: 'obg', games: [], error: 'OBG: markup has changed' })
      + ev({ type: 'done', fetchedAt: 'x' })
    expect(parseGamesStream(body)).toEqual({
      results: [
        { platform: 'bga', count: 2 },
        { platform: 'obg', error: 'OBG: markup has changed' },
      ],
      games: [{}, {}],
      missing: [],
    })
  })

  it('keeps what arrived from a stream cut short and names the rest', () => {
    const body = ev({ type: 'start', platforms: ['bga', 'obg', 'rally'] })
      + ev({ type: 'platform', platform: 'bga', games: [{}], error: null })
    expect(parseGamesStream(body)).toMatchObject({ games: [{}], missing: ['obg', 'rally'] })
  })

  it('throws when no platform reported at all', () => {
    expect(() => parseGamesStream(ev({ type: 'start', platforms: ['bga'] }))).toThrow('no platform results')
  })
})

describe('fetchGamesStream', () => {
  const body = ev({ type: 'start', platforms: ['bga'] }) + ev({ type: 'platform', platform: 'bga', games: [], error: null })

  it('retries once after a failed fetch', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 504 })
      .mockResolvedValueOnce({ ok: true, text: async () => body }) as unknown as typeof fetch
    await expect(fetchGamesStream('https://x', 'Basic y')).resolves.toMatchObject({ missing: [] })
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('gives up after two failures', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 504 }) as unknown as typeof fetch
    await expect(fetchGamesStream('https://x', 'Basic y')).rejects.toThrow('HTTP 504')
  })
})
