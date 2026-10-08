import { buildWeekly } from '@/lib/notify/weekly'
import { FinishedGame } from '@/lib/types'
import { StreamedGame } from '@/lib/notify/types'

const NOW = Date.parse('2026-10-11T17:00:00Z')
const D = 86_400_000

const fg = (id: string, daysAgo: number, over: Partial<FinishedGame> = {}): FinishedGame => ({
  id, platform: 'bga', gameName: `Game ${id}`, completedAt: new Date(NOW - daysAgo * D), completedAgo: '', gameUrl: `https://x/${id}`, ...over,
})
const active = (id: string, myTurn: boolean, daysAgo: number): StreamedGame => ({
  id, platform: 'bga', gameName: `Active ${id}`, myTurn, currentPlayer: myTurn ? undefined : 'bob',
  lastMoveAt: new Date(NOW - daysAgo * D).toISOString(), gameUrl: `https://x/a${id}`,
})

describe('buildWeekly', () => {
  it("summarizes the week's finished games, ELO, pace and stalled games", () => {
    const w = buildWeekly(
      [
        fg('1', 1, { result: 'won', rank: 1, playerCount: 3, elo: 1340, eloDelta: 30 }),
        fg('2', 2, { result: 'lost', rank: 2, playerCount: 2, elo: 1320, eloDelta: -10 }),
        fg('old', 9, { result: 'won' }),
      ],
      [active('a', true, 0.2), active('b', false, 6), active('c', false, 1)],
      { now: NOW, pace: { turns: 20, medianHours: 4.5, turnsPerDay: 2.9 } },
    )
    expect(w.subject).toBe('Board games week: 2 finished, 1 won (50%)')
    expect(w.text).toContain('2 finished · 1 won · 1 lost · ELO +20 on BGA')
    expect(w.text).toContain('• Game 1 — BGA · 1st of 3 · ELO 1340 (+30)')
    expect(w.text).not.toContain('Game old')
    expect(w.text).toContain('My BGA pace: 20 moves, median 4.5h to answer, 2.9 moves/day.')
    expect(w.text).toContain('3 games going, 1 waiting for you.')
    expect(w.text.indexOf('Active b')).toBeLessThan(w.text.indexOf('Active c'))
    expect(w.html).toContain('<a href="https://x/1">Game 1</a>')
  })

  it('handles a week with nothing finished', () => {
    const w = buildWeekly([], [], { now: NOW })
    expect(w.subject).toBe('Board games week: no games finished')
  })
})
