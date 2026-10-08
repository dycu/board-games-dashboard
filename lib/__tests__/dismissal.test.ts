import { fetchSeesReturn, openedAfterFetch } from '../dismissal'

describe('fetchSeesReturn (no grace)', () => {
  it('counts a fetch started after returning', () => {
    expect(fetchSeesReturn(200, { returnedAt: 100, leftAt: null }, 0)).toBe(true)
  })

  it('ignores a fetch started before returning (while away)', () => {
    expect(fetchSeesReturn(50, { returnedAt: 100, leftAt: null }, 0)).toBe(false)
  })

  it('ignores a fetch started after leaving again', () => {
    expect(fetchSeesReturn(300, { returnedAt: 100, leftAt: 250 }, 0)).toBe(false)
  })

  it('counts a fetch started before leaving again', () => {
    expect(fetchSeesReturn(200, { returnedAt: 100, leftAt: 250 }, 0)).toBe(true)
  })
})

describe('fetchSeesReturn grace period', () => {
  it('ignores fetches in the first minutes after returning', () => {
    expect(fetchSeesReturn(100 + 60_000, { returnedAt: 100, leftAt: null })).toBe(false)
    expect(fetchSeesReturn(100 + 5 * 60_000, { returnedAt: 100, leftAt: null })).toBe(true)
  })

  it('needs no grace when the user has been here since the page loaded', () => {
    expect(fetchSeesReturn(50, { returnedAt: 0, leftAt: null })).toBe(true)
  })
})

describe('openedAfterFetch', () => {
  const back = { returnedAt: 1_000_000, leftAt: null }
  const opened = new Set(['moved', 'notMoved', 'ended'])
  const games = [{ id: 'moved', myTurn: false }, { id: 'notMoved', myTurn: true }]

  it('keeps everything for a fetch made while away', () => {
    expect(openedAfterFetch(opened, games, back.returnedAt - 1, back)).toBe(opened)
  })

  it('right after coming back, brings back games still waiting for me and keeps played ones dimmed', () => {
    expect([...openedAfterFetch(opened, games, back.returnedAt + 1000, back)]).toEqual(['moved'])
  })

  it('clears everything once the grace period is over', () => {
    expect(openedAfterFetch(opened, games, back.returnedAt + 6 * 60_000, back).size).toBe(0)
  })
})
