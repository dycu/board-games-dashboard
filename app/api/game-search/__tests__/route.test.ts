/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/catalogs/cache', () => ({
  CATALOG_PLATFORMS: ['bga', 'yucata', 'rally'],
  getCatalog: jest.fn(),
}))
jest.mock('@/lib/catalogs/match')

import { getCatalog } from '@/lib/catalogs/cache'
import { matchCatalog } from '@/lib/catalogs/match'
import { GET } from '../route'

const mockGetCatalog = getCatalog as jest.MockedFunction<typeof getCatalog>
const mockMatchCatalog = matchCatalog as jest.MockedFunction<typeof matchCatalog>

describe('GET /api/game-search', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns empty results without querying catalogs when q is missing', async () => {
    const req = new NextRequest('http://localhost/api/game-search')
    const res = await GET(req)
    const data = await res.json()

    expect(data).toEqual({ results: [], errors: [] })
    expect(mockGetCatalog).not.toHaveBeenCalled()
  })

  it('returns matches grouped by platform', async () => {
    mockGetCatalog.mockResolvedValue([{ name: 'Ark Nova', url: 'https://boardgamearena.com/arknova' }])
    mockMatchCatalog.mockReturnValue([{ name: 'Ark Nova', url: 'https://boardgamearena.com/arknova', score: 1 }])

    const req = new NextRequest('http://localhost/api/game-search?q=ark+nova')
    const res = await GET(req)
    const data = await res.json()

    expect(data.results).toHaveLength(3)
    expect(data.results.find((r: any) => r.platform === 'bga').matches).toEqual([
      { name: 'Ark Nova', url: 'https://boardgamearena.com/arknova' },
    ])
    expect(data.errors).toEqual([])
  })

  it('reports a platform error while still returning the others', async () => {
    mockGetCatalog.mockImplementation(async (platform: any) => {
      if (platform === 'yucata') throw new Error('Yucata down')
      return []
    })
    mockMatchCatalog.mockReturnValue([])

    const req = new NextRequest('http://localhost/api/game-search?q=test')
    const res = await GET(req)
    const data = await res.json()

    expect(data.errors).toEqual([{ platform: 'yucata', error: 'Yucata down' }])
    expect(data.results.find((r: any) => r.platform === 'bga').matches).toEqual([])
    expect(data.results.find((r: any) => r.platform === 'yucata').matches).toEqual([])
  })
})
