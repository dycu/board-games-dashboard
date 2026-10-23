import { buildYesterdayDigest } from '@/lib/notify/digest'
import { dueSoon, deadlineEmail } from '@/lib/notify/deadlines'
import { StreamedGame } from '@/lib/notify/types'
import { FinishedGame } from '@/lib/types'

const NOW = Date.parse('2026-10-08T06:00:00Z')
const H = 3600 * 1000

const game = (id: string, over: Partial<StreamedGame> = {}): StreamedGame => ({
  id, platform: 'bga', gameName: `Game ${id}`, myTurn: true,
  lastMoveAt: new Date(NOW - 5 * H).toISOString(), gameUrl: `https://x/${id}`, ...over,
})

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

describe('dueSoon', () => {
  const due = (id: string, hours: number, over: Partial<StreamedGame> = {}) =>
    game(id, { deadlineAt: new Date(NOW + hours * H).toISOString(), ...over })

  it('warns about my moves due within 12h, once per deadline', () => {
    const first = dueSoon([due('a', 5), due('b', 30), due('c', 2, { myTurn: false })], {}, NOW)
    expect(first.toWarn.map(g => g.id)).toEqual(['a'])

    // a few minutes later BGA's recomputed deadline has drifted slightly
    const again = dueSoon([due('a', 5.01)], first.warned, NOW + 10 * 60 * 1000)
    expect(again.toWarn).toEqual([])
  })

  it('warns again for a new turn with a new deadline', () => {
    const first = dueSoon([due('a', 5)], {}, NOW)
    expect(dueSoon([due('a', 11)], first.warned, NOW + 2 * 24 * H - 11 * H).toWarn).toHaveLength(1)
  })

  it('includes overdue moves', () => {
    expect(dueSoon([due('late', -3)], {}, NOW).toWarn).toHaveLength(1)
  })
})

describe('deadlineEmail', () => {
  it('names the game in the subject when there is one', () => {
    const g = game('a', { gameName: 'Brass', deadlineAt: new Date(NOW + 5 * H).toISOString() })
    const e = deadlineEmail([g], NOW)
    expect(e.subject).toBe('⏱ Brass: your move is due soon')
    expect(e.text).toContain('Brass (BGA) — 5h left')
  })
})
