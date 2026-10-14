import { choochooGameType, parseChoochooProgress, withTimeout } from '../utils'

describe('choochooGameType', () => {
  it.each([
    ['rust-belt', 'Rust Belt'],
    ['poland', 'Poland'],
    ['SwedenRecycling', 'Sweden Recycling'],
    ['reversteam', 'Reversteam'],
  ])('%s -> %s', (key, name) => {
    expect(choochooGameType(key)).toBe(name)
  })
})

describe('parseChoochooProgress', () => {
  it('parses a "Turn X/Y" summary into an exact progress estimate', () => {
    expect(parseChoochooProgress('Turn 5/6 - Select actions')).toEqual({
      percent: 83, turnsSoFar: 5, estimatedTotalTurns: 6, sampleCount: 0, samples: [], sameSizeOnly: false, exact: true,
    })
  })

  it('tolerates extra spacing around the slash', () => {
    expect(parseChoochooProgress('Turn 1 / 10')).toMatchObject({ turnsSoFar: 1, estimatedTotalTurns: 10 })
  })

  it('returns undefined for a summary with no turn counter', () => {
    expect(parseChoochooProgress('Draft phase')).toBeUndefined()
  })

  it('returns undefined for undefined input', () => {
    expect(parseChoochooProgress(undefined)).toBeUndefined()
  })

  it('clamps percent at 100 if turnsSoFar somehow exceeds the total', () => {
    expect(parseChoochooProgress('Turn 9/6')?.percent).toBe(100)
  })
})

describe('withTimeout', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('resolves with the promise\'s value when it settles before the timeout', async () => {
    const result = withTimeout(Promise.resolve('ok'), 1000, 'test')
    await expect(result).resolves.toBe('ok')
  })

  it('rejects with a labeled error once the timeout elapses first', async () => {
    const hung = new Promise(() => {}) // never settles
    const result = withTimeout(hung, 1000, 'slowplatform')
    jest.advanceTimersByTime(1000)
    await expect(result).rejects.toThrow('slowplatform timed out after 1s')
  })

  it('propagates the original rejection when the promise fails before the timeout', async () => {
    const result = withTimeout(Promise.reject(new Error('boom')), 1000, 'test')
    await expect(result).rejects.toThrow('boom')
  })
})
