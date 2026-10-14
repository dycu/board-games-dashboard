import { sendNtfy } from '@/lib/notify/ntfy'

const mockFetch = jest.fn()
global.fetch = mockFetch

describe('sendNtfy', () => {
  beforeEach(() => mockFetch.mockReset())

  it('does nothing when no topic is configured', async () => {
    const result = await sendNtfy('', 'Title', 'Message')
    expect(result).toEqual({ sent: false, reason: 'no ntfy topic configured' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('publishes via the JSON form, including click when given', async () => {
    mockFetch.mockResolvedValue({ ok: true })
    const result = await sendNtfy('my-topic', 'Title', 'Message', 'https://x/game')
    expect(result).toEqual({ sent: true })
    expect(mockFetch).toHaveBeenCalledWith('https://ntfy.sh/', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: 'my-topic', title: 'Title', message: 'Message', priority: 4, click: 'https://x/game' }),
    }))
  })

  it('reports a non-OK response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429 })
    const result = await sendNtfy('my-topic', 'Title', 'Message')
    expect(result).toEqual({ sent: false, reason: 'ntfy HTTP 429' })
  })

  it('reports a network failure', async () => {
    mockFetch.mockRejectedValue(new Error('network down'))
    const result = await sendNtfy('my-topic', 'Title', 'Message')
    expect(result).toEqual({ sent: false, reason: 'network down' })
  })
})
