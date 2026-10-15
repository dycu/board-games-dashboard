jest.mock('@vercel/kv', () => ({ kv: { hgetall: jest.fn() } }))

import { kv } from '@vercel/kv'
import { estimateRallyProgress, attachRallyProgress, attachRallyTurns } from '../progress'
import { RallyPaceGame } from '../store'
import { Game, FinishedGame } from '../../types'

const mockHgetall = kv.hgetall as jest.Mock

const game = (id: string, type: string, end: number | null, turn: number | null, extra: Partial<RallyPaceGame> = {}): RallyPaceGame => ({
  id, game: type, end, turn, ...extra,
})

describe('estimateRallyProgress', () => {
  it('estimates from the median of finished games of the same type', () => {
    const games = {
      active: game('active', 'maria', null, 6),
      f1: game('f1', 'maria', 1000, 10),
      f2: game('f2', 'maria', 1000, 12),
      f3: game('f3', 'maria', 1000, 14),
    }
    expect(estimateRallyProgress(games, 'active')).toEqual({
      percent: 50, turnsSoFar: 6, estimatedTotalTurns: 12, sampleCount: 3, samples: [10, 12, 14], sameSizeOnly: false,
      sameSizeSampleCount: 0, totalSampleCount: 3,
    })
  })

  it('returns null when the active game has no turn yet', () => {
    expect(estimateRallyProgress({ active: game('active', 'maria', null, null) }, 'active')).toBeNull()
  })

  it('returns null for a game that has already finished', () => {
    const games = { active: game('active', 'maria', 1000, 10) }
    expect(estimateRallyProgress(games, 'active')).toBeNull()
  })

  it('returns null when there is no finished sample of this game type', () => {
    expect(estimateRallyProgress({ active: game('active', 'maria', null, 5) }, 'active')).toBeNull()
  })

  it('ignores finished games of a different title', () => {
    const games = { active: game('active', 'maria', null, 5), other: game('other', 'julius-caesar', 1000, 20) }
    expect(estimateRallyProgress(games, 'active')).toBeNull()
  })

  it('ignores other still-active games as samples', () => {
    const games = { active: game('active', 'maria', null, 5), other: game('other', 'maria', null, 20) }
    expect(estimateRallyProgress(games, 'active')).toBeNull()
  })

  it('prefers samples with the same player count, falling back when none match', () => {
    const games = {
      active: game('active', 'maria', null, 5, { playerCount: 4 }),
      twoP: game('twoP', 'maria', 1000, 20, { playerCount: 2 }),
      fourP: game('fourP', 'maria', 1000, 8, { playerCount: 4 }),
    }
    expect(estimateRallyProgress(games, 'active')).toMatchObject({ sampleCount: 1, samples: [8], sameSizeOnly: true, sameSizeSampleCount: 1, totalSampleCount: 2 })
  })

  it('clamps percent at 100', () => {
    const games = { active: game('active', 'maria', null, 50), f1: game('f1', 'maria', 1000, 10) }
    expect(estimateRallyProgress(games, 'active')?.percent).toBe(100)
  })
})

describe('attachRallyProgress', () => {
  beforeEach(() => mockHgetall.mockReset())

  const rallyGame = (id: string): Game => ({
    id, platform: 'rally', gameName: 'Maria', myTurn: true, lastMoveAt: new Date(), lastMoveAgo: '1h ago', urgent: false,
    gameUrl: 'https://rally-the-troops.com/maria/play.html?game=1&role=Frederick', platformUrl: 'https://rally-the-troops.com', players: [],
  })

  it('attaches progress to a Rally game when an estimate exists', async () => {
    mockHgetall.mockResolvedValue({ '1': game('1', 'maria', null, 6), f1: game('f1', 'maria', 1000, 12) })
    const [g] = await attachRallyProgress([rallyGame('rally:1')])
    expect(g.progress).toMatchObject({ percent: 50, turnsSoFar: 6 })
  })

  it('leaves non-Rally games untouched and skips the KV lookup', async () => {
    const yucataGame: Game = { ...rallyGame('yucata:1'), platform: 'yucata' }
    const [g] = await attachRallyProgress([yucataGame])
    expect(g.progress).toBeUndefined()
    expect(mockHgetall).not.toHaveBeenCalled()
  })

  it('attaches a progressError when the last read failed and there is no estimate', async () => {
    mockHgetall.mockResolvedValue({ '1': game('1', 'maria', null, null, { lastError: 'timed out waiting for the game state' }) })
    const [g] = await attachRallyProgress([rallyGame('rally:1')])
    expect(g.progress).toBeUndefined()
    expect(g.progressError).toBe('timed out waiting for the game state')
  })

  it('does not attach a progressError when there is simply no sample yet (no failure)', async () => {
    mockHgetall.mockResolvedValue({ '1': game('1', 'maria', null, 6) })
    const [g] = await attachRallyProgress([rallyGame('rally:1')])
    expect(g.progress).toBeUndefined()
    expect(g.progressError).toBeUndefined()
  })

  it('prefers a real estimate over a stale lastError from an earlier failed attempt', async () => {
    mockHgetall.mockResolvedValue({
      '1': game('1', 'maria', null, 6, { lastError: 'stale error from a previous sync' }),
      f1: game('f1', 'maria', 1000, 12),
    })
    const [g] = await attachRallyProgress([rallyGame('rally:1')])
    expect(g.progress).toMatchObject({ percent: 50 })
    expect(g.progressError).toBeUndefined()
  })
})

describe('attachRallyTurns', () => {
  beforeEach(() => mockHgetall.mockReset())

  const finished = (id: string): FinishedGame => ({
    id, platform: 'rally', gameName: 'Maria', completedAt: new Date(), completedAgo: '1 day ago',
    gameUrl: 'https://rally-the-troops.com/maria/play.html?game=1&role=Frederick',
  })

  it('attaches the final turn count when tracked', async () => {
    mockHgetall.mockResolvedValue({ '1': game('1', 'maria', 1000, 14) })
    const [g] = await attachRallyTurns([finished('rally:1')])
    expect(g.turns).toBe(14)
  })

  it('leaves turns unset when the game was never tracked', async () => {
    mockHgetall.mockResolvedValue({})
    const [g] = await attachRallyTurns([finished('rally:1')])
    expect(g.turns).toBeUndefined()
  })
})
