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

  describe('pending displacement', () => {
    const OTHER = 'cccccccc-1111-1111-1111-dddddddddddd'
    const game = (currentPlayerId: string, displacedPlayerId: string | null) => ({
      games: [{
        id: 'disp00112233',
        status: 'playing',
        players: [
          { name: 'testuser', userId: MY_USER_ID },
          { name: 'alice', userId: OTHER },
        ],
        currentPlayerId,
        displacedPlayerId,
        turnStartedAt: '2026-06-20T10:00:00Z',
        updatedAt: '2026-06-20T10:00:00Z',
        turnTimeoutSeconds: 86400,
      }],
      nextCursor: null,
    })

    it('is my turn when I am the displaced player, even though another player is current', async () => {
      mockGamesResponse(JSON.stringify(game(OTHER, MY_USER_ID)))
      const [g] = await fetchHansa(MY_USER_ID)
      expect(g.myTurn).toBe(true)
      expect(g.currentPlayer).toBeUndefined()
    })

    it('is not my turn when I am current but another player must relocate', async () => {
      mockGamesResponse(JSON.stringify(game(MY_USER_ID, OTHER)))
      const [g] = await fetchHansa(MY_USER_ID)
      expect(g.myTurn).toBe(false)
      expect(g.currentPlayer).toBe('alice')
    })
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

  it('carries over the game\'s own final turn count', async () => {
    mockGamesResponse(finishedFixture)
    const games = await fetchFinishedHansa(MY_USER_ID)
    expect(games[0].turns).toBe(87)
  })

  it('throws when userId is missing', async () => {
    await expect(fetchFinishedHansa('')).rejects.toThrow('HANSA_USER_ID is required')
  })
})

describe('progress estimate', () => {
  beforeEach(() => mockFetch.mockClear())

  // Hansa has no fixed turn limit, so the estimate comes from the median of
  // every finished game on the platform (mode=all) with the same map and
  // player count — not just this user's own history, unlike BGA/Rally/18xx.
  const activeGame = (turn: number, mapId: string, otherIds: string[]) => JSON.stringify({
    games: [{
      id: 'prog00112233',
      status: 'playing',
      players: [{ name: 'testuser', userId: MY_USER_ID }, ...otherIds.map((id, i) => ({ name: `o${i}`, userId: id }))],
      currentPlayerId: MY_USER_ID,
      turnStartedAt: '2026-06-20T10:00:00Z',
      updatedAt: '2026-06-20T10:00:00Z',
      turnTimeoutSeconds: 86400,
      turn,
      mapId,
    }],
    nextCursor: null,
  })

  const finishedSamples = (samples: { turn: number; mapId: string; playerCount: number }[]) => JSON.stringify({
    games: samples.map((s, i) => ({
      id: `done-${i}`,
      status: 'finished',
      players: Array.from({ length: s.playerCount }, (_, p) => ({ name: `x${p}`, userId: `u${i}-${p}` })),
      currentPlayerId: '',
      turnStartedAt: null,
      updatedAt: '2026-06-01T00:00:00Z',
      turnTimeoutSeconds: null,
      turn: s.turn,
      mapId: s.mapId,
    })),
    nextCursor: null,
  })

  it('estimates percent from the median of finished games with the same map and player count', async () => {
    mockGamesResponse(activeGame(30, 'three-players', ['o1', 'o2']))
    mockGamesResponse(finishedSamples([
      { turn: 80, mapId: 'three-players', playerCount: 3 },
      { turn: 100, mapId: 'three-players', playerCount: 3 },
      { turn: 60, mapId: 'four-five-players', playerCount: 4 }, // different map — excluded
    ]))
    const [g] = await fetchHansa(MY_USER_ID)
    expect(g.progress).toMatchObject({ turnsSoFar: 30, estimatedTotalTurns: 90, sampleCount: 2, sameSizeOnly: true, percent: 33, sameSizeSampleCount: 2, totalSampleCount: 2 })
  })

  it('falls back to any player count on the same map when none match exactly', async () => {
    mockGamesResponse(activeGame(30, 'eastern', ['o1', 'o2']))
    mockGamesResponse(finishedSamples([{ turn: 80, mapId: 'eastern', playerCount: 5 }]))
    const [g] = await fetchHansa(MY_USER_ID)
    expect(g.progress).toMatchObject({ sampleCount: 1, sameSizeOnly: false, estimatedTotalTurns: 80, sameSizeSampleCount: 0, totalSampleCount: 1 })
  })

  it('omits progress when the active game has no history to compare against', async () => {
    mockGamesResponse(activeGame(30, 'unheard-of-map', ['o1']))
    mockGamesResponse(finishedSamples([]))
    const [g] = await fetchHansa(MY_USER_ID)
    expect(g.progress).toBeUndefined()
  })

  it('still returns the active games, without a progress estimate, when the finished-games fetch fails', async () => {
    mockGamesResponse(activeGame(30, 'three-players', ['o1']))
    mockFetch.mockRejectedValueOnce(new Error('network error'))
    const games = await fetchHansa(MY_USER_ID)
    expect(games).toHaveLength(1)
    expect(games[0].progress).toBeUndefined()
  })
})
