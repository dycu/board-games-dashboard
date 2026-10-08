jest.mock('@vercel/kv', () => ({ kv: { get: jest.fn(), set: jest.fn() } }))

import { kv } from '@vercel/kv'
import { activeKey, lastActiveChange, resolveLastMoves, TableRef } from '@/lib/connectors/bgaLastMove'

const mockGet = kv.get as jest.Mock
const mockSet = kv.set as jest.Mock

const active = (id: number, t: number, who: string) =>
  ({ packet_id: id, time: t, data: [{ type: 'gameStateChange', args: { type: 'activeplayer', active_player: who } }] })
const action = (id: number, t: number) => ({ packet_id: id, time: t, data: [{ type: 'notif', args: {} }] })

describe('activeKey', () => {
  it('lists players flagged myturn, sorted', () => {
    expect(activeKey({ b: { myturn: '1' }, a: { myturn: 1 }, c: { myturn: '0' } })).toBe('a,b')
  })
})

describe('lastActiveChange', () => {
  it('returns when the active player last changed, ignoring later actions', () => {
    const r = lastActiveChange([active(11, 100, 'me'), action(12, 150), active(13, 200, 'bob'), action(14, 260)], 10, ['me'])
    expect(r).toEqual({ changedAt: 200, activeIds: ['bob'], packetId: 14, lastTime: 260 })
  })

  it('skips packets already seen', () => {
    expect(lastActiveChange([active(5, 50, 'bob'), action(12, 150)], 10, ['bob']).changedAt).toBeNull()
  })

  it('treats a multiactive refill within one packet as one change', () => {
    const p = { packet_id: 11, time: 300, data: [
      { type: 'gameStateChange', args: { type: 'multipleactiveplayer' } },
      { type: 'gameStateMultipleActiveUpdate', args: ['me', 'bob'] },
    ] }
    expect(lastActiveChange([p], 10, ['me', 'bob']).changedAt).toBeNull()
    expect(lastActiveChange([p], 10, ['me']).changedAt).toBe(300)
  })
})

describe('resolveLastMoves', () => {
  const table = (id: string, flagged: string): TableRef =>
    ({ id, gameserver: '1', game_name: 'g', players: { [flagged]: { myturn: '1' } } })

  beforeEach(() => { mockGet.mockReset(); mockSet.mockReset().mockResolvedValue(undefined) })

  it('reuses the cached time while the same player is active, without reading history', async () => {
    mockGet.mockResolvedValue({ t1: { active: 'bob', since: 500, packetId: 20, activeIds: ['bob'] } })
    const fetchPackets = jest.fn()
    const out = await resolveLastMoves([table('t1', 'bob')], fetchPackets, {})
    expect(out.get('t1')).toBe(500)
    expect(fetchPackets).not.toHaveBeenCalled()
  })

  it('reads only new packets when the active player changes', async () => {
    mockGet.mockResolvedValue({ t1: { active: 'bob', since: 500, packetId: 20, activeIds: ['bob'] } })
    const fetchPackets = jest.fn(async () => [action(21, 600), active(22, 700, 'me')])
    const out = await resolveLastMoves([table('t1', 'me')], fetchPackets, {})
    expect(fetchPackets).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), 21)
    expect(out.get('t1')).toBe(700)
    expect(mockSet).toHaveBeenCalledWith('bga-lastmove:v1', { t1: { active: 'me', since: 700, packetId: 22, activeIds: ['me'] } })
  })

  it('starts from the Pace sync state for a table it has not seen', async () => {
    mockGet.mockResolvedValue(null)
    const fetchPackets = jest.fn(async () => [active(41, 900, 'me')])
    const out = await resolveLastMoves([table('t2', 'me')], fetchPackets, { t2: { lastPacketId: 40, active: ['bob'], lastTime: 800 } })
    expect(fetchPackets).toHaveBeenCalledWith(expect.anything(), 41)
    expect(out.get('t2')).toBe(900)
  })

  it('leaves out a table whose history fails, and drops finished tables from the cache', async () => {
    mockGet.mockResolvedValue({ gone: { active: 'x', since: 1, packetId: 1, activeIds: [] } })
    const out = await resolveLastMoves([table('t3', 'me')], jest.fn(async () => { throw new Error('boom') }), {})
    expect(out.has('t3')).toBe(false)
    expect(mockSet).toHaveBeenCalledWith('bga-lastmove:v1', {})
  })
})
