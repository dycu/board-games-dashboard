jest.mock('@vercel/kv', () => ({ kv: { get: jest.fn(), set: jest.fn(), del: jest.fn() } }))

import { kv } from '@vercel/kv'
import { withBgaSession, BgaSession } from '@/lib/connectors/bga'

const mockFetch = jest.fn()
global.fetch = mockFetch
const store = new Map<string, unknown>()

const CACHED: BgaSession = { cookies: { PHPSESSID: 'cached' }, myId: '1', token: 't' }

beforeEach(() => {
  store.clear()
  mockFetch.mockReset().mockRejectedValue(new Error('network should not be used'))
  ;(kv.get as jest.Mock).mockImplementation(async (k: string) => store.get(k) ?? null)
  ;(kv.set as jest.Mock).mockImplementation(async (k: string, v: unknown) => { store.set(k, v); return 'OK' })
  ;(kv.del as jest.Mock).mockImplementation(async (k: string) => { store.delete(k); return 1 })
})

describe('withBgaSession', () => {
  it('reuses the cached session without logging in', async () => {
    store.set('bga-session:v1', CACHED)
    const result = await withBgaSession('u', 'p', async s => s.cookies.PHPSESSID)
    expect(result).toBe('cached')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('drops a rejected cached session and tries a fresh login', async () => {
    store.set('bga-session:v1', CACHED)
    const fn = jest.fn().mockRejectedValue(new Error('not logged in'))
    await expect(withBgaSession('u', 'p', fn)).rejects.toThrow()
    expect(fn).toHaveBeenCalledTimes(1)          // fresh login failed before fn ran again
    expect(mockFetch).toHaveBeenCalled()          // a login was attempted
    expect(store.has('bga-session:v1')).toBe(false)
  })

  it('pauses logins after a failed login instead of retrying', async () => {
    await expect(withBgaSession('u', 'p', async () => 'x')).rejects.toThrow()
    expect(store.get('bga-login-failed:v1')).toBeTruthy()
    const callsAfterFirst = mockFetch.mock.calls.length

    await expect(withBgaSession('u', 'p', async () => 'x')).rejects.toThrow('paused')
    expect(mockFetch.mock.calls.length).toBe(callsAfterFirst) // no new BGA requests
  })
})
