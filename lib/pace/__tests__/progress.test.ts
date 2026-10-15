jest.mock('@vercel/kv', () => ({ kv: { hgetall: jest.fn() } }))

import { kv } from '@vercel/kv'
import { estimateProgress, attachProgress, attachTurns } from '../progress'
import { PaceTable } from '../store'
import { INITIAL_TURN_STATE } from '../bgaTurns'
import { Game, FinishedGame } from '../../types'

const mockHgetall = kv.hgetall as jest.Mock

const table = (id: string, game: string, end: number | null, turnCount: number | null, extra: Partial<PaceTable> = {}): PaceTable => ({
  id, game, start: 0, end, history: end === null ? 'synced' : 'done', state: INITIAL_TURN_STATE,
  ...(turnCount !== null && { totalTurnState: { lastPacketId: 0, lastActivePlayer: null, count: turnCount } }),
  ...extra,
})

describe('estimateProgress', () => {
  it('estimates from the median of finished games of the same type', () => {
    const tables = {
      active: table('active', 'thecrew', null, 12),
      f1: table('f1', 'thecrew', 1000, 20),
      f2: table('f2', 'thecrew', 1000, 24),
      f3: table('f3', 'thecrew', 1000, 28),
    }
    expect(estimateProgress(tables, 'active')).toEqual({
      percent: 50, turnsSoFar: 12, estimatedTotalTurns: 24, sampleCount: 3, samples: [20, 24, 28], sameSizeOnly: false,
    })
  })

  it('returns null when the active table has no turn data yet', () => {
    const tables = { active: table('active', 'thecrew', null, null) }
    expect(estimateProgress(tables, 'active')).toBeNull()
  })

  it('returns null when there is no finished sample of this game type', () => {
    const tables = { active: table('active', 'thecrew', null, 5) }
    expect(estimateProgress(tables, 'active')).toBeNull()
  })

  it('ignores finished games of a different game type', () => {
    const tables = {
      active: table('active', 'thecrew', null, 10),
      other: table('other', 'wingspan', 1000, 40),
    }
    expect(estimateProgress(tables, 'active')).toBeNull()
  })

  it('ignores other still-running tables as samples', () => {
    const tables = {
      active: table('active', 'thecrew', null, 10),
      other: table('other', 'thecrew', null, 40),
    }
    expect(estimateProgress(tables, 'active')).toBeNull()
  })

  it('clamps percent at 100 for a game that has already run longer than the median', () => {
    const tables = {
      active: table('active', 'thecrew', null, 100),
      f1: table('f1', 'thecrew', 1000, 20),
    }
    expect(estimateProgress(tables, 'active')?.percent).toBe(100)
  })

  it('prefers samples with the same player count', () => {
    const tables = {
      active: table('active', 'thecrew', null, 10, { playerCount: 4 }),
      twoP: table('twoP', 'thecrew', 1000, 40, { playerCount: 2 }),
      fourP1: table('fourP1', 'thecrew', 1000, 16, { playerCount: 4 }),
      fourP2: table('fourP2', 'thecrew', 1000, 20, { playerCount: 4 }),
    }
    const result = estimateProgress(tables, 'active')
    expect(result).toMatchObject({ sampleCount: 2, samples: [16, 20], sameSizeOnly: true })
  })

  it('falls back to all samples of the type when none match the player count', () => {
    const tables = {
      active: table('active', 'thecrew', null, 10, { playerCount: 3 }),
      twoP: table('twoP', 'thecrew', 1000, 40, { playerCount: 2 }),
    }
    const result = estimateProgress(tables, 'active')
    expect(result).toMatchObject({ sampleCount: 1, samples: [40], sameSizeOnly: false })
  })

  it('does not filter by player count when the active table has none tracked', () => {
    const tables = {
      active: table('active', 'thecrew', null, 10),
      twoP: table('twoP', 'thecrew', 1000, 40, { playerCount: 2 }),
    }
    const result = estimateProgress(tables, 'active')
    expect(result).toMatchObject({ sampleCount: 1, sameSizeOnly: false })
  })

  describe('time-based fallback (no turn-count sample for this game type)', () => {
    const NOW = Date.parse('2026-01-10T00:00:00Z') / 1000
    beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW * 1000))
    afterEach(() => jest.restoreAllMocks())

    it('estimates from elapsed real time against the median real-time length of finished games of the type', () => {
      const dayAgo = NOW - 86400
      const tables = {
        active: table('active', 'thecrew', null, null, { start: dayAgo }),
        f1: table('f1', 'thecrew', dayAgo + 2 * 86400, null, { start: dayAgo }),
        f2: table('f2', 'thecrew', dayAgo + 4 * 86400, null, { start: dayAgo }),
      }
      expect(estimateProgress(tables, 'active')).toMatchObject({
        percent: 33, turnsSoFar: 86400, estimatedTotalTurns: 3 * 86400, sampleCount: 2, timeBased: true, sameSizeOnly: false,
      })
    })

    it('excludes realtime games from the duration samples', () => {
      const dayAgo = NOW - 86400
      const tables = {
        active: table('active', 'thecrew', null, null, { start: dayAgo }),
        liveGame: table('liveGame', 'thecrew', dayAgo + 1800, null, { start: dayAgo, realtime: true }),
      }
      expect(estimateProgress(tables, 'active')).toBeNull()
    })

    it('prefers same-player-count duration samples, like the turn-based estimate does', () => {
      const dayAgo = NOW - 86400
      const tables = {
        active: table('active', 'thecrew', null, null, { start: dayAgo, playerCount: 4 }),
        twoP: table('twoP', 'thecrew', dayAgo + 86400, null, { start: dayAgo, playerCount: 2 }),
        fourP: table('fourP', 'thecrew', dayAgo + 5 * 86400, null, { start: dayAgo, playerCount: 4 }),
      }
      expect(estimateProgress(tables, 'active')).toMatchObject({ sampleCount: 1, sameSizeOnly: true, estimatedTotalTurns: 5 * 86400 })
    })

    it('still prefers an available turn-count estimate over the time-based fallback', () => {
      const dayAgo = NOW - 86400
      const tables = {
        active: table('active', 'thecrew', null, 10, { start: dayAgo }),
        f1: table('f1', 'thecrew', dayAgo + 100, 20, { start: dayAgo }),
      }
      const result = estimateProgress(tables, 'active')
      expect(result?.timeBased).toBeUndefined()
      expect(result).toMatchObject({ turnsSoFar: 10 })
    })

    it('returns null when there are no duration samples either', () => {
      const tables = { active: table('active', 'thecrew', null, null, { start: NOW - 86400 }) }
      expect(estimateProgress(tables, 'active')).toBeNull()
    })
  })
})

describe('attachProgress', () => {
  beforeEach(() => mockHgetall.mockReset())

  const bgaGame = (id: string): Game => ({
    id, platform: 'bga', gameName: 'The Crew', myTurn: true, lastMoveAt: new Date(), lastMoveAgo: '1h ago', urgent: false,
    gameUrl: 'https://boardgamearena.com/1', platformUrl: 'https://boardgamearena.com', players: [],
  })

  it('attaches progress to a BGA game when an estimate exists', async () => {
    mockHgetall.mockResolvedValue({
      '1': table('1', 'thecrew', null, 12),
      f1: table('f1', 'thecrew', 1000, 24),
    })
    const [game] = await attachProgress([bgaGame('bga:1')])
    expect(game.progress).toMatchObject({ percent: 50, turnsSoFar: 12 })
  })

  it('leaves a game untouched when no estimate is available', async () => {
    mockHgetall.mockResolvedValue({})
    const [game] = await attachProgress([bgaGame('bga:1')])
    expect(game.progress).toBeUndefined()
  })

  it('leaves non-BGA games untouched and skips the KV lookup entirely', async () => {
    const yucataGame: Game = { ...bgaGame('yucata:1'), platform: 'yucata' }
    const [game] = await attachProgress([yucataGame])
    expect(game.progress).toBeUndefined()
    expect(mockHgetall).not.toHaveBeenCalled()
  })
})

describe('attachTurns', () => {
  beforeEach(() => mockHgetall.mockReset())

  const finished = (id: string): FinishedGame => ({
    id, platform: 'bga', gameName: 'The Crew', completedAt: new Date(), completedAgo: '1 day ago',
    gameUrl: 'https://boardgamearena.com/1',
  })

  it('attaches the final turn count when tracked', async () => {
    mockHgetall.mockResolvedValue({ '1': table('1', 'thecrew', 1000, 24) })
    const [game] = await attachTurns([finished('bga:1')])
    expect(game.turns).toBe(24)
  })

  it('leaves turns unset when the table was never tracked', async () => {
    mockHgetall.mockResolvedValue({})
    const [game] = await attachTurns([finished('bga:1')])
    expect(game.turns).toBeUndefined()
  })
})
