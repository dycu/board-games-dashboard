/**
 * @jest-environment node
 */

jest.mock('https', () => ({
  request: jest.fn(),
}))

// The per-game finish times (lib/choochoo/endedAt) are tested on their own;
// here they're whatever the test says
const mockEndedTimes = new Map<number, Date>()
jest.mock('@/lib/choochoo/endedAt', () => ({
  resolveEndedTimes: jest.fn(async () => mockEndedTimes),
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
    mockEndedTimes.clear()
    process.env = { ...OLD_ENV, CHOOCHOO_USERNAME: 'user', CHOOCHOO_PASSWORD: 'pass' }
    mockedRequest.mockReset()
  })
  afterEach(() => { process.env = OLD_ENV })

  it('returns finished games as JSON', async () => {
    const xsrfBody = JSON.stringify({ xsrfToken: 'tok123' })
    const loginBody = JSON.stringify({ user: { id: 99 } })
    // API already filters by userId, so all returned games belong to the user
    const gamesBody = JSON.stringify({
      games: [
        { id: 777, name: 'Steam', playerIds: [99, 2], updatedAt: '2026-06-01T00:00:00Z' },
        { id: 888, name: 'Age of Steam', playerIds: [99, 3], updatedAt: '2026-06-05T00:00:00Z' },
      ],
      nextPageCursor: null,
    })

    mockedRequest
      .mockImplementationOnce(makeHttpsResponse(xsrfBody, ['XSRF-TOKEN=tok123; Path=/']) as any)
      .mockImplementationOnce(makeHttpsResponse(loginBody, ['session=abc; Path=/']) as any)
      .mockImplementationOnce(makeHttpsResponse(gamesBody) as any)

    const res = await GET()
    const json = await res.json()
    expect(json.error).toBeNull()
    expect(json.games).toHaveLength(2)
    expect(json.games[0]).toMatchObject({
      id: 'choochoo:777',
      platform: 'choochoo',
      gameName: 'Steam',
      completedAgo: expect.any(String),
    })
    expect(new Date(json.games[0].completedAt)).toBeInstanceOf(Date)
  })

  it('dates each game by its last turn start, not the epoch, when the list gives no date', async () => {
    const xsrfBody = JSON.stringify({ xsrfToken: 'tok123' })
    const loginBody = JSON.stringify({ user: { id: 99 } })
    // Real list entries have no date field at all
    const gamesBody = JSON.stringify({ games: [{ id: 3443, name: 'Rust Belt', playerIds: [99] }, { id: 3444, name: 'Other', playerIds: [99] }], nextPageCursor: null })
    mockedRequest
      .mockImplementationOnce(makeHttpsResponse(xsrfBody, ['XSRF-TOKEN=tok123; Path=/']) as any)
      .mockImplementationOnce(makeHttpsResponse(loginBody, ['session=abc; Path=/']) as any)
      .mockImplementationOnce(makeHttpsResponse(gamesBody) as any)
    mockEndedTimes.set(3443, new Date('2026-10-25T15:40:07.000Z'))

    const json = await (await GET()).json()
    expect(json.games[0].completedAt).toBe('2026-10-25T15:40:07.000Z')
    expect(json.games[0].completedAgo).not.toBe('unknown')
    // no time found for this one: still listed, just undated as before
    expect(json.games[1].completedAt).toBe('1970-01-01T00:00:00.000Z')
  })

  it('returns empty games when credentials missing', async () => {
    process.env = { ...OLD_ENV }
    delete process.env.CHOOCHOO_USERNAME
    const res = await GET()
    const json = await res.json()
    expect(json.games).toEqual([])
  })
})
