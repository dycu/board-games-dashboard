/**
 * @jest-environment node
 */
jest.mock('@/lib/newGames/store')

import { getEvents, getSeenAt, setSeenAt } from '@/lib/newGames/store'
import { GET, POST } from '../route'
import { NewGameEvent } from '@/lib/newGames/diff'

const mockGetEvents = getEvents as jest.MockedFunction<typeof getEvents>
const mockGetSeenAt = getSeenAt as jest.MockedFunction<typeof getSeenAt>
const mockSetSeenAt = setSeenAt as jest.MockedFunction<typeof setSeenAt>

const event = (id: string, at: string): NewGameEvent =>
  ({ id, at, source: 'bga', platform: 'bga', kind: 'new', name: id, url: `https://x/${id}` })

describe('GET /api/new-games', () => {
  beforeEach(() => {
    mockGetEvents.mockReset()
    mockGetSeenAt.mockReset()
  })

  it('returns only events after the last seen time by default', async () => {
    mockGetEvents.mockResolvedValue([event('a', '2026-01-02T00:00:00Z'), event('b', '2026-01-01T00:00:00Z')])
    mockGetSeenAt.mockResolvedValue('2026-01-01T12:00:00Z')

    const res = await GET(new Request('https://x/api/new-games'))
    const json = await res.json()
    expect(json.events.map((e: NewGameEvent) => e.id)).toEqual(['a'])
  })

  it('returns everything when nothing has ever been seen', async () => {
    mockGetEvents.mockResolvedValue([event('a', '2026-01-02T00:00:00Z'), event('b', '2026-01-01T00:00:00Z')])
    mockGetSeenAt.mockResolvedValue(null)

    const res = await GET(new Request('https://x/api/new-games'))
    const json = await res.json()
    expect(json.events.map((e: NewGameEvent) => e.id)).toEqual(['a', 'b'])
  })

  it('?all=1 returns everything regardless of what has been seen, for the persistent page', async () => {
    mockGetEvents.mockResolvedValue([event('a', '2026-01-02T00:00:00Z'), event('b', '2026-01-01T00:00:00Z')])
    mockGetSeenAt.mockResolvedValue('2026-01-01T12:00:00Z')

    const res = await GET(new Request('https://x/api/new-games?all=1'))
    const json = await res.json()
    expect(json.events.map((e: NewGameEvent) => e.id)).toEqual(['a', 'b'])
  })
})

describe('POST /api/new-games', () => {
  beforeEach(() => {
    mockGetSeenAt.mockReset()
    mockSetSeenAt.mockReset()
  })

  it('advances seenAt when the new value is later', async () => {
    mockGetSeenAt.mockResolvedValue('2026-01-01T00:00:00Z')
    const res = await POST(new Request('https://x/api/new-games', {
      method: 'POST', body: JSON.stringify({ seenUpTo: '2026-01-02T00:00:00Z' }),
    }))
    expect(res.status).toBe(200)
    expect(mockSetSeenAt).toHaveBeenCalledWith('2026-01-02T00:00:00Z')
  })

  it('does not move seenAt backwards', async () => {
    mockGetSeenAt.mockResolvedValue('2026-01-05T00:00:00Z')
    await POST(new Request('https://x/api/new-games', {
      method: 'POST', body: JSON.stringify({ seenUpTo: '2026-01-02T00:00:00Z' }),
    }))
    expect(mockSetSeenAt).not.toHaveBeenCalled()
  })
})
