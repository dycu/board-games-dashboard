/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/connectors')
jest.mock('@/lib/prefs')

import { makeConnectors } from '@/lib/connectors'
import { getPrefs } from '@/lib/prefs'
import { GET } from '../route'
import { DEFAULT_PREFS } from '@/lib/types'

const mockMakeConnectors = makeConnectors as jest.MockedFunction<typeof makeConnectors>
const mockGetPrefs = getPrefs as jest.MockedFunction<typeof getPrefs>

const mockBgaFetcher = jest.fn()
const mockConnectorMap = {
  bga: mockBgaFetcher,
  eighteenxx: jest.fn(),
  obg: jest.fn(),
  yucata: jest.fn(),
  choochoo: jest.fn(),
  hansa: jest.fn(),
  rally: jest.fn(),
}

beforeEach(() => {
  mockGetPrefs.mockResolvedValue(DEFAULT_PREFS)
  mockMakeConnectors.mockReturnValue(mockConnectorMap as any)
})

afterEach(() => {
  jest.clearAllMocks()
})

describe('GET /api/test-connection', () => {
  it('valid platform that succeeds returns { ok: true } with 200', async () => {
    mockBgaFetcher.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/test-connection?platform=bga')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual({ ok: true })
    expect(mockBgaFetcher).toHaveBeenCalledTimes(1)
  })

  it('valid platform that throws returns { ok: false, error } with 200', async () => {
    mockBgaFetcher.mockRejectedValue(new Error('Login failed'))

    const req = new NextRequest('http://localhost/api/test-connection?platform=bga')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual({ ok: false, error: 'Login failed' })
  })

  it('missing platform param returns { ok: false, error: "Invalid platform" } with 400', async () => {
    const req = new NextRequest('http://localhost/api/test-connection')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data).toEqual({ ok: false, error: 'Invalid platform' })
  })

  it('unknown platform value returns { ok: false, error: "Invalid platform" } with 400', async () => {
    const req = new NextRequest('http://localhost/api/test-connection?platform=unknown')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data).toEqual({ ok: false, error: 'Invalid platform' })
  })

  it('passes eighteenxxSessionCookie from prefs to makeConnectors', async () => {
    mockGetPrefs.mockResolvedValue({ ...DEFAULT_PREFS, eighteenxxSessionCookie: 'abc123' })
    mockConnectorMap.eighteenxx = jest.fn().mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/test-connection?platform=eighteenxx')
    await GET(req)

    expect(mockMakeConnectors).toHaveBeenCalledWith(expect.any(Number), 'abc123')
  })
})
