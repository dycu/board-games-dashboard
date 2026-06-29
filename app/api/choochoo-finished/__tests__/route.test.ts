/**
 * @jest-environment node
 */

jest.mock('https', () => ({
  request: jest.fn(),
}))

import { GET } from '../route'
import { request as mockRequest } from 'https'
const mockedRequest = mockRequest as jest.MockedFunction<typeof mockRequest>

function makeHttpsResponse(body: string, cookies: string[] = [], statusCode = 200) {
  return (_opts: any, callback: any) => {
    const res = {
      statusCode,
      headers: { 'set-cookie': cookies },
      on: (event: string, handler: any) => {
        if (event === 'data') handler(Buffer.from(body))
        if (event === 'end') handler()
        return res
      },
    }
    callback(res)
    return {
      on: jest.fn().mockReturnThis(),
      write: jest.fn(),
      end: jest.fn(),
    }
  }
}

describe('GET /api/choochoo-finished', () => {
  const OLD_ENV = process.env
  beforeEach(() => {
    process.env = { ...OLD_ENV, CHOOCHOO_USERNAME: 'user', CHOOCHOO_PASSWORD: 'pass' }
    mockedRequest.mockReset()
  })
  afterEach(() => { process.env = OLD_ENV })

  it('returns finished games as JSON', async () => {
    const xsrfBody = JSON.stringify({ xsrfToken: 'tok123' })
    const loginBody = JSON.stringify({ user: { id: 99 } })
    const gamesBody = JSON.stringify({
      games: [
        { id: 777, name: 'Steam', playerIds: [99, 2], activePlayerId: null, updatedAt: '2026-06-01T00:00:00Z' },
        { id: 888, name: 'Age of Steam', playerIds: [1, 2], activePlayerId: null, updatedAt: '2026-06-05T00:00:00Z' },
      ],
    })

    mockedRequest
      .mockImplementationOnce(makeHttpsResponse(xsrfBody, ['XSRF-TOKEN=tok123; Path=/']) as any)
      .mockImplementationOnce(makeHttpsResponse(loginBody, ['session=abc; Path=/']) as any)
      .mockImplementationOnce(makeHttpsResponse(gamesBody) as any)

    const res = await GET()
    const json = await res.json()
    expect(json.error).toBeNull()
    expect(json.games).toHaveLength(1)
    expect(json.games[0]).toMatchObject({
      id: 'choochoo:777',
      platform: 'choochoo',
      gameName: 'Steam',
      completedAgo: expect.any(String),
    })
    expect(new Date(json.games[0].completedAt)).toBeInstanceOf(Date)
  })

  it('returns empty games when credentials missing', async () => {
    process.env = { ...OLD_ENV }
    delete process.env.CHOOCHOO_USERNAME
    const res = await GET()
    const json = await res.json()
    expect(json.games).toEqual([])
  })
})
