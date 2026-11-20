import { toTournament, collectMatches, findActiveTableId } from '../bgaTournaments'

describe('toTournament', () => {
  const raw = {
    id: 283997,
    name: 'Saison 2 - Stage 1 - Group 1',
    championship_name: 'Baj Duel Ark Nova',
    game_name: 'arknova',
    status: 'finished',
    type: 'swissSystemV2',
    stage: 0,
    registered: 10,
    remaining: 0,
    progress: 1,
    encounter_total: 6,
    encounter_played: 6,
    encounter_won: 4,
    player_status: 'eliminated',
  }

  it('maps a getTournaments.html list row into a Tournament', () => {
    expect(toTournament(raw)).toEqual({
      id: 'bga:283997',
      platform: 'bga',
      name: 'Saison 2 - Stage 1 - Group 1',
      championshipName: 'Baj Duel Ark Nova',
      gameName: 'arknova',
      status: 'finished',
      typeLabel: 'Swiss system',
      stage: 0,
      registeredPlayers: 10,
      progress: 1,
      encountersTotal: 6,
      encountersPlayed: 6,
      encountersWon: 4,
      myStatus: 'eliminated',
      tournamentUrl: 'https://boardgamearena.com/tournament?id=283997',
    })
  })

  it('never surfaces BGA\'s own "remaining" field — its real values don\'t match a trustworthy reading', () => {
    expect(toTournament(raw)).not.toHaveProperty('remainingPlayers')
  })

  it('resolves the game slug to a display name via the name map', () => {
    const nameMap = new Map([['arknova', 'Ark Nova']])
    expect(toTournament(raw, undefined, nameMap).gameName).toBe('Ark Nova')
  })

  it('falls back to the raw slug when the name map has nothing for it', () => {
    expect(toTournament(raw, undefined, new Map()).gameName).toBe('arknova')
  })

  it('takes startDate from getTournament.html detail, not the list row', () => {
    expect(toTournament(raw).startDate).toBeUndefined()
    expect(toTournament(raw, { baseDate: '2024-03-30T22:00:00+02:00' }).startDate).toBe('2024-03-30T22:00:00+02:00')
  })

  it('falls back to the raw type id when it has no known label', () => {
    expect(toTournament({ id: 1, name: 'x', status: 'register', type: 'someNewFormat' }).typeLabel).toBe('someNewFormat')
  })

  it('omits optional fields the row did not provide', () => {
    const t = toTournament({ id: 1, name: 'x', status: 'register', type: 'swissSystem' })
    expect(t.championshipName).toBeUndefined()
    expect(t.gameName).toBeUndefined()
    expect(t.registeredPlayers).toBeUndefined()
    expect(t.myStatus).toBeUndefined()
    expect(t.progress).toBeNull()
  })
})

describe('collectMatches', () => {
  it('flattens stages -> groups -> steps -> matches', () => {
    const stages = {
      1: {
        groups: [
          { steps: [{ matches: [{ id: 1, status: 'finished', tableId: 111 }] }] },
          { steps: [{ matches: [{ id: 2, status: 'active', tableId: 222 }] }, { matches: [{ id: 3, status: 'active', tableId: null }] }] },
        ],
      },
    }
    const matches = collectMatches(stages)
    expect(matches.map(m => m.id)).toEqual([1, 2, 3])
  })

  it('returns an empty array for missing/empty stages', () => {
    expect(collectMatches(undefined)).toEqual([])
    expect(collectMatches({})).toEqual([])
  })
})

describe('findActiveTableId', () => {
  const stages = {
    1: {
      groups: [{
        steps: [{
          matches: [
            { id: 1, status: 'finished', tableId: 111, players: [{ player_id: 42 }, { player_id: 7 }] },
            { id: 2, status: 'active', tableId: 222, players: [{ player_id: 42 }, { player_id: 9 }] },
            { id: 3, status: 'active', tableId: 333, players: [{ player_id: 5 }, { player_id: 9 }] },
          ],
        }],
      }],
    },
  }

  it('finds my current open match by player id, skipping finished ones', () => {
    expect(findActiveTableId(stages, 42)).toBe('222')
  })

  it('returns undefined when none of my matches are open', () => {
    expect(findActiveTableId(stages, 7)).toBeUndefined()
  })

  it('returns undefined when I have no match at all', () => {
    expect(findActiveTableId(stages, 999)).toBeUndefined()
  })

  it('skips a match with no table id yet (not yet paired/started)', () => {
    const pending = {
      1: { groups: [{ steps: [{ matches: [{ id: 1, status: 'active', tableId: null, players: [{ player_id: 42 }] }] }] }] },
    }
    expect(findActiveTableId(pending, 42)).toBeUndefined()
  })
})
