jest.mock('@vercel/kv', () => ({ kv: { hgetall: jest.fn() } }))

import { kv } from '@vercel/kv'
import { estimateEighteenxxProgress, attachEighteenxxProgress, attachEighteenxxTurns } from '../progress'
import { EighteenxxPaceGame } from '../store'
import { Game, FinishedGame } from '../../types'

const mockHgetall = kv.hgetall as jest.Mock

const game = (id: string, title: string, end: number | null, actionCount: number | null, extra: Partial<EighteenxxPaceGame> = {}): EighteenxxPaceGame => ({
  id, title, end, actionCount, ...extra,
})

describe('estimateEighteenxxProgress', () => {
  it('estimates from the median action count of finished games of the same title', () => {
    const games = {
      active: game('active', '1846', null, 60),
      f1: game('f1', '1846', 1000, 100),
      f2: game('f2', '1846', 1000, 120),
      f3: game('f3', '1846', 1000, 140),
    }
    expect(estimateEighteenxxProgress(games, 'active')).toEqual({
      percent: 50, turnsSoFar: 60, estimatedTotalTurns: 120, sampleCount: 3, samples: [100, 120, 140], sameSizeOnly: false,
    })
  })

  it('returns undefined when the active game has no action count yet', () => {
    expect(estimateEighteenxxProgress({ active: game('active', '1846', null, null) }, 'active')).toBeUndefined()
  })

  it('returns undefined for a game that has already finished', () => {
    expect(estimateEighteenxxProgress({ active: game('active', '1846', 1000, 100) }, 'active')).toBeUndefined()
  })

  it('returns undefined when there is no finished sample of this title', () => {
    expect(estimateEighteenxxProgress({ active: game('active', '1846', null, 50) }, 'active')).toBeUndefined()
  })

  it('ignores finished games of a different title', () => {
    const games = { active: game('active', '1846', null, 50), other: game('other', '18USA', 1000, 200) }
    expect(estimateEighteenxxProgress(games, 'active')).toBeUndefined()
  })

  it('ignores other still-active games as samples', () => {
    const games = { active: game('active', '1846', null, 50), other: game('other', '1846', null, 400) }
    expect(estimateEighteenxxProgress(games, 'active')).toBeUndefined()
  })

  it('prefers samples with the same player count, falling back when none match', () => {
    const games = {
      active: game('active', '1846', null, 50, { playerCount: 4 }),
      twoP: game('twoP', '1846', 1000, 200, { playerCount: 2 }),
      fourP: game('fourP', '1846', 1000, 100, { playerCount: 4 }),
    }
    expect(estimateEighteenxxProgress(games, 'active')).toMatchObject({ sampleCount: 1, samples: [100], sameSizeOnly: true })
  })

  it('clamps percent at 100', () => {
    const games = { active: game('active', '1846', null, 500), f1: game('f1', '1846', 1000, 100) }
    expect(estimateEighteenxxProgress(games, 'active')?.percent).toBe(100)
  })
})

describe('attachEighteenxxProgress', () => {
  beforeEach(() => mockHgetall.mockReset())

  const eighteenxxGame = (id: string): Game => ({
    id, platform: 'eighteenxx', gameName: '1846', myTurn: true, lastMoveAt: new Date(), lastMoveAgo: '1h ago', urgent: false,
    gameUrl: 'https://18xx.games/game/1', platformUrl: 'https://18xx.games', players: [],
  })

  it('attaches progress when an estimate exists', async () => {
    mockHgetall.mockResolvedValue({ '1': game('1', '1846', null, 60), f1: game('f1', '1846', 1000, 120) })
    const [g] = await attachEighteenxxProgress([eighteenxxGame('eighteenxx:1')])
    expect(g.progress).toMatchObject({ percent: 50, turnsSoFar: 60 })
  })

  it('leaves non-18xx games untouched and skips the KV lookup', async () => {
    const yucataGame: Game = { ...eighteenxxGame('yucata:1'), platform: 'yucata' }
    const [g] = await attachEighteenxxProgress([yucataGame])
    expect(g.progress).toBeUndefined()
    expect(mockHgetall).not.toHaveBeenCalled()
  })

  it('attaches a progressError when the last read failed and there is no estimate', async () => {
    mockHgetall.mockResolvedValue({ '1': game('1', '1846', null, null, { lastError: 'HTTP 500' }) })
    const [g] = await attachEighteenxxProgress([eighteenxxGame('eighteenxx:1')])
    expect(g.progress).toBeUndefined()
    expect(g.progressError).toBe('HTTP 500')
  })

  it('does not attach a progressError when there is simply no sample yet', async () => {
    mockHgetall.mockResolvedValue({ '1': game('1', '1846', null, 60) })
    const [g] = await attachEighteenxxProgress([eighteenxxGame('eighteenxx:1')])
    expect(g.progressError).toBeUndefined()
  })
})

describe('attachEighteenxxTurns', () => {
  beforeEach(() => mockHgetall.mockReset())

  const finished = (id: string): FinishedGame => ({
    id, platform: 'eighteenxx', gameName: '1846', completedAt: new Date(), completedAgo: '1 day ago',
    gameUrl: 'https://18xx.games/game/1',
  })

  it('attaches the final action count when tracked', async () => {
    mockHgetall.mockResolvedValue({ '1': game('1', '1846', 1000, 140) })
    const [g] = await attachEighteenxxTurns([finished('eighteenxx:1')])
    expect(g.turns).toBe(140)
  })

  it('leaves turns unset when the game was never tracked', async () => {
    mockHgetall.mockResolvedValue({})
    const [g] = await attachEighteenxxTurns([finished('eighteenxx:1')])
    expect(g.turns).toBeUndefined()
  })
})
