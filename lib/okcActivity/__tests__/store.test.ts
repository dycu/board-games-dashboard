jest.mock('@vercel/kv', () => ({ kv: { get: jest.fn(), set: jest.fn() } }))

import { kv } from '@vercel/kv'
import { getActivity, setActivity } from '../store'

const mockGet = kv.get as jest.Mock
const mockSet = kv.set as jest.Mock

describe('okcActivity store', () => {
  beforeEach(() => { mockGet.mockReset(); mockSet.mockReset() })

  it('reads the stored activity for a game id', async () => {
    mockGet.mockResolvedValue({ signature: 'sig', lastMoveAt: '2026-01-01T00:00:00.000Z' })
    const result = await getActivity('game-1')
    expect(mockGet).toHaveBeenCalledWith('okc-activity:v1:game-1')
    expect(result).toEqual({ signature: 'sig', lastMoveAt: '2026-01-01T00:00:00.000Z' })
  })

  it('returns null when nothing is stored yet', async () => {
    mockGet.mockResolvedValue(null)
    expect(await getActivity('game-1')).toBeNull()
  })

  it('returns null instead of throwing when KV is unavailable', async () => {
    mockGet.mockRejectedValue(new Error('kv down'))
    expect(await getActivity('game-1')).toBeNull()
  })

  it('writes the activity under the game-scoped key', async () => {
    await setActivity('game-1', { signature: 'sig', lastMoveAt: '2026-01-01T00:00:00.000Z' })
    expect(mockSet).toHaveBeenCalledWith('okc-activity:v1:game-1', { signature: 'sig', lastMoveAt: '2026-01-01T00:00:00.000Z' })
  })

  it('swallows a write failure instead of throwing', async () => {
    mockSet.mockRejectedValue(new Error('kv down'))
    await expect(setActivity('game-1', { signature: 'sig', lastMoveAt: '2026-01-01T00:00:00.000Z' })).resolves.toBeUndefined()
  })
})
