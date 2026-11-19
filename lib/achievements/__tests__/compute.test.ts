import { progressOf, findNewlyUnlocked, achievementLabel } from '../compute'
import { Achievement } from '../store'
import { FinishedGame } from '../../types'

const fg = (over: Partial<FinishedGame> = {}): FinishedGame => ({
  id: 'bga:1', platform: 'bga', gameName: 'Wingspan', completedAt: new Date('2026-01-01'), completedAgo: '', gameUrl: '', ...over,
})

const goal = (over: Partial<Achievement> = {}): Achievement => ({
  id: 'a1', platform: null, gameType: 'Wingspan', metric: 'played', target: 5, createdAt: '2026-01-01T00:00:00.000Z', ...over,
})

describe('progressOf', () => {
  it('counts every finished game of that type for "played"', () => {
    const games = [fg(), fg({ id: '2' }), fg({ id: '3', gameName: 'Other' })]
    expect(progressOf(goal({ metric: 'played' }), games)).toBe(2)
  })

  it('counts only wins for "won"', () => {
    const games = [fg({ result: 'won' }), fg({ id: '2', result: 'lost' }), fg({ id: '3', result: 'won' })]
    expect(progressOf(goal({ metric: 'won' }), games)).toBe(2)
  })

  it('matches by gameType when set, not the raw table title', () => {
    const games = [fg({ gameName: "Alice's game", gameType: 'Wingspan' })]
    expect(progressOf(goal(), games)).toBe(1)
  })

  it('matches case-insensitively', () => {
    const games = [fg({ gameName: 'WINGSPAN' })]
    expect(progressOf(goal(), games)).toBe(1)
  })

  it('narrows to one platform when the goal is platform-scoped', () => {
    const games = [fg({ platform: 'bga' }), fg({ id: '2', platform: 'yucata' })]
    expect(progressOf(goal({ platform: 'bga' }), games)).toBe(1)
    expect(progressOf(goal({ platform: null }), games)).toBe(2)
  })

  it('does not count a coop result as a win', () => {
    const games = [fg({ result: 'coop' })]
    expect(progressOf(goal({ metric: 'won' }), games)).toBe(0)
  })
})

describe('findNewlyUnlocked', () => {
  it('returns a goal whose progress just reached its target', () => {
    const games = [fg(), fg({ id: '2' }), fg({ id: '3' }), fg({ id: '4' }), fg({ id: '5' })]
    const achievements = [goal({ target: 5 })]
    expect(findNewlyUnlocked(achievements, games).map(a => a.id)).toEqual(['a1'])
  })

  it('does not return a goal still below target', () => {
    const games = [fg()]
    expect(findNewlyUnlocked([goal({ target: 5 })], games)).toEqual([])
  })

  it('does not return a goal that is already marked achieved', () => {
    const games = [fg(), fg({ id: '2' }), fg({ id: '3' }), fg({ id: '4' }), fg({ id: '5' })]
    const achievements = [goal({ target: 5, achievedAt: '2026-01-02T00:00:00.000Z' })]
    expect(findNewlyUnlocked(achievements, games)).toEqual([])
  })
})

describe('achievementLabel', () => {
  it('describes a play goal', () => {
    expect(achievementLabel(goal({ metric: 'played', target: 10, gameType: 'Wingspan', platform: null }))).toBe('Play 10 Wingspan')
  })

  it('describes a win goal scoped to a platform', () => {
    expect(achievementLabel(goal({ metric: 'won', target: 3, gameType: 'Wingspan', platform: 'bga' }))).toBe('Win 3 Wingspan on BGA')
  })
})
