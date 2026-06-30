import { fetchHansa, fetchFinishedHansa } from '@/lib/connectors/hansa'
import { readFileSync } from 'fs'
import { join } from 'path'

const mockFetch = jest.fn()
global.fetch = mockFetch

const gamesFixture = readFileSync(join(__dirname, '../../../__fixtures__/hansa-games.json'), 'utf8')
const finishedFixture = readFileSync(join(__dirname, '../../../__fixtures__/hansa-finished.json'), 'utf8')

const MY_USER_ID = 'aaaaaaaa-0000-0000-0000-bbbbbbbbbbbb'

function mockGamesResponse(body: string) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => JSON.parse(body),
  })
}

describe('fetchHansa', () => {
  beforeEach(() => mockFetch.mockClear())

  it('returns only games where the user is a player', async () => {
    mockGamesResponse(gamesFixture)
    const games = await fetchHansa(MY_USER_ID)
    expect(games).toHaveLength(2)
    expect(games.every(g => g.platform === 'hansa')).toBe(true)
    expect(games.every(g => g.id.startsWith('hansa:'))).toBe(true)
  })

  it('accepts userId with dashes stripped', async () => {
    mockGamesResponse(gamesFixture)
    const games = await fetchHansa(MY_USER_ID.replace(/-/g, ''))
    expect(games).toHaveLength(2)
  })

  it('correctly identifies my turn when currentPlayerId matches user userId', async () => {
    mockGamesResponse(gamesFixture)
    const games = await fetchHansa(MY_USER_ID)
    const myTurnGame = games.find(g => g.id === 'hansa:aabbccdd1122')!
    expect(myTurnGame.myTurn).toBe(true)
    expect(myTurnGame.currentPlayer).toBeUndefined()
  })

  it('correctly identifies waiting when currentPlayerId matches another player', async () => {
    mockGamesResponse(gamesFixture)
    const games = await fetchHansa(MY_USER_ID)
    const waitingGame = games.find(g => g.id === 'hansa:eeff00112233')!
    expect(waitingGame.myTurn).toBe(false)
    expect(waitingGame.currentPlayer).toBe('alice')
  })

  it('excludes games the user is not in', async () => {
    mockGamesResponse(gamesFixture)
    const games = await fetchHansa(MY_USER_ID)
    expect(games.find(g => g.id === 'hansa:ffffffffffffffff')).toBeUndefined()
  })

  it('sets gameName to Hansa Teutonica', async () => {
    mockGamesResponse(gamesFixture)
    const games = await fetchHansa(MY_USER_ID)
    expect(games.every(g => g.gameName === 'Hansa Teutonica')).toBe(true)
  })

  it('throws when userId is missing', async () => {
    await expect(fetchHansa('')).rejects.toThrow('HANSA_USER_ID is required')
  })
})

describe('fetchFinishedHansa', () => {
  beforeEach(() => mockFetch.mockClear())

  it('returns only finished games where the user is a player', async () => {
    mockGamesResponse(finishedFixture)
    const games = await fetchFinishedHansa(MY_USER_ID)
    expect(games).toHaveLength(1)
    expect(games[0].id).toBe('hansa:done00112233')
    expect(games[0].platform).toBe('hansa')
    expect(games[0].gameName).toBe('Hansa Teutonica')
  })

  it('throws when userId is missing', async () => {
    await expect(fetchFinishedHansa('')).rejects.toThrow('HANSA_USER_ID is required')
  })
})
