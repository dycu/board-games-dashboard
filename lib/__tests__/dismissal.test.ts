import { fetchSeesReturn } from '../dismissal'

describe('fetchSeesReturn', () => {
  it('counts a fetch started after returning', () => {
    expect(fetchSeesReturn(200, { returnedAt: 100, leftAt: null })).toBe(true)
  })

  it('ignores a fetch started before returning (while away)', () => {
    expect(fetchSeesReturn(50, { returnedAt: 100, leftAt: null })).toBe(false)
  })

  it('ignores a fetch started after leaving again', () => {
    expect(fetchSeesReturn(300, { returnedAt: 100, leftAt: 250 })).toBe(false)
  })

  it('counts a fetch started before leaving again', () => {
    expect(fetchSeesReturn(200, { returnedAt: 100, leftAt: 250 })).toBe(true)
  })
})
