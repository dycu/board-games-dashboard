/**
 * @jest-environment node
 */
jest.mock('@/lib/connectors')

import { fetchAllPlatforms } from '@/lib/connectors'
import { GET, dynamic } from '../route'

const mockFetchAllPlatforms = fetchAllPlatforms as jest.MockedFunction<typeof fetchAllPlatforms>

describe('GET /api/games', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('calls fetchAllPlatforms and returns its result as JSON with 200', async () => {
    const mockResult = {
      games: [],
      errors: [],
      fetchedAt: '2026-06-26T00:00:00.000Z',
    }
    mockFetchAllPlatforms.mockResolvedValue(mockResult)

    const res = await GET()
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual(mockResult)
    expect(mockFetchAllPlatforms).toHaveBeenCalledTimes(1)
  })

  it('exports dynamic as force-dynamic', () => {
    expect(dynamic).toBe('force-dynamic')
  })
})
