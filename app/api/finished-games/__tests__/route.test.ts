/**
 * @jest-environment node
 */

jest.mock('@/lib/connectors', () => ({
  makeFinishedConnectors: jest.fn(),
  hasCreds: jest.fn(),
}))

import { GET } from '../route'
import { makeFinishedConnectors, hasCreds } from '@/lib/connectors'

const mockMakeFinished = makeFinishedConnectors as jest.MockedFunction<typeof makeFinishedConnectors>
const mockHasCreds = hasCreds as jest.MockedFunction<typeof hasCreds>

async function consumeSSE(body: ReadableStream<Uint8Array>): Promise<any[]> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const events: any[] = []
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''
    for (const chunk of chunks) {
      if (chunk.startsWith('data: ')) events.push(JSON.parse(chunk.slice(6)))
    }
  }
  return events
}

describe('GET /api/finished-games', () => {
  beforeEach(() => {
    mockMakeFinished.mockReset()
    mockHasCreds.mockReset()
  })

  it('emits start, platform, and done events over SSE', async () => {
    mockHasCreds.mockReturnValue(true)
    const mockFetcher = jest.fn().mockResolvedValue([{
      id: 'eighteenxx:1',
      platform: 'eighteenxx',
      gameName: '1830',
      completedAt: new Date('2026-06-01').toISOString(),
      completedAgo: '4 weeks ago',
      gameUrl: 'https://18xx.games/game/1',
    }])
    mockMakeFinished.mockReturnValue({ eighteenxx: mockFetcher } as any)

    const res = await GET()
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')

    const events = await consumeSSE(res.body as ReadableStream<Uint8Array>)
    expect(events[0]).toEqual({ type: 'start', platforms: ['eighteenxx'] })
    expect(events[1]).toMatchObject({ type: 'platform', platform: 'eighteenxx', error: null })
    expect(events[1].games).toHaveLength(1)
    expect(events[2]).toMatchObject({ type: 'done', fetchedAt: expect.any(String) })
  })

  it('emits error when a connector throws', async () => {
    mockHasCreds.mockReturnValue(true)
    mockMakeFinished.mockReturnValue({
      eighteenxx: jest.fn().mockRejectedValue(new Error('login failed')),
    } as any)

    const res = await GET()
    const events = await consumeSSE(res.body as ReadableStream<Uint8Array>)
    const platformEvent = events.find(e => e.type === 'platform')
    expect(platformEvent).toMatchObject({ platform: 'eighteenxx', games: [], error: 'login failed' })
  })

  it('emits empty start when no platforms have credentials', async () => {
    mockHasCreds.mockReturnValue(false)
    mockMakeFinished.mockReturnValue({ eighteenxx: jest.fn() } as any)

    const res = await GET()
    const events = await consumeSSE(res.body as ReadableStream<Uint8Array>)
    expect(events[0]).toEqual({ type: 'start', platforms: [] })
    expect(events[events.length - 1].type).toBe('done')
  })
})
