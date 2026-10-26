import { buildYesterdayDigest } from '@/lib/notify/digest'
import { FinishedGame } from '@/lib/types'

const NOW = Date.parse('2026-10-08T06:00:00Z')
const H = 3600 * 1000

const fg = (id: string, hoursAgo: number, over: Partial<FinishedGame> = {}): FinishedGame => ({
  id, platform: 'bga', gameName: `Game ${id}`, completedAt: new Date(NOW - hoursAgo * H), completedAgo: '', gameUrl: `https://x/${id}`, ...over,
})

describe('buildYesterdayDigest', () => {
  it('summarizes games finished in the last 24h, most recent first', () => {
    const d = buildYesterdayDigest([
      fg('1', 5, { result: 'won', rank: 1, playerCount: 3, elo: 1340, eloDelta: 30 }),
      fg('2', 10, { result: 'lost', rank: 2, playerCount: 2 }),
      fg('old', 2 * 24, { result: 'won' }), // more than a day ago
    ], { now: NOW })
    expect(d.subject).toBe('Board games yesterday: 2 finished, 1 won (50%)')
    expect(d.text).toContain('2 finished · 1 won · 1 lost')
    expect(d.text).toContain('Finished yesterday')
    expect(d.text).toContain('• Game 1 — BGA · 1st of 3 · ELO 1340 (+30)')
    expect(d.text).not.toContain('Game old')
    expect(d.html).toContain('<a href="https://x/1">Game 1</a>')
  })

  it('reports BGA pace when there is one', () => {
    const d = buildYesterdayDigest([], { now: NOW, pace: { turns: 4, medianHours: 2.5, turnsPerDay: null } })
    expect(d.text).toContain('My BGA pace: 4 moves yesterday, median 2.5h to answer.')
  })

  it('omits the pace line and finished section when there is nothing to report', () => {
    const d = buildYesterdayDigest([], { now: NOW, pace: { turns: 0, medianHours: null, turnsPerDay: null } })
    expect(d.subject).toBe('Board games yesterday: no games finished')
    expect(d.text).not.toContain('My BGA pace')
    expect(d.text).not.toContain('Finished yesterday')
  })

  it('escapes HTML in game names', () => {
    expect(buildYesterdayDigest([fg('1', 1, { gameName: '<b>x</b>' })], { now: NOW }).html).toContain('&lt;b&gt;x&lt;/b&gt;')
  })
})
