import { makeFinishedConnectors } from '@/lib/connectors'

describe('makeFinishedConnectors', () => {
  it('returns connectors for the expected platforms', () => {
    const connectors = makeFinishedConnectors()
    const platforms = Object.keys(connectors)
    expect(platforms).toContain('eighteenxx')
    expect(platforms).toContain('obg')
    expect(platforms).toContain('bga')
    expect(platforms).toContain('rally')
    expect(platforms).toContain('choochoo')
  })

  it('choochoo connector throws (must be proxied)', () => {
    const connectors = makeFinishedConnectors()
    expect(() => connectors.choochoo!()).toThrow()
  })
})
