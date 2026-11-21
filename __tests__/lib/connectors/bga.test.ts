jest.mock('@vercel/kv', () => ({ kv: { mget: jest.fn(), set: jest.fn(), get: jest.fn(async () => null), del: jest.fn() } }))

import { kv } from '@vercel/kv'
import { fetchBGA } from '@/lib/connectors/bga'
import fixture from '@/__fixtures__/bga-games.json'

const mockFetch = jest.fn()
global.fetch = mockFetch
const mockKvMget = kv.mget as jest.Mock
const mockKvSet = kv.set as jest.Mock
// Session caching also writes to KV; these tests are about the game-name cache
const nameCacheSets = () => mockKvSet.mock.calls.filter(([key]) => String(key).startsWith('bga-game-name:'))

const TOKEN = 'a'.repeat(64)

function makeMockHeaders(cookies: string[], extra: Record<string, string> = {}): Headers {
  return {
    getSetCookie: () => cookies,
    get: (name: string) => {
      if (name === 'set-cookie') return cookies.join(', ') || null
      return extra[name.toLowerCase()] ?? null
    },
  } as unknown as Headers
}

function makeInitResponse() {
  return {
    ok: true,
    status: 302,
    headers: makeMockHeaders(
      ['PHPSESSID=session123; Path=/; HttpOnly'],
      { location: 'https://en.boardgamearena.com/account' }
    ),
  }
}

function makeRedirectFollowResponse() {
  return {
    ok: true,
    status: 200,
    headers: makeMockHeaders([]),
  }
}

function makeLoginPageResponse(token = TOKEN) {
  return {
    ok: true,
    status: 200,
    text: async () => `<html><script>var request_token = '${token}'</script></html>`,
    headers: makeMockHeaders([]),
  }
}

// Login response uses user_id (not id) — matches real BGA API
function makeLoginResponse(playerId: string | number) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ status: 1, data: { user_id: String(playerId), username: 'testuser' } }),
    headers: makeMockHeaders(['TournoiEnLigneidt=postLoginToken; Path=/; HttpOnly']),
  }
}

function makeTablesResponse(data: object) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(data),
    headers: makeMockHeaders([]),
  }
}

function makeGamepanelResponse(displayName: string) {
  return {
    ok: true,
    status: 200,
    text: async () =>
      `<html><head><meta property="og:title" content="Play ${displayName} online on Board Game Arena"/></head></html>`,
    headers: makeMockHeaders([]),
  }
}

// fixture has 2 games: imperialsettlers → "Imperial Settlers", terraformingmars → "Terraforming Mars"
function setupHappyPath(playerId = '42', tables: object = fixture, gamepanelResponses: Array<{ slug: string; name: string }> = [
  { slug: 'imperialsettlers', name: 'Imperial Settlers' },
  { slug: 'terraformingmars', name: 'Terraforming Mars' },
]) {
  let mock = mockFetch
    .mockResolvedValueOnce(makeInitResponse())
    .mockResolvedValueOnce(makeRedirectFollowResponse())
    .mockResolvedValueOnce(makeLoginPageResponse())
    .mockResolvedValueOnce(makeLoginResponse(playerId))
    .mockResolvedValueOnce(makeTablesResponse(tables))
  for (const { name } of gamepanelResponses) {
    mock = mock.mockResolvedValueOnce(makeGamepanelResponse(name))
  }
}

describe('fetchBGA', () => {
  beforeEach(() => {
    mockFetch.mockClear()
    mockKvMget.mockReset().mockResolvedValue([])
    mockKvSet.mockReset().mockResolvedValue('OK')
  })

  // tableinfos.html's `status` request param rejects 'setup' outright ("Bad
  // argument type: status should be a value from the enumeration (setup)",
  // confirmed live) — 'play' is its one non-finished value and already
  // returns lobbies alongside active tables. What's live is each table's
  // own `status` field, confirmed as "asyncinit" for a lobby still waiting
  // on players vs. "asyncplay" for one under way — so fetchBGA makes a
  // single status=play call and partitions by that field, not a second,
  // always-rejected request.
  it('tags a table whose own status field ends in "init" as pending (not yet started), with its own max_player as the seat count', async () => {
    const tables = {
      status: 1,
      data: {
        tables: {
          '999': {
            id: '999',
            game_name: 'arknova',
            status: 'asyncinit',
            max_player: '3', // this lobby's own configured seat count, not the game's overall range
            game_max_players: '4',
            current_present_player_nbr: 2,
            players: {
              '42': { id: '42', fullname: 'testuser', table_status: 'playasync' },
              '89': { id: '89', fullname: 'alice', table_status: 'playasync' },
            },
          },
        },
      },
    }
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeRedirectFollowResponse())
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginResponse('42'))
      .mockResolvedValueOnce(makeTablesResponse(tables)) // one status=play call only
      .mockResolvedValueOnce(makeGamepanelResponse('Ark Nova'))

    const games = await fetchBGA('user@example.com', 'password')
    expect(games).toHaveLength(1)
    expect(games[0]).toMatchObject({
      id: 'bga:999',
      pending: true,
      myTurn: false,
      gameName: 'Ark Nova',
      currentPlayer: '2/3 joined — waiting for players',
      players: ['alice'],
    })
  })

  it('falls back to an unqualified joined count when a pending table has no max_player', async () => {
    const tables = {
      status: 1,
      data: {
        tables: {
          '999': {
            id: '999', game_name: 'arknova', status: 'asyncinit', current_present_player_nbr: 1,
            players: { '42': { id: '42', fullname: 'testuser', table_status: 'playasync' } },
          },
        },
      },
    }
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeRedirectFollowResponse())
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginResponse('42'))
      .mockResolvedValueOnce(makeTablesResponse(tables))
      .mockResolvedValueOnce(makeGamepanelResponse('Ark Nova'))

    const games = await fetchBGA('user@example.com', 'password')
    expect(games[0].currentPlayer).toBe('1 joined — waiting for players')
  })

  // Confirmed live against a real invite: a player the table creator
  // invites directly shows up in `players` right away, tagged table_status
  // "expected" until they actually accept or decline — 4 listed, only the
  // creator actually "playasync" (current_present_player_nbr: 1). Counting
  // the merely-invited as already joined is misleading, since they can
  // still decline or just never respond.
  it('does not count an invited-but-not-yet-confirmed player ("expected") as joined', async () => {
    const tables = {
      status: 1,
      data: {
        tables: {
          '999': {
            id: '999', game_name: 'iberiangauge', status: 'asyncinit', max_player: '4', current_present_player_nbr: 1,
            players: {
              '42': { id: '42', fullname: 'testuser', table_status: 'playasync' },
              '89': { id: '89', fullname: 'alice', table_status: 'expected' },
              '90': { id: '90', fullname: 'bob', table_status: 'expected' },
            },
          },
        },
      },
    }
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeRedirectFollowResponse())
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginResponse('42'))
      .mockResolvedValueOnce(makeTablesResponse(tables))
      .mockResolvedValueOnce(makeGamepanelResponse('Iberian Gauge'))

    const games = await fetchBGA('user@example.com', 'password')
    expect(games[0]).toMatchObject({
      currentPlayer: '1/4 joined — waiting for players',
      players: [], // alice/bob invited but not confirmed — not listed as "with" either
    })
  })

  it('keeps an asyncplay table active and an asyncinit table pending from the same response', async () => {
    const tables = {
      status: 1,
      data: {
        tables: {
          '111': {
            id: '111', game_name: 'arknova', status: 'asyncplay',
            players: { '42': { id: '42', fullname: 'testuser', myturn: '1' }, '89': { id: '89', fullname: 'alice', myturn: '0' } },
          },
          '222': {
            id: '222', game_name: 'barrage', status: 'asyncinit', current_present_player_nbr: 2,
            players: { '42': { id: '42', fullname: 'testuser', table_status: 'playasync' }, '89': { id: '89', fullname: 'alice', table_status: 'playasync' } },
          },
        },
      },
    }
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeRedirectFollowResponse())
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginResponse('42'))
      .mockResolvedValueOnce(makeTablesResponse(tables))
      .mockResolvedValueOnce(makeGamepanelResponse('Ark Nova'))
      .mockResolvedValueOnce(makeGamepanelResponse('Barrage'))

    const games = await fetchBGA('user@example.com', 'password')
    expect(games).toHaveLength(2)
    const active = games.find(g => g.id === 'bga:111')!
    expect(active.pending).toBeUndefined()
    expect(active.myTurn).toBe(true)
    expect(games.find(g => g.id === 'bga:222')).toMatchObject({ pending: true, myTurn: false })
  })

  it('returns Game[] from API response', async () => {
    setupHappyPath()
    const games = await fetchBGA('user@example.com', 'password')
    expect(games.length).toBe(2)
    expect(games[0]).toMatchObject({
      platform: 'bga',
      id: expect.stringMatching(/^bga:/),
      myTurn: expect.any(Boolean),
      gameUrl: expect.stringContaining('boardgamearena.com'),
      gameName: expect.any(String),
    })
  })

  it('resolves BGA avatar codes into real image URLs, keyed by player name', async () => {
    const tables = {
      status: 1,
      data: {
        tables: {
          '555': {
            id: '555',
            game_name: 'testgame',
            status: 'asyncplay',
            gamestart: 1750000000,
            scheduled: 1749990000,
            players: {
              '42': { id: '42', fullname: 'testuser', myturn: '0', think_seconds: null, avatar: '_def_2158' },
              '89293870': { id: '89293870', fullname: 'alice', myturn: '1', think_seconds: '3600', avatar: '5293954a87' },
              '12': { id: '12', fullname: 'bob', myturn: '0', think_seconds: null, avatar: 'weirdcode' },
            },
          },
        },
      },
    }
    setupHappyPath('42', tables, [])
    const games = await fetchBGA('user@example.com', 'password')
    // alice: a custom-avatar hash resolves via her own id, sharded; bob: a
    // code that isn't "_def_N" and an id too short to shard — left out
    // rather than guessed; testuser (me) is never in player-facing output
    expect(games[0].playerAvatars).toEqual({
      alice: 'https://x.boardgamearena.net/data/avatar/0/89/89293/89293870_32.jpg',
    })
    // The profile link only needs the id itself, not a shardable one — bob
    // gets a link despite having no avatar
    expect(games[0].playerProfileUrls).toEqual({
      alice: 'https://boardgamearena.com/player?id=89293870',
      bob: 'https://boardgamearena.com/player?id=12',
    })
  })

  it('calls onFreshLogin with the new session once a real login succeeds', async () => {
    setupHappyPath('42')
    const onFreshLogin = jest.fn()
    await fetchBGA('user@example.com', 'password', { onFreshLogin })
    expect(onFreshLogin).toHaveBeenCalledTimes(1)
    expect(onFreshLogin).toHaveBeenCalledWith(expect.objectContaining({ myId: '42', token: 'postLoginToken' }))
  })

  it('uses a manual session instead of logging in, when one is given', async () => {
    const singleTable = { status: 1, data: { tables: {} } }
    mockFetch
      .mockResolvedValueOnce(makeTablesResponse(singleTable)) // the one status=play tables call — no login steps
    const games = await fetchBGA('user@example.com', 'password', {
      manual: { cookie: 'TournoiEnLigneidt=tok; PHPSESSID=abc', playerId: '42' },
    })
    expect(games).toEqual([])
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('resolves display names from gamepanel og:title', async () => {
    setupHappyPath()
    const games = await fetchBGA('user@example.com', 'password')

    const imperialSettlers = games.find(g => g.id === 'bga:12345')!
    expect(imperialSettlers.gameName).toBe('Imperial Settlers')

    const terraformingMars = games.find(g => g.id === 'bga:67890')!
    expect(terraformingMars.gameName).toBe('Terraforming Mars')
  })

  it('decodes HTML entities and collapses whitespace in display names', async () => {
    const singleTable = {
      status: 1,
      data: {
        tables: {
          '11111': {
            id: '11111',
            game_name: 'throughtheagesnewstory',
            status: 'asyncplay',
            gamestart: 1750000000,
            scheduled: 1749990000,
            players: {
              '42': { id: '42', fullname: 'testuser', myturn: '1', think_seconds: '3600' },
            },
          },
        },
      },
    }
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeRedirectFollowResponse())
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginResponse('42'))
      .mockResolvedValueOnce(makeTablesResponse(singleTable))
      // og:title split across two lines, with HTML entity
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          `<html><head><meta property="og:title" content="Play Through the Ages: A new Story of\nCivilization online on Board Game Arena"/></head></html>`,
        headers: makeMockHeaders([]),
      })

    const games = await fetchBGA('user@example.com', 'password')
    expect(games[0].gameName).toBe('Through the Ages: A new Story of Civilization')
  })

  it('still resolves display names from the older "online from your browser" og:title wording', async () => {
    const singleTable = {
      status: 1,
      data: {
        tables: {
          '11111': {
            id: '11111',
            game_name: 'oldwording',
            status: 'asyncplay',
            gamestart: 1750000000,
            scheduled: 1749990000,
            players: {
              '42': { id: '42', fullname: 'testuser', myturn: '1', think_seconds: '3600' },
            },
          },
        },
      },
    }
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeRedirectFollowResponse())
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginResponse('42'))
      .mockResolvedValueOnce(makeTablesResponse(singleTable))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          `<html><head><meta property="og:title" content="Play Old Wording Game online from your browser"/></head></html>`,
        headers: makeMockHeaders([]),
      })

    const games = await fetchBGA('user@example.com', 'password')
    expect(games[0].gameName).toBe('Old Wording Game')
  })

  it('falls back to slug when all gamepanel fetch attempts fail', async () => {
    const singleTable = {
      status: 1,
      data: {
        tables: {
          '11111': {
            id: '11111',
            game_name: 'someslug',
            status: 'asyncplay',
            gamestart: 1750000000,
            scheduled: 1749990000,
            players: {
              '42': { id: '42', fullname: 'testuser', myturn: '1', think_seconds: '3600' },
            },
          },
        },
      },
    }
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeRedirectFollowResponse())
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginResponse('42'))
      .mockResolvedValueOnce(makeTablesResponse(singleTable))
      .mockRejectedValueOnce(new Error('network error'))   // attempt 0
      .mockRejectedValueOnce(new Error('network error'))   // attempt 1 (retry)

    const games = await fetchBGA('user@example.com', 'password')
    expect(games[0].gameName).toBe('someslug')
  })

  it('resolves display name on retry when first gamepanel fetch fails', async () => {
    const singleTable = {
      status: 1,
      data: {
        tables: {
          '11111': {
            id: '11111',
            game_name: 'someslug',
            status: 'asyncplay',
            gamestart: 1750000000,
            scheduled: 1749990000,
            players: {
              '42': { id: '42', fullname: 'testuser', myturn: '1', think_seconds: '3600' },
            },
          },
        },
      },
    }
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeRedirectFollowResponse())
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginResponse('42'))
      .mockResolvedValueOnce(makeTablesResponse(singleTable))
      .mockRejectedValueOnce(new Error('network error'))   // attempt 0 fails
      .mockResolvedValueOnce(makeGamepanelResponse('Some Game')) // attempt 1 succeeds

    const games = await fetchBGA('user@example.com', 'password')
    expect(games[0].gameName).toBe('Some Game')
  })

  it('falls back to slug when gamepanel returns non-ok status', async () => {
    const singleTable = {
      status: 1,
      data: {
        tables: {
          '11111': {
            id: '11111',
            game_name: 'someslug',
            status: 'asyncplay',
            gamestart: 1750000000,
            scheduled: 1749990000,
            players: {
              '42': { id: '42', fullname: 'testuser', myturn: '1', think_seconds: '3600' },
            },
          },
        },
      },
    }
    const errorResponse = { ok: false, status: 429, text: async () => 'Too Many Requests', headers: makeMockHeaders([]) }
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeRedirectFollowResponse())
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginResponse('42'))
      .mockResolvedValueOnce(makeTablesResponse(singleTable))
      .mockResolvedValueOnce(errorResponse)   // attempt 0: 429
      .mockResolvedValueOnce(errorResponse)   // attempt 1: 429

    const games = await fetchBGA('user@example.com', 'password')
    expect(games[0].gameName).toBe('someslug')
  })

  it('correctly identifies whose turn it is', async () => {
    setupHappyPath()
    const games = await fetchBGA('user@example.com', 'password')

    // Game 12345: myturn=1 on player 99 (alice), me=42 → NOT my turn
    const game1 = games.find(g => g.id === 'bga:12345')!
    expect(game1.myTurn).toBe(false)
    expect(game1.currentPlayer).toBe('alice')

    // Game 67890: myturn=1 on player 42 (me) → MY turn
    const game2 = games.find(g => g.id === 'bga:67890')!
    expect(game2.myTurn).toBe(true)
  })

  it('uses my own think_seconds when another player also has a stale myturn=1 flag', async () => {
    // Reproduces The Crew: BGA can report myturn=1 on more than one player at once
    // (e.g. a leftover flag from the player before me). My own turn/timing data
    // must win, not whichever player happens to come first in object key order.
    const singleTable = {
      status: 1,
      data: {
        tables: {
          '11111': {
            id: '11111',
            game_name: 'thecrew',
            status: 'asyncplay',
            think_limit: 1783571497,
            players: {
              '10': { id: '10', fullname: 'overdueplayer', myturn: '1', think_seconds: '-255999' },
              '42': { id: '42', fullname: 'testuser', myturn: '1', think_seconds: '250333' },
            },
          },
        },
      },
    }
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeRedirectFollowResponse())
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginResponse('42'))
      .mockResolvedValueOnce(makeTablesResponse(singleTable))
      .mockResolvedValueOnce(makeGamepanelResponse('The Crew'))

    const games = await fetchBGA('user@example.com', 'password')
    expect(games[0].myTurn).toBe(true)
    expect(games[0].urgent).toBe(false)
    expect(games[0].lastMoveAgo).not.toMatch(/overtime/)
  })

  it('returns empty array when no tables exist', async () => {
    setupHappyPath('42', { status: 1, data: { tables: {} } }, [])
    const games = await fetchBGA('user@example.com', 'password')
    expect(games).toHaveLength(0)
  })

  it('throws when request_token cannot be extracted from login page', async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeRedirectFollowResponse())
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<html><body>no token here</body></html>',
        headers: makeMockHeaders([]),
      })

    await expect(fetchBGA('user@example.com', 'password')).rejects.toThrow('BGA: could not extract request_token')
  })

  it('throws when login returns non-JSON', async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeRedirectFollowResponse())
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce({
        ok: false,
        status: 302,
        text: async () => '<!DOCTYPE html>',
        headers: makeMockHeaders([]),
      })

    await expect(fetchBGA('user@example.com', 'password')).rejects.toThrow('BGA login HTTP 302')
  })

  it('throws when login status is not 1', async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeRedirectFollowResponse())
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce({
        ok: false,
        status: 200,
        text: async () => JSON.stringify({ status: 0, error: 'Wrong credentials' }),
        headers: makeMockHeaders([]),
      })

    await expect(fetchBGA('user@example.com', 'password')).rejects.toThrow('BGA login failed: Wrong credentials')
  })

  it('throws when login response contains no request token cookie', async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeRedirectFollowResponse())
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: 1, data: { user_id: '42' } }),
        headers: makeMockHeaders([]),
      })

    await expect(fetchBGA('user@example.com', 'password')).rejects.toThrow('BGA: no request token in login response cookies')
  })

  describe('game name cache', () => {
    const gamepanelCalls = () =>
      mockFetch.mock.calls.filter(([url]) => String(url).includes('/gamepanel?'))

    it('uses cached names and skips gamepanel fetches entirely', async () => {
      mockKvMget.mockResolvedValue([{ name: 'Imperial Settlers' }, { name: 'Terraforming Mars' }])
      setupHappyPath('42', fixture, [])
      const games = await fetchBGA('user@example.com', 'password')

      expect(mockKvMget).toHaveBeenCalledWith('bga-game-name:v1:imperialsettlers', 'bga-game-name:v1:terraformingmars')
      expect(gamepanelCalls()).toHaveLength(0)
      expect(games.find(g => g.id === 'bga:12345')!.gameName).toBe('Imperial Settlers')
      expect(games.find(g => g.id === 'bga:67890')!.gameName).toBe('Terraforming Mars')
      expect(nameCacheSets()).toHaveLength(0)
    })

    it('only fetches gamepanel for uncached slugs and caches the result permanently', async () => {
      mockKvMget.mockResolvedValue([{ name: 'Imperial Settlers' }, null])
      setupHappyPath('42', fixture, [{ slug: 'terraformingmars', name: 'Terraforming Mars' }])
      const games = await fetchBGA('user@example.com', 'password')

      expect(gamepanelCalls()).toHaveLength(1)
      expect(gamepanelCalls()[0][0]).toContain('game=terraformingmars')
      expect(games.find(g => g.id === 'bga:67890')!.gameName).toBe('Terraforming Mars')
      expect(nameCacheSets()).toHaveLength(1)
      expect(mockKvSet).toHaveBeenCalledWith('bga-game-name:v1:terraformingmars', { name: 'Terraforming Mars' })
    })

    it('shows the slug for a cached unresolved entry without refetching', async () => {
      mockKvMget.mockResolvedValue([{ name: null }, { name: 'Terraforming Mars' }])
      setupHappyPath('42', fixture, [])
      const games = await fetchBGA('user@example.com', 'password')

      expect(gamepanelCalls()).toHaveLength(0)
      expect(games.find(g => g.id === 'bga:12345')!.gameName).toBe('imperialsettlers')
    })

    it('caches a page without a title as unresolved for a day only', async () => {
      mockKvMget.mockResolvedValue([null, { name: 'Terraforming Mars' }])
      setupHappyPath('42', fixture, [])
      // alpha games redirect to the /reviewer page, which has a different og:title
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<html><head><meta property="og:title" content="Become a BGA reviewer" /></head></html>',
        headers: makeMockHeaders([]),
      })
      const games = await fetchBGA('user@example.com', 'password')

      expect(games.find(g => g.id === 'bga:12345')!.gameName).toBe('imperialsettlers')
      expect(mockKvSet).toHaveBeenCalledWith('bga-game-name:v1:imperialsettlers', { name: null }, { ex: 86400 })
    })

    it('does not cache slugs whose gamepanel fetch failed', async () => {
      mockKvMget.mockResolvedValue([null, { name: 'Terraforming Mars' }])
      setupHappyPath('42', fixture, [])
      mockFetch
        .mockRejectedValueOnce(new Error('network'))
        .mockRejectedValueOnce(new Error('network'))
      const games = await fetchBGA('user@example.com', 'password')

      expect(games.find(g => g.id === 'bga:12345')!.gameName).toBe('imperialsettlers')
      expect(nameCacheSets()).toHaveLength(0)
    })

    it('still resolves names live when KV is unavailable', async () => {
      mockKvMget.mockRejectedValue(new Error('KV down'))
      mockKvSet.mockRejectedValue(new Error('KV down'))
      setupHappyPath()
      const games = await fetchBGA('user@example.com', 'password')

      expect(games.find(g => g.id === 'bga:12345')!.gameName).toBe('Imperial Settlers')
      expect(games.find(g => g.id === 'bga:67890')!.gameName).toBe('Terraforming Mars')
    })
  })
})
