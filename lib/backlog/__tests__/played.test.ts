import { aggregatePlayed, sortPlayed } from '../played'
import { Platform } from '../../types'

const active = (platform: Platform, gameName: string, gameType?: string) =>
  ({ platform, gameName, gameType, gameUrl: `https://x/${gameName}` })
const done = (platform: Platform, gameName: string, daysAgo: number, gameType?: string) =>
  ({ ...active(platform, gameName, gameType), completedAt: new Date(Date.UTC(2026, 9, 7) - daysAgo * 86400000) })

describe('aggregatePlayed', () => {
  it('counts finished plays and running games per platform and game', () => {
    const list = aggregatePlayed(
      [active('bga', 'Ark Nova')],
      [done('bga', 'Ark Nova', 3), done('bga', 'ark nova', 10), done('yucata', 'Ark Nova', 1)],
    )
    const bga = list.find(g => g.platform === 'bga')!
    expect(bga).toMatchObject({ gameName: 'Ark Nova', plays: 2, playingNow: 1 })
    expect(bga.lastPlayedAt?.toISOString()).toBe('2026-10-04T00:00:00.000Z')
    expect(list.find(g => g.platform === 'yucata')).toMatchObject({ plays: 1, playingNow: 0 })
  })

  it('groups table titles under the game type', () => {
    const list = aggregatePlayed([], [
      done('obg', 'Antiquity — Dycu’s Game', 5, 'Antiquity'),
      done('obg', 'Antiquity — Grave farm', 2, 'Antiquity'),
    ])
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ gameName: 'Antiquity', plays: 2 })
  })

  it('treats an unknown finish time (epoch 0) as no date', () => {
    const [g] = aggregatePlayed([], [{ ...done('choochoo', 'X', 0, 'Rust Belt'), completedAt: new Date(0) }])
    expect(g.lastPlayedAt).toBeNull()
  })
})

describe('sortPlayed', () => {
  const list = aggregatePlayed(
    [active('bga', 'Carcassonne')],
    [done('bga', 'Azul', 30), done('bga', 'Azul', 20), done('bga', 'Azul', 10), done('bga', 'Brass', 1)],
  )
  const names = (mode: Parameters<typeof sortPlayed>[1]) => sortPlayed(list, mode).map(g => g.gameName)

  it('most played first', () => expect(names('most')).toEqual(['Azul', 'Brass', 'Carcassonne']))
  it('least played first', () => expect(names('least')).toEqual(['Carcassonne', 'Brass', 'Azul']))
  it('recent: running games, then by last finish', () => expect(names('recent')).toEqual(['Carcassonne', 'Brass', 'Azul']))
  it('alphabetical', () => expect(names('name')).toEqual(['Azul', 'Brass', 'Carcassonne']))
})
