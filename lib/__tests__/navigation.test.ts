import { isBackForwardNavigation } from '../navigation'

describe('isBackForwardNavigation', () => {
  const original = performance.getEntriesByType

  afterEach(() => {
    performance.getEntriesByType = original
  })

  it('returns true when the navigation entry type is back_forward', () => {
    performance.getEntriesByType = jest.fn().mockReturnValue([{ type: 'back_forward' }])
    expect(isBackForwardNavigation()).toBe(true)
  })

  it('returns false for a fresh navigate', () => {
    performance.getEntriesByType = jest.fn().mockReturnValue([{ type: 'navigate' }])
    expect(isBackForwardNavigation()).toBe(false)
  })

  it('returns false for a reload, e.g. a tablet reopening a discarded tab', () => {
    performance.getEntriesByType = jest.fn().mockReturnValue([{ type: 'reload' }])
    expect(isBackForwardNavigation()).toBe(false)
  })

  it('returns false when there is no navigation entry', () => {
    performance.getEntriesByType = jest.fn().mockReturnValue([])
    expect(isBackForwardNavigation()).toBe(false)
  })
})
