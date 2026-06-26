import { getPrefs, savePrefs } from '@/lib/prefs'
import { DEFAULT_PREFS } from '@/lib/types'

jest.mock('@vercel/kv', () => ({
  kv: {
    get: jest.fn(),
    set: jest.fn(),
  },
}))

import { kv } from '@vercel/kv'

describe('prefs', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns defaults when KV has no entry', async () => {
    ;(kv.get as jest.Mock).mockResolvedValue(null)
    const result = await getPrefs()
    expect(result).toEqual(DEFAULT_PREFS)
  })

  it('returns stored prefs when KV has entry', async () => {
    const stored = { ...DEFAULT_PREFS, pins: ['bga:1'] }
    ;(kv.get as jest.Mock).mockResolvedValue(stored)
    const result = await getPrefs()
    expect(result).toEqual(stored)
  })

  it('merges partial update into existing prefs', async () => {
    ;(kv.get as jest.Mock).mockResolvedValue(DEFAULT_PREFS)
    await savePrefs({ pins: ['bga:99'] })
    expect(kv.set).toHaveBeenCalledWith(
      'user-prefs',
      { ...DEFAULT_PREFS, pins: ['bga:99'] }
    )
  })

  it('falls back to defaults when KV throws', async () => {
    ;(kv.get as jest.Mock).mockRejectedValue(new Error('KV down'))
    const result = await getPrefs()
    expect(result).toEqual(DEFAULT_PREFS)
  })
})
