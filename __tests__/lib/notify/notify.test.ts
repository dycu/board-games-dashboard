import { buildDigest } from '@/lib/notify/digest'
import { dueSoon, deadlineEmail } from '@/lib/notify/deadlines'
import { StreamedGame } from '@/lib/notify/types'

const NOW = Date.parse('2026-10-08T06:00:00Z')
const H = 3600 * 1000

const game = (id: string, over: Partial<StreamedGame> = {}): StreamedGame => ({
  id, platform: 'bga', gameName: `Game ${id}`, myTurn: true,
  lastMoveAt: new Date(NOW - 5 * H).toISOString(), gameUrl: `https://x/${id}`, ...over,
})

describe('buildDigest', () => {
  it('lists my games, most urgent first, then the longest waiting', () => {
    const d = buildDigest([
      game('old', { lastMoveAt: new Date(NOW - 48 * H).toISOString() }),
      game('due', { deadlineAt: new Date(NOW + 3 * H).toISOString() }),
      game('new'),
    ], { now: NOW, opponentSlowDays: 5 })
    expect(d.subject).toBe('Board games: 3 waiting for you, 1 due within a day')
    const order = ['Game due', 'Game old', 'Game new'].map(n => d.text.indexOf(n))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(d.text).toMatch(/Game due \(BGA\) — waiting 5h · ⏱ 3h left/)
    expect(d.html).toContain('<a href="https://x/due">Game due</a>')
  })

  it('lists games stalled on opponents and the next backlog game', () => {
    const d = buildDigest([
      game('stalled', { myTurn: false, currentPlayer: 'bob', lastMoveAt: new Date(NOW - 8 * 24 * H).toISOString() }),
      game('fresh', { myTurn: false, currentPlayer: 'amy' }),
    ], {
      now: NOW, opponentSlowDays: 5,
      nextFromBacklog: { id: 'bga:x', platform: 'bga', gameName: 'Brass', playUrl: 'https://x/brass', addedAt: '' },
    })
    expect(d.subject).toBe('Board games: all caught up')
    expect(d.text).toContain('Stalled on opponents')
    expect(d.text).toContain("Game stalled (BGA) — bob hasn't moved for 8 days")
    expect(d.text).not.toContain('Game fresh')
    expect(d.text).toContain('Next from your backlog: Brass (BGA)')
  })

  it('escapes HTML in game names', () => {
    expect(buildDigest([game('1', { gameName: '<b>x</b>' })], { now: NOW, opponentSlowDays: 5 }).html).toContain('&lt;b&gt;x&lt;/b&gt;')
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
