import { choochooGameType } from '../utils'

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
