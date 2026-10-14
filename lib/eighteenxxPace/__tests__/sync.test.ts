jest.mock('@vercel/kv', () => ({ kv: { get: jest.fn(), set: jest.fn() } }))
jest.mock('../../connectors/eighteenxx', () => ({ fetchProfileGames: jest.fn() }))

import { kv } from '@vercel/kv'
import { fetchProfileGames } from '../../connectors/eighteenxx'
import { syncEighteenxx } from '../sync'

const mockFetchProfileGames = fetchProfileGames as jest.Mock
const mockSet = kv.set as jest.Mock

describe('syncEighteenxx', () => {
  beforeEach(() => { mockFetchProfileGames.mockReset(); mockSet.mockReset() })

  it('groups finished/archived games by title, keyed to the logged-in player', () => {
    mockFetchProfileGames.mockResolvedValue({
      myId: 1,
      games: [
        { status: 'finished', title: '1846', turn: 10, players: [{ id: 1 }, { id: 2 }] },
        { status: 'archived', title: '1846', turn: 14, players: [{ id: 1 }, { id: 2 }] },
        { status: 'active', title: '1846', turn: 3, players: [{ id: 1 }] }, // not finished — excluded
        { status: 'finished', title: '18USA', turn: 8, players: [{ id: 1 }] },
        { status: 'finished', title: '1846', turn: 20, players: [{ id: 2 }, { id: 3 }] }, // I'm not in it — excluded
      ],
    })
    return syncEighteenxx('user', 'pass').then(result => {
      expect(result).toEqual({ titles: 2, games: 3 })
      expect(mockSet).toHaveBeenCalledWith('eighteenxxpace:v1:samples', {
        '1846': [{ turn: 10, playerCount: 2 }, { turn: 14, playerCount: 2 }],
        '18USA': [{ turn: 8, playerCount: 1 }],
      })
    })
  })

  it('skips games with no numeric turn', async () => {
    mockFetchProfileGames.mockResolvedValue({
      myId: 1,
      games: [{ status: 'finished', title: '1846', turn: null, players: [{ id: 1 }] }],
    })
    const result = await syncEighteenxx('user', 'pass')
    expect(result).toEqual({ titles: 0, games: 0 })
  })
})
