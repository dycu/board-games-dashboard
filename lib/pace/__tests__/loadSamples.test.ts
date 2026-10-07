jest.mock('@vercel/kv', () => ({ kv: { set: jest.fn(), rpush: jest.fn(), ltrim: jest.fn(), lrange: jest.fn() } }))

import { kv } from '@vercel/kv'
import { recordLoadSample } from '../loadSamples'

const set = kv.set as jest.Mock
const rpush = kv.rpush as jest.Mock

beforeEach(() => jest.clearAllMocks())

describe('recordLoadSample', () => {
  it('stores a sample when the throttle lock is free', async () => {
    set.mockResolvedValue('OK')
    await recordLoadSample({ bga: 28, yucata: 4 })
    expect(set).toHaveBeenCalledWith('pace:v1:load-sample-lock', 1, { nx: true, ex: 600 })
    expect(rpush).toHaveBeenCalledWith('pace:v1:load-samples', expect.objectContaining({ counts: { bga: 28, yucata: 4 } }))
  })

  it('skips when a sample was taken in the last 10 minutes', async () => {
    set.mockResolvedValue(null)
    await recordLoadSample({ bga: 28 })
    expect(rpush).not.toHaveBeenCalled()
  })

  it('never throws when KV fails', async () => {
    set.mockRejectedValue(new Error('KV down'))
    await expect(recordLoadSample({ bga: 1 })).resolves.toBeUndefined()
  })

  it('records nothing when every platform errored', async () => {
    await recordLoadSample({})
    expect(set).not.toHaveBeenCalled()
  })
})
