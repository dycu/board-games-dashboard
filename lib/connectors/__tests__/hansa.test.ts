/**
 * @jest-environment node
 */
import { fetchFinishedHansa } from '../hansa'

const ME = 'b8d0196e-9232-4e58-b4de-29516febac2b'

function finished(id: string, scores: [string, string, number][]) {
  return {
    id, status: 'finished', currentPlayerId: '', turnStartedAt: null,
    updatedAt: '2026-10-12T09:27:26Z', turnTimeoutSeconds: 86400,
    players: scores.map(([name, userId, victoryPoints]) => ({ name, userId, victoryPoints })),
  }
}

function mockGames(games: unknown[]) {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ games, nextCursor: null }) } as Response)
}

describe('fetchFinishedHansa', () => {
  it('ranks players by final victory points', async () => {
    mockGames([finished('g1', [['Me', ME, 34], ['A', 'a', 56], ['B', 'b', 40], ['C', 'c', 21]])])
    const [g] = await fetchFinishedHansa(ME)
    expect(g).toMatchObject({ result: 'lost', rank: 3, playerCount: 4, score: '34' })
    expect(g.opponents).toEqual([{ name: 'A', rank: 1 }, { name: 'B', rank: 2 }, { name: 'C', rank: 4 }])
  })

  it('reports a win, a shared first place as a draw, and skips other players\' games', async () => {
    mockGames([
      finished('g1', [['Me', ME, 60], ['A', 'a', 50]]),
      finished('g2', [['Me', ME, 50], ['A', 'a', 50]]),
      finished('g3', [['X', 'x', 10], ['Y', 'y', 20]]),
    ])
    const games = await fetchFinishedHansa(ME.replace(/-/g, ''))
    expect(games.map(g => g.result)).toEqual(['won', 'draw'])
  })
})
