import { fetchAllPlatforms, connectors } from '../index'
import { fetchBGA } from '../bga'
import { fetchEighteenXX } from '../eighteenxx'
import { fetchOBG } from '../obg'
import { fetchYucata } from '../yucata'
import { fetchChoochoo } from '../choochoo'
import { fetchHansa } from '../hansa'
import { fetchRally } from '../rally'
import type { Game } from '../../types'

jest.mock('../bga')
jest.mock('../eighteenxx')
jest.mock('../obg')
jest.mock('../yucata')
jest.mock('../choochoo')
jest.mock('../hansa')
jest.mock('../rally')

const mockFetchBGA = fetchBGA as jest.MockedFunction<typeof fetchBGA>
const mockFetchEighteenXX = fetchEighteenXX as jest.MockedFunction<typeof fetchEighteenXX>
const mockFetchOBG = fetchOBG as jest.MockedFunction<typeof fetchOBG>
const mockFetchYucata = fetchYucata as jest.MockedFunction<typeof fetchYucata>
const mockFetchChoochoo = fetchChoochoo as jest.MockedFunction<typeof fetchChoochoo>
const mockFetchHansa = fetchHansa as jest.MockedFunction<typeof fetchHansa>
const mockFetchRally = fetchRally as jest.MockedFunction<typeof fetchRally>

function makeGame(id: string, platform: Game['platform']): Game {
  return {
    id,
    platform,
    gameName: 'Test Game',
    myTurn: true,
    lastMoveAt: new Date('2026-06-01T12:00:00Z'),
    lastMoveAgo: '25 days ago',
    urgent: true,
    gameUrl: `https://example.com/game/${id}`,
    platformUrl: 'https://example.com',
    players: [],
  }
}

const ALL_ENV_VARS: Record<string, string> = {
  BGA_SESSION: 'bga_session_cookie',
  BGA_PLAYER_ID: '12345',
  EIGHTEENXX_USERNAME: '18xx_user',
  EIGHTEENXX_PASSWORD: '18xx_pass',
  OBG_USERNAME: 'obg_user',
  OBG_PASSWORD: 'obg_pass',
  YUCATA_USERNAME: 'yucata_user',
  YUCATA_PASSWORD: 'yucata_pass',
  CHOOCHOO_USERNAME: 'choochoo_user',
  CHOOCHOO_PASSWORD: 'choochoo_pass',
  HANSA_USERNAME: 'hansa_user',
  HANSA_PASSWORD: 'hansa_pass',
  RALLY_USERNAME: 'rally_user',
  RALLY_PASSWORD: 'rally_pass',
}

function setAllEnvVars() {
  for (const [key, val] of Object.entries(ALL_ENV_VARS)) {
    process.env[key] = val
  }
}

function clearAllEnvVars() {
  for (const key of Object.keys(ALL_ENV_VARS)) {
    delete process.env[key]
  }
}

afterEach(() => {
  clearAllEnvVars()
  jest.clearAllMocks()
})

describe('fetchAllPlatforms', () => {
  it('returns combined games from all platforms when all succeed', async () => {
    setAllEnvVars()

    const bgaGame = makeGame('bga:1', 'bga')
    const eighteenxxGame = makeGame('eighteenxx:1', 'eighteenxx')
    const obgGame = makeGame('obg:1', 'obg')
    const yucataGame = makeGame('yucata:1', 'yucata')
    const choochooGame = makeGame('choochoo:1', 'choochoo')
    const hansaGame = makeGame('hansa:1', 'hansa')
    const rallyGame = makeGame('rally:1', 'rally')

    mockFetchBGA.mockResolvedValue([bgaGame])
    mockFetchEighteenXX.mockResolvedValue([eighteenxxGame])
    mockFetchOBG.mockResolvedValue([obgGame])
    mockFetchYucata.mockResolvedValue([yucataGame])
    mockFetchChoochoo.mockResolvedValue([choochooGame])
    mockFetchHansa.mockResolvedValue([hansaGame])
    mockFetchRally.mockResolvedValue([rallyGame])

    const result = await fetchAllPlatforms()

    expect(result.games).toHaveLength(7)
    expect(result.games).toEqual(expect.arrayContaining([bgaGame, eighteenxxGame, obgGame, yucataGame, choochooGame, hansaGame, rallyGame]))
    expect(result.errors).toHaveLength(0)
  })

  it('captures thrown errors while still returning other platforms games', async () => {
    setAllEnvVars()

    const eighteenxxGame = makeGame('eighteenxx:1', 'eighteenxx')
    const obgGame = makeGame('obg:1', 'obg')

    mockFetchBGA.mockRejectedValue(new Error('BGA login failed'))
    mockFetchEighteenXX.mockResolvedValue([eighteenxxGame])
    mockFetchOBG.mockResolvedValue([obgGame])
    mockFetchYucata.mockResolvedValue([])
    mockFetchChoochoo.mockResolvedValue([])
    mockFetchHansa.mockResolvedValue([])
    mockFetchRally.mockResolvedValue([])

    const result = await fetchAllPlatforms()

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toEqual({ platform: 'bga', error: 'BGA login failed' })
    expect(result.games).toContainEqual(eighteenxxGame)
    expect(result.games).toContainEqual(obgGame)
  })

  it('silently skips platforms with missing credentials without adding errors', async () => {
    // Set credentials for all platforms except BGA
    for (const [key, val] of Object.entries(ALL_ENV_VARS)) {
      if (!key.startsWith('BGA_')) {
        process.env[key] = val
      }
    }

    mockFetchEighteenXX.mockResolvedValue([makeGame('eighteenxx:1', 'eighteenxx')])
    mockFetchOBG.mockResolvedValue([])
    mockFetchYucata.mockResolvedValue([])
    mockFetchChoochoo.mockResolvedValue([])
    mockFetchHansa.mockResolvedValue([])
    mockFetchRally.mockResolvedValue([])

    const result = await fetchAllPlatforms()

    expect(mockFetchBGA).not.toHaveBeenCalled()
    expect(result.errors).toHaveLength(0)
    expect(result.games).toHaveLength(1)
    expect(result.games[0].platform).toBe('eighteenxx')
  })

  it('returns empty games and all errors when all platforms fail', async () => {
    setAllEnvVars()

    mockFetchBGA.mockRejectedValue(new Error('BGA error'))
    mockFetchEighteenXX.mockRejectedValue(new Error('18xx error'))
    mockFetchOBG.mockRejectedValue(new Error('OBG error'))
    mockFetchYucata.mockRejectedValue(new Error('Yucata error'))
    mockFetchChoochoo.mockRejectedValue(new Error('Choochoo error'))
    mockFetchHansa.mockRejectedValue(new Error('Hansa error'))
    mockFetchRally.mockRejectedValue(new Error('Rally error'))

    const result = await fetchAllPlatforms()

    expect(result.games).toHaveLength(0)
    expect(result.errors).toHaveLength(7)
    expect(result.errors.map(e => e.platform)).toEqual(
      expect.arrayContaining(['bga', 'eighteenxx', 'obg', 'yucata', 'choochoo', 'hansa', 'rally'])
    )
  })

  it('returns a valid ISO 8601 fetchedAt timestamp', async () => {
    setAllEnvVars()

    mockFetchBGA.mockResolvedValue([])
    mockFetchEighteenXX.mockResolvedValue([])
    mockFetchOBG.mockResolvedValue([])
    mockFetchYucata.mockResolvedValue([])
    mockFetchChoochoo.mockResolvedValue([])
    mockFetchHansa.mockResolvedValue([])
    mockFetchRally.mockResolvedValue([])

    const result = await fetchAllPlatforms()

    expect(result.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(new Date(result.fetchedAt).toISOString()).toBe(result.fetchedAt)
  })

  it('skips BGA when BGA_SESSION is not set', async () => {
    // BGA_SESSION intentionally not set

    const result = await fetchAllPlatforms()

    expect(mockFetchBGA).not.toHaveBeenCalled()
    expect(result.errors).toHaveLength(0)
  })
})

describe('connectors', () => {
  it('exports a connectors map with all 7 platforms', () => {
    const platforms = Object.keys(connectors)
    expect(platforms).toHaveLength(7)
    expect(platforms).toEqual(
      expect.arrayContaining(['bga', 'eighteenxx', 'obg', 'yucata', 'choochoo', 'hansa', 'rally'])
    )
  })

  it('each connector is a callable function', () => {
    for (const fetcher of Object.values(connectors)) {
      expect(typeof fetcher).toBe('function')
    }
  })
})
