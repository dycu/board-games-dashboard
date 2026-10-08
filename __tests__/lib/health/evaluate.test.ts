import { evaluateHealth } from '@/lib/health/evaluate'

const T1 = '2026-10-08T06:00:00Z'
const T2 = '2026-10-09T06:00:00Z'

describe('evaluateHealth', () => {
  it('alerts once when a platform starts failing, not again while it stays broken', () => {
    const first = evaluateHealth([{ platform: 'obg', error: 'boom' }], { obg: { lastOkAt: T1, lastOkCount: 5 } }, T2)
    expect(first.alerts).toEqual([expect.objectContaining({ platform: 'obg', kind: 'broken' })])
    expect(first.state.obg).toMatchObject({ error: 'boom', failingSince: T2, lastOkCount: 5 })

    const second = evaluateHealth([{ platform: 'obg', error: 'boom' }], first.state, '2026-10-10T06:00:00Z')
    expect(second.alerts).toEqual([])
    expect(second.state.obg?.failingSince).toBe(T2)
  })

  it('alerts when a failing platform recovers', () => {
    const { alerts, state } = evaluateHealth([{ platform: 'obg', count: 4 }], { obg: { error: 'x', failingSince: T1 } }, T2)
    expect(alerts).toEqual([expect.objectContaining({ kind: 'recovered' })])
    expect(state.obg).toEqual({ lastOkAt: T2, lastOkCount: 4 })
  })

  it('alerts when games suddenly drop to zero, but not from a small count', () => {
    expect(evaluateHealth([{ platform: 'bga', count: 0 }], { bga: { lastOkCount: 12 } }, T2).alerts)
      .toEqual([expect.objectContaining({ kind: 'emptied' })])
    expect(evaluateHealth([{ platform: 'bga', count: 0 }], { bga: { lastOkCount: 1 } }, T2).alerts).toEqual([])
    expect(evaluateHealth([{ platform: 'bga', count: 0 }], {}, T2).alerts).toEqual([])
  })

  it('stays quiet for healthy platforms and forgets ones no longer checked', () => {
    const { alerts, state } = evaluateHealth([{ platform: 'bga', count: 10 }], { bga: { lastOkCount: 9 }, hansa: { lastOkCount: 1 } }, T2)
    expect(alerts).toEqual([])
    expect(Object.keys(state)).toEqual(['bga'])
  })
})
