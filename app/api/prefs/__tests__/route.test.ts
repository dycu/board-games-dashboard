/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/prefs')

import { getPrefs, savePrefs } from '@/lib/prefs'
import { GET, POST } from '../route'

const mockGetPrefs = getPrefs as jest.MockedFunction<typeof getPrefs>
const mockSavePrefs = savePrefs as jest.MockedFunction<typeof savePrefs>

const defaultPrefs = {
  pins: [],
  sort: 'longest-wait' as const,
  filter: { turnStatus: 'all' as const, platforms: [] },
  disabledPlatforms: [],
}

describe('GET /api/prefs', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('returns prefs from getPrefs()', async () => {
    mockGetPrefs.mockResolvedValue(defaultPrefs)

    const res = await GET()
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual(defaultPrefs)
    expect(mockGetPrefs).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/prefs', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('calls savePrefs with request body and returns updated prefs', async () => {
    const updatedPrefs = {
      pins: ['bga:123'],
      sort: 'most-recent' as const,
      filter: { turnStatus: 'my-turn' as const, platforms: [] },
      disabledPlatforms: [],
    }
    mockSavePrefs.mockResolvedValue(undefined)
    mockGetPrefs.mockResolvedValue(updatedPrefs)

    const body = { pins: ['bga:123'], sort: 'most-recent' }
    const req = new NextRequest('http://localhost/api/prefs', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(mockSavePrefs).toHaveBeenCalledWith(body)
    expect(data).toEqual(updatedPrefs)
  })
})
