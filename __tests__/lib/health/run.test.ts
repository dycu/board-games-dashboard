jest.mock('@vercel/kv', () => ({ kv: { get: jest.fn(), set: jest.fn() } }))

import { parseGamesStream } from '@/lib/health/run'

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
    })
  })

  it('throws on a stream cut short', () => {
    expect(() => parseGamesStream(ev({ type: 'start', platforms: [] }))).toThrow('done')
  })
})
