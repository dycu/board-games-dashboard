/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/connectors')

import { connectors } from '@/lib/connectors'
import { GET } from '../route'

const mockConnectors = connectors as jest.Mocked<typeof connectors>

describe('GET /api/test-connection', () => {
  beforeEach(() => {
    // Set up a mock for the 'bga' connector
    mockConnectors.bga = jest.fn()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('valid platform that succeeds returns { ok: true } with 200', async () => {
    ;(mockConnectors.bga as jest.Mock).mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/test-connection?platform=bga')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual({ ok: true })
    expect(mockConnectors.bga).toHaveBeenCalledTimes(1)
  })

  it('valid platform that throws returns { ok: false, error } with 200', async () => {
    ;(mockConnectors.bga as jest.Mock).mockRejectedValue(new Error('Login failed'))

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
})
