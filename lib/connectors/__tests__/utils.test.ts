import { choochooGameType, withTimeout, pendingLobbyText } from '../utils'

describe('pendingLobbyText', () => {
  it('says "waiting for players" when the total seat count is unknown', () => {
    expect(pendingLobbyText(1)).toBe('1 joined — waiting for players')
  })

  it('says "waiting for players" (with the count) when short of the known total', () => {
    expect(pendingLobbyText(1, 4)).toBe('1/4 joined — waiting for players')
  })

  it('says "waiting to start" only once every known seat is filled', () => {
    expect(pendingLobbyText(4, 4)).toBe('4/4 joined — waiting to start')
  })

  it('still says "waiting to start" if somehow over the known total', () => {
    expect(pendingLobbyText(5, 4)).toBe('5/4 joined — waiting to start')
  })
})

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
