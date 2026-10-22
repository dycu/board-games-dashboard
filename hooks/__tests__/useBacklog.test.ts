import { renderHook, waitFor, act } from '@testing-library/react'
import { useBacklog } from '../useBacklog'
import { BacklogItem } from '@/lib/backlog/list'

function mockFetch(items: BacklogItem[]) {
  global.fetch = jest.fn(async (url, opts) => {
    if (opts?.method === 'POST') return { ok: true, json: async () => ({ items }) }
    return { ok: true, json: async () => ({ items }) }
  }) as unknown as typeof fetch
}

describe('useBacklog toggleOrAdd', () => {
  it('adds a game not yet in the backlog, with the toggled list', async () => {
    mockFetch([])
    const { result } = renderHook(() => useBacklog())
    await waitFor(() => expect(result.current.items).toEqual([]))

    act(() => {
      result.current.toggleOrAdd({ platform: 'bga', gameName: 'Gaia Project', playUrl: 'https://x/1', list: 'favorite' })
    })

    expect(global.fetch).toHaveBeenLastCalledWith('/api/backlog', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ op: 'add', platform: 'bga', gameName: 'Gaia Project', playUrl: 'https://x/1', list: 'favorite' }),
    }))
  })

  it('toggles an existing game\'s list membership instead of re-adding it', async () => {
    const existing: BacklogItem = { id: 'bga:gaiaproject', platform: 'bga', gameName: 'Gaia Project', playUrl: 'https://x/1', addedAt: '', lists: ['play'] }
    mockFetch([existing])
    const { result } = renderHook(() => useBacklog())
    await waitFor(() => expect(result.current.items).toEqual([existing]))

    act(() => {
      result.current.toggleOrAdd({ platform: 'bga', gameName: 'Gaia Project', list: 'favorite' })
    })

    expect(global.fetch).toHaveBeenLastCalledWith('/api/backlog', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ op: 'toggle', id: 'bga:gaiaproject', list: 'favorite' }),
    }))
  })
})
