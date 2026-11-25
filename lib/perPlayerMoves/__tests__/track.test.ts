jest.mock('@vercel/kv', () => ({ kv: { hgetall: jest.fn(), hget: jest.fn(), hset: jest.fn(), hdel: jest.fn() } }))

import { kv } from '@vercel/kv'
import { attachPerPlayerMoveCounts, ME_KEY, OPPONENTS_KEY } from '../track'
import { Game } from '../../types'

const watchStore = new Map<string, Record<string, unknown>>()
const daysStore = new Map<string, Record<string, unknown>>()

function game(id: string, myTurn: boolean, overrides: Partial<Game> = {}): Game {
  return {
    id, platform: 'obg', gameName: id, myTurn,
    lastMoveAt: new Date(), lastMoveAgo: '', urgent: false,
    gameUrl: '', platformUrl: '', players: [], ...overrides,
  }
}

const TODAY = '2026-11-19'

beforeEach(() => {
  jest.clearAllMocks()
  watchStore.clear()
  daysStore.clear()
  // attachPerPlayerMoveCounts calls todayKey() with no argument (via
  // lib/moveCounts/track), so this has to mock `new Date()` itself — see
  // the same note in lib/moveCounts/__tests__/track.test.ts.
  jest.useFakeTimers().setSystemTime(new Date(`${TODAY}T12:00:00Z`))
  ;(kv.hgetall as jest.Mock).mockImplementation(async (k: string) => watchStore.get(k) ?? null)
  ;(kv.hget as jest.Mock).mockImplementation(async (k: string, field: string) => (daysStore.get(k) ?? {})[field] ?? null)
  ;(kv.hset as jest.Mock).mockImplementation(async (k: string, v: Record<string, unknown>) => {
    const store = k.startsWith('pptrack-watch') ? watchStore : daysStore
    store.set(k, { ...(store.get(k) ?? {}), ...v })
  })
  ;(kv.hdel as jest.Mock).mockImplementation(async (k: string, ...fields: string[]) => {
    const store = k.startsWith('pptrack-watch') ? watchStore : daysStore
    const current = { ...(store.get(k) ?? {}) }
    for (const f of fields) delete current[f]
    store.set(k, current)
  })
})

afterEach(() => jest.useRealTimers())

describe('attachPerPlayerMoveCounts', () => {
  it('starts tracking a game the first time it is seen, crediting no one when it has no moves today yet', async () => {
    await attachPerPlayerMoveCounts('obg', [game('obg:1', false, { players: ['Alice'] })])
    expect(watchStore.get('pptrack-watch:v1:obg')).toEqual({ 'obg:1': { myTurn: false, opponentName: 'Alice' } })
    expect(daysStore.size).toBe(0)
  })

  it('back-credits my own moves already counted today by lib/moveCounts the first time a table is seen', async () => {
    await attachPerPlayerMoveCounts('obg', [game('obg:1', false, { players: ['Alice'], moveCountToday: 4 })])
    expect(daysStore.get('pptrack-days:v1:obg')).toEqual({ 'obg:1': { [TODAY]: { [ME_KEY]: 4 } } })
  })

  it('credits me when myTurn flips from true to false', async () => {
    watchStore.set('pptrack-watch:v1:obg', { 'obg:1': { myTurn: true, opponentName: 'Alice' } })
    await attachPerPlayerMoveCounts('obg', [game('obg:1', false, { players: ['Alice'] })])
    expect(daysStore.get('pptrack-days:v1:obg')).toEqual({ 'obg:1': { [TODAY]: { [ME_KEY]: 1 } } })
  })

  it('credits the resolved opponent by name when myTurn flips from false to true', async () => {
    watchStore.set('pptrack-watch:v1:obg', { 'obg:1': { myTurn: false, opponentName: 'Alice' } })
    await attachPerPlayerMoveCounts('obg', [game('obg:1', true, { players: ['Alice'] })])
    expect(daysStore.get('pptrack-days:v1:obg')).toEqual({ 'obg:1': { [TODAY]: { Alice: 1 } } })
  })

  it('credits the previous currentPlayer mid-wait when the table hands off without myTurn flipping', async () => {
    watchStore.set('pptrack-watch:v1:obg', { 'obg:1': { myTurn: false, opponentName: 'Alice' } })
    await attachPerPlayerMoveCounts('obg', [game('obg:1', false, { players: ['Alice', 'Bob', 'Carol'], currentPlayer: 'Bob' })])
    expect(daysStore.get('pptrack-days:v1:obg')).toEqual({ 'obg:1': { [TODAY]: { Alice: 1 } } })
    expect(watchStore.get('pptrack-watch:v1:obg')).toEqual({ 'obg:1': { myTurn: false, opponentName: 'Bob' } })
  })

  it('falls back to the aggregate opponents key for a 3+ player game that never reports currentPlayer', async () => {
    watchStore.set('pptrack-watch:v1:obg', { 'obg:1': { myTurn: false, opponentName: undefined } })
    await attachPerPlayerMoveCounts('obg', [game('obg:1', true, { players: ['Alice', 'Bob', 'Carol'] })])
    expect(daysStore.get('pptrack-days:v1:obg')).toEqual({ 'obg:1': { [TODAY]: { [OPPONENTS_KEY]: 1 } } })
  })

  it('adds to an existing same-day count rather than overwriting it', async () => {
    watchStore.set('pptrack-watch:v1:obg', { 'obg:1': { myTurn: true, opponentName: 'Alice' } })
    daysStore.set('pptrack-days:v1:obg', { 'obg:1': { [TODAY]: { [ME_KEY]: 4 }, '2026-11-18': { [ME_KEY]: 9 } } })
    await attachPerPlayerMoveCounts('obg', [game('obg:1', false, { players: ['Alice'] })])
    expect(daysStore.get('pptrack-days:v1:obg')).toEqual({
      'obg:1': { [TODAY]: { [ME_KEY]: 5 }, '2026-11-18': { [ME_KEY]: 9 } },
    })
  })

  it('leaves an untouched game alone (no credit, no write)', async () => {
    watchStore.set('pptrack-watch:v1:obg', { 'obg:1': { myTurn: true, opponentName: 'Alice' } })
    await attachPerPlayerMoveCounts('obg', [game('obg:1', true, { players: ['Alice'] })])
    expect(daysStore.size).toBe(0)
  })

  it('drops tracking and history for a game that vanished from the live list', async () => {
    watchStore.set('pptrack-watch:v1:obg', { 'obg:1': { myTurn: true, opponentName: 'Alice' } })
    daysStore.set('pptrack-days:v1:obg', { 'obg:1': { [TODAY]: { [ME_KEY]: 3 } } })
    await attachPerPlayerMoveCounts('obg', [])
    expect(watchStore.get('pptrack-watch:v1:obg')).toEqual({})
    expect(daysStore.get('pptrack-days:v1:obg')).toEqual({})
  })

  it('returns the games list unchanged — this is tracking only, no field is attached', async () => {
    const games = [game('obg:1', true, { players: ['Alice'] })]
    const result = await attachPerPlayerMoveCounts('obg', games)
    expect(result).toBe(games)
  })

  // A lobby's currentPlayer is pendingLobbyText's own status blurb ("1/2
  // joined — waiting for players"), not a player name — resolveOpponent
  // can't tell the two apart, so a pending game is excluded here entirely
  // rather than ever letting that text be stored as an "opponent" that
  // could later get credited with a move once the table actually starts.
  it('does not start tracking a pending lobby at all, even though it reports a currentPlayer', async () => {
    await attachPerPlayerMoveCounts('obg', [
      game('obg:1', false, { pending: true, currentPlayer: '1/2 joined — waiting for players', players: [] }),
    ])
    expect(watchStore.get('pptrack-watch:v1:obg')).toBeUndefined()
    expect(daysStore.size).toBe(0)
  })

  it('starts tracking fresh once a lobby actually starts, crediting the real first player — not the lobby status text', async () => {
    // The table was pending last fetch (not tracked at all — see above);
    // now it's started, with a real player up
    await attachPerPlayerMoveCounts('obg', [game('obg:1', false, { currentPlayer: 'alice', players: ['alice'] })])
    expect(watchStore.get('pptrack-watch:v1:obg')).toEqual({ 'obg:1': { myTurn: false, opponentName: 'alice' } })
    expect(daysStore.size).toBe(0) // first time seen as an active game — nothing credited yet, same as any other
  })
})
