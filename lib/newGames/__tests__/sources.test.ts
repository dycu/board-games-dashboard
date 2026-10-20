/**
 * @jest-environment node
 */
jest.mock('@/lib/catalogs/bga', () => ({ fetchBgaCatalogLoggedIn: jest.fn() }))
jest.mock('@/lib/catalogs/eighteenxx', () => ({ fetchEighteenxxCatalog: jest.fn() }))
jest.mock('@/lib/catalogs/rally', () => ({ fetchRallyCatalog: jest.fn() }))
jest.mock('@/lib/catalogs/yucata', () => ({ fetchYucataCatalog: jest.fn() }))
jest.mock('@/lib/catalogs/cache', () => ({ setCatalog: jest.fn() }))

import { fetchBgaCatalogLoggedIn } from '@/lib/catalogs/bga'
import { fetchEighteenxxCatalog } from '@/lib/catalogs/eighteenxx'
import { fetchRallyCatalog } from '@/lib/catalogs/rally'
import { fetchYucataCatalog } from '@/lib/catalogs/yucata'
import { setCatalog } from '@/lib/catalogs/cache'
import { SOURCES } from '../sources'

const mockBga = fetchBgaCatalogLoggedIn as jest.Mock
const mockEighteenxx = fetchEighteenxxCatalog as jest.Mock
const mockRally = fetchRallyCatalog as jest.Mock
const mockYucata = fetchYucataCatalog as jest.Mock
const mockSetCatalog = setCatalog as jest.Mock

const entry = (name: string, status?: string) => ({ name, url: `https://x/${name}`, ...(status && { status }) })

describe('SOURCES: refreshing the "Find a game" catalog cache from the same live fetch', () => {
  beforeEach(() => jest.clearAllMocks())

  it('bga: refreshes the cache with exactly what it just fetched, alpha included', async () => {
    const entries = [entry('Hundo', 'alpha'), entry('Ark Nova', 'public')]
    mockBga.mockResolvedValue(entries)

    await SOURCES.bga()

    expect(mockSetCatalog).toHaveBeenCalledWith('bga', entries)
  })

  it('eighteenxx: refreshes the cache too', async () => {
    const entries = [entry('1889', 'production')]
    mockEighteenxx.mockResolvedValue(entries)

    await SOURCES.eighteenxx()

    expect(mockSetCatalog).toHaveBeenCalledWith('eighteenxx', entries)
  })

  it('rally: refreshes the cache only after confirming the library actually has games', async () => {
    const entries = [entry('Maria')]
    mockRally.mockResolvedValue(entries)

    await SOURCES.rally()

    expect(mockSetCatalog).toHaveBeenCalledWith('rally', entries)
  })

  it('rally: does not poison the cache with an empty result it is about to reject as an error', async () => {
    mockRally.mockResolvedValue([])

    await expect(SOURCES.rally()).rejects.toThrow('Rally library: no games found')
    expect(mockSetCatalog).not.toHaveBeenCalled()
  })

  it('yucata: refreshes the cache only after confirming the catalog actually has games', async () => {
    const entries = [entry('Carcassonne')]
    mockYucata.mockResolvedValue(entries)

    await SOURCES.yucata()

    expect(mockSetCatalog).toHaveBeenCalledWith('yucata', entries)
  })

  it('yucata: does not poison the cache with an empty result it is about to reject as an error', async () => {
    mockYucata.mockResolvedValue([])

    await expect(SOURCES.yucata()).rejects.toThrow('Yucata catalog: no games found')
    expect(mockSetCatalog).not.toHaveBeenCalled()
  })

  it('yucata-blog: is not a game catalog, so it never touches the search cache', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => [] })) as unknown as typeof fetch

    await SOURCES['yucata-blog']()

    expect(mockSetCatalog).not.toHaveBeenCalled()
  })
})
