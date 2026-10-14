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

  it('uses a manual (pasted-cookie) session without logging in, when there is no cache', async () => {
    const manual = { cookie: 'PHPSESSID=abc; TournoiEnLigneidt=tok123', playerId: '42' }
    const result = await withBgaSession('u', 'p', async s => s, { manual })
    expect(result).toEqual({ cookies: { PHPSESSID: 'abc', TournoiEnLigneidt: 'tok123' }, myId: '42', token: 'tok123' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('caches a successful manual session so later calls skip re-parsing it', async () => {
    const manual = { cookie: 'TournoiEnLigneidt=tok123', playerId: '42' }
    await withBgaSession('u', 'p', async s => s, { manual })
    expect(store.get('bga-session:v1')).toMatchObject({ myId: '42', token: 'tok123' })
  })

  it('still works via the manual session during a login cooldown', async () => {
    store.set('bga-login-failed:v1', 'earlier failure')
    const manual = { cookie: 'TournoiEnLigneidt=tok123', playerId: '42' }
    const result = await withBgaSession('u', 'p', async s => s.myId, { manual })
    expect(result).toBe('42')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('falls back to a real login when the manual cookie has no token', async () => {
    const manual = { cookie: 'PHPSESSID=abc', playerId: '42' } // no TournoiEnLigneidt/id
    await expect(withBgaSession('u', 'p', async () => 'x', { manual })).rejects.toThrow()
    expect(mockFetch).toHaveBeenCalled() // fell through to an actual login attempt
  })

  it('calls onFreshLogin only when a real login happens, not for cached or manual sessions', async () => {
    const onFreshLogin = jest.fn()
    store.set('bga-session:v1', CACHED)
    await withBgaSession('u', 'p', async s => s, { onFreshLogin })
    expect(onFreshLogin).not.toHaveBeenCalled()

    store.clear()
    const manual = { cookie: 'TournoiEnLigneidt=tok123', playerId: '42' }
    await withBgaSession('u', 'p', async s => s, { manual, onFreshLogin })
    expect(onFreshLogin).not.toHaveBeenCalled()
  })
})
