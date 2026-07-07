jest.mock('@vercel/kv', () => ({ kv: { get: jest.fn(), set: jest.fn() } }))
jest.mock('@/lib/catalogs/bga', () => ({ fetchBgaCatalog: jest.fn() }))

import { kv } from '@vercel/kv'
import { fetchBgaCatalog } from '@/lib/catalogs/bga'
import { getCatalog } from '@/lib/catalogs/cache'

const mockGet = kv.get as jest.Mock
const mockSet = kv.set as jest.Mock
const mockFetchBga = fetchBgaCatalog as jest.Mock

describe('getCatalog', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns the cached catalog without fetching on a KV hit', async () => {
    const cached = [{ name: 'Ark Nova', url: 'https://boardgamearena.com/arknova' }]
    mockGet.mockResolvedValue(cached)

    const result = await getCatalog('bga')

    expect(result).toEqual(cached)
    expect(mockFetchBga).not.toHaveBeenCalled()
  })

  it('fetches live and populates the cache on a KV miss', async () => {
    const fresh = [{ name: 'Ark Nova', url: 'https://boardgamearena.com/arknova' }]
    mockGet.mockResolvedValue(null)
    mockFetchBga.mockResolvedValue(fresh)

    const result = await getCatalog('bga')

    expect(result).toEqual(fresh)
    expect(mockSet).toHaveBeenCalledWith('game-catalog:v2:bga', fresh, { ex: 86400 })
  })

  it('falls back to a live fetch when kv.get throws', async () => {
    const fresh = [{ name: 'Ark Nova', url: 'https://boardgamearena.com/arknova' }]
    mockGet.mockRejectedValue(new Error('KV down'))
    mockFetchBga.mockResolvedValue(fresh)

    const result = await getCatalog('bga')

    expect(result).toEqual(fresh)
  })

  it('still returns fresh data when kv.set throws', async () => {
    const fresh = [{ name: 'Ark Nova', url: 'https://boardgamearena.com/arknova' }]
    mockGet.mockResolvedValue(null)
    mockFetchBga.mockResolvedValue(fresh)
    mockSet.mockRejectedValue(new Error('KV down'))

    const result = await getCatalog('bga')

    expect(result).toEqual(fresh)
  })
})
