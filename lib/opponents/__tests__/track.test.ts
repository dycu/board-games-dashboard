jest.mock('@vercel/kv', () => ({ kv: { hgetall: jest.fn(), hset: jest.fn(), hdel: jest.fn(), get: jest.fn(), set: jest.fn() } }))

import { kv } from '@vercel/kv'
import { attachOpponentTracking } from '../track'
import { Game } from '../../types'

const watchStore = new Map<string, Record<string, unknown>>()
const opponentStore = new Map<string, Record<string, unknown>>()
const mySamplesStore = new Map<string, number[]>()

function game(id: string, myTurn: boolean, overrides: Partial<Game> = {}): Game {
  return {
    id, platform: 'obg', gameName: id, myTurn,
    lastMoveAt: new Date('2026-11-19T12:00:00Z'), lastMoveAgo: '', urgent: false,
    gameUrl: '', platformUrl: '', players: ['Alice'], ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  watchStore.clear()
  opponentStore.clear()
  mySamplesStore.clear()
  jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-11-19T12:00:00Z').getTime())
  ;(kv.hgetall as jest.Mock).mockImplementation(async (k: string) => {
    if (k.startsWith('responsetimewatch')) return watchStore.get(k) ?? null
    if (k.startsWith('opponents')) return opponentStore.get(k) ?? null
    return null
  })
  ;(kv.hset as jest.Mock).mockImplementation(async (k: string, v: Record<string, unknown>) => {
    const store = k.startsWith('responsetimewatch') ? watchStore : opponentStore
    store.set(k, { ...(store.get(k) ?? {}), ...v })
  })
  ;(kv.hdel as jest.Mock).mockImplementation(async (k: string, ...fields: string[]) => {
    const store = k.startsWith('responsetimewatch') ? watchStore : opponentStore
    const current = { ...(store.get(k) ?? {}) }
    for (const f of fields) delete current[f]
    store.set(k, current)
  })
  ;(kv.get as jest.Mock).mockImplementation(async (k: string) => mySamplesStore.get(k) ?? null)
  ;(kv.set as jest.Mock).mockImplementation(async (k: string, v: number[]) => { mySamplesStore.set(k, v) })
})

afterEach(() => jest.restoreAllMocks())

describe('attachOpponentTracking', () => {
  it('starts tracking a game the first time it is seen, recording no sample', async () => {
    await attachOpponentTracking('obg', [game('obg:1', false)])
    expect(watchStore.get('responsetimewatch:v1:obg')).toEqual({
      'obg:1': { myTurn: false, since: 1795089600, opponentName: 'Alice' },
    })
    expect(opponentStore.size).toBe(0)
    expect(mySamplesStore.size).toBe(0)
  })

  it('records my response time when myTurn flips from true to false', async () => {
    watchStore.set('responsetimewatch:v1:obg', { 'obg:1': { myTurn: true, since: 1795089600 - 3600, opponentName: 'Alice' } })
    await attachOpponentTracking('obg', [game('obg:1', false)])
    expect(mySamplesStore.get('myresponsetime:v1:obg')).toEqual([3600])
  })

  it("records the opponent's response time when myTurn flips from false to true", async () => {
    watchStore.set('responsetimewatch:v1:obg', { 'obg:1': { myTurn: false, since: 1795089600 - 7200, opponentName: 'Alice' } })
    await attachOpponentTracking('obg', [game('obg:1', true)])
    expect(opponentStore.get('opponents:v1:obg')).toEqual({
      Alice: { tags: [], responseSamples: [7200] },
    })
  })

  it("mirrors a game's playerAvatars onto the matching opponent entry", async () => {
    await attachOpponentTracking('obg', [
      game('obg:1', false, { players: ['Alice'], playerAvatars: { Alice: 'https://example.com/alice.jpg' } }),
    ])
    expect(opponentStore.get('opponents:v1:obg')).toEqual({
      Alice: { tags: [], responseSamples: [], avatarUrl: 'https://example.com/alice.jpg' },
    })
  })

  it('keeps an existing tag/sample history when only the avatar changes', async () => {
    opponentStore.set('opponents:v1:obg', { Alice: { tags: ['friend'], responseSamples: [100] } })
    await attachOpponentTracking('obg', [
      game('obg:1', false, { players: ['Alice'], playerAvatars: { Alice: 'https://example.com/alice.jpg' } }),
    ])
    expect(opponentStore.get('opponents:v1:obg')).toEqual({
      Alice: { tags: ['friend'], responseSamples: [100], avatarUrl: 'https://example.com/alice.jpg' },
    })
  })

  it('does not write anything when the avatar url has not changed', async () => {
    opponentStore.set('opponents:v1:obg', { Alice: { tags: [], responseSamples: [], avatarUrl: 'https://example.com/alice.jpg' } })
    await attachOpponentTracking('obg', [
      game('obg:1', false, { players: ['Alice'], playerAvatars: { Alice: 'https://example.com/alice.jpg' } }),
    ])
    expect(kv.hset).not.toHaveBeenCalledWith('opponents:v1:obg', expect.anything())
  })

  it('does not record a sample for an ambiguous multi-player wait with no resolvable opponent', async () => {
    watchStore.set('responsetimewatch:v1:obg', { 'obg:1': { myTurn: false, since: 1795089600 - 7200, opponentName: undefined } })
    await attachOpponentTracking('obg', [game('obg:1', true, { players: ['Alice', 'Bob'], currentPlayer: undefined })])
    expect(opponentStore.size).toBe(0)
  })

  it('stops tracking a game once it disappears from the live list, without recording a sample', async () => {
    watchStore.set('responsetimewatch:v1:obg', { 'obg:1': { myTurn: false, since: 1795089600 - 7200, opponentName: 'Alice' } })
    await attachOpponentTracking('obg', [])
    expect(watchStore.get('responsetimewatch:v1:obg')).toEqual({})
    expect(opponentStore.size).toBe(0)
  })

  it('samples the previous opponent and restarts the clock when currentPlayer changes mid-wait', async () => {
    // Still waiting (myTurn stays false) but the resolved opponent moved on
    // from Alice to Bob without it coming back to me — Alice's segment is
    // sampled on its own, not folded into whatever Bob takes afterward.
    watchStore.set('responsetimewatch:v1:obg', { 'obg:1': { myTurn: false, since: 1795089600 - 1800, opponentName: 'Alice' } })
    await attachOpponentTracking('obg', [game('obg:1', false, { players: ['Alice', 'Bob'], currentPlayer: 'Bob' })])
    expect(opponentStore.get('opponents:v1:obg')).toEqual({
      Alice: { tags: [], responseSamples: [1800] },
    })
    expect(watchStore.get('responsetimewatch:v1:obg')).toEqual({
      'obg:1': { myTurn: false, since: 1795089600, opponentName: 'Bob' },
    })
  })

  it('leaves other platforms\' games untouched', async () => {
    const other = game('bga:1', false, { platform: 'bga' })
    const result = await attachOpponentTracking('obg', [other])
    expect(result).toEqual([other])
    expect(watchStore.size).toBe(0)
  })

  it('returns the games unchanged if a KV read fails, instead of losing the list', async () => {
    (kv.hgetall as jest.Mock).mockRejectedValueOnce(new Error('KV unavailable'))
    const games = [game('obg:1', false)]
    expect(await attachOpponentTracking('obg', games)).toEqual(games)
  })
})
