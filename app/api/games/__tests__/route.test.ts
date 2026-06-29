/**
 * @jest-environment node
 */

jest.mock('@/lib/connectors', () => {
  const bga = jest.fn()
  return {
    makeConnectors: jest.fn(() => ({ bga })),
    connectors: { bga },
    hasCreds: jest.fn(),
  }
})

import { GET, dynamic } from '../route'
import { connectors, hasCreds } from '@/lib/connectors'

const mockBgaFetch = connectors.bga as jest.MockedFunction<() => Promise<any[]>>
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

describe('GET /api/games', () => {
  beforeEach(() => {
    mockBgaFetch.mockReset()
    mockHasCreds.mockReset()
  })

  it('exports dynamic as force-dynamic', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('emits start, platform, and done events over SSE', async () => {
    mockHasCreds.mockReturnValue(true)
    mockBgaFetch.mockResolvedValue([{ id: 'bga:1', platform: 'bga', gameName: 'Chess' }])

    const res = await GET()
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')

    const events = await consumeSSE(res.body as ReadableStream<Uint8Array>)
    expect(events[0]).toEqual({ type: 'start', platforms: ['bga'] })
    expect(events[1]).toMatchObject({ type: 'platform', platform: 'bga', error: null })
    expect(events[1].games).toHaveLength(1)
    expect(events[2]).toMatchObject({ type: 'done', fetchedAt: expect.any(String) })
  })

  it('emits error event when a connector throws', async () => {
    mockHasCreds.mockReturnValue(true)
    mockBgaFetch.mockRejectedValue(new Error('login failed'))

    const res = await GET()
    const events = await consumeSSE(res.body as ReadableStream<Uint8Array>)
    const platformEvent = events.find(e => e.type === 'platform')
    expect(platformEvent).toMatchObject({ platform: 'bga', games: [], error: 'login failed' })
  })

  it('emits empty start when no platforms have credentials', async () => {
    mockHasCreds.mockReturnValue(false)

    const res = await GET()
    const events = await consumeSSE(res.body as ReadableStream<Uint8Array>)
    expect(events[0]).toEqual({ type: 'start', platforms: [] })
    expect(events[events.length - 1].type).toBe('done')
  })
})
