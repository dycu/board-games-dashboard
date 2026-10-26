import { newlyMyTurn, watchedPlatforms } from '@/lib/notify/watch'
import { StreamedGame } from '@/lib/notify/types'

const game = (id: string, myTurn: boolean): StreamedGame => ({
  id, platform: 'bga', gameName: `Game ${id}`, myTurn,
  lastMoveAt: new Date().toISOString(), gameUrl: `https://x/${id}`,
})

describe('newlyMyTurn', () => {
  it('notifies about a watched game that just became my turn', () => {
    const { toNotify, state } = newlyMyTurn([game('a', true)], ['a'], {})
    expect(toNotify.map(g => g.id)).toEqual(['a'])
    expect(state).toEqual({ a: true })
  })

  it('ignores a game that is not watched', () => {
    const { toNotify } = newlyMyTurn([game('a', true)], ['b'], {})
    expect(toNotify).toEqual([])
  })

  it('ignores a watched game that is not my turn', () => {
    const { toNotify, state } = newlyMyTurn([game('a', false)], ['a'], {})
    expect(toNotify).toEqual([])
    expect(state).toEqual({})
  })

  it('does not re-notify for a turn already notified about', () => {
    const { state } = newlyMyTurn([game('a', true)], ['a'], {})
    const second = newlyMyTurn([game('a', true)], ['a'], state)
    expect(second.toNotify).toEqual([])
    expect(second.state).toEqual({ a: true })
  })

  it('notifies again once the turn cycles back after a move', () => {
    const afterFirstTurn = newlyMyTurn([game('a', true)], ['a'], {}).state
    // the game is no longer my turn for a while (the old flag is dropped)
    const whileWaiting = newlyMyTurn([game('a', false)], ['a'], afterFirstTurn).state
    expect(whileWaiting).toEqual({})
    // it becomes my turn again — notified again, not suppressed
    const secondTurn = newlyMyTurn([game('a', true)], ['a'], whileWaiting)
    expect(secondTurn.toNotify.map(g => g.id)).toEqual(['a'])
  })
})

describe('watchedPlatforms', () => {
  it('extracts the distinct platforms from watched game ids', () => {
    expect(watchedPlatforms(['rally:262709', 'rally:260229', 'bga:1'])).toEqual(['rally', 'bga'])
  })

  it('returns an empty list when nothing is watched', () => {
    expect(watchedPlatforms([])).toEqual([])
  })
})
