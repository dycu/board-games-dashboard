import { Tournament } from '../types'
import { withBgaSession, bgaApiHeaders, BgaAuthOptions, BgaSession } from './bga'

const BASE = 'https://boardgamearena.com'
const API_BASE = 'https://en.boardgamearena.com'

async function postJson(session: BgaSession, path: string, body: string): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      ...bgaApiHeaders(session, `${API_BASE}/tournamentlist`),
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body,
  })
  const text = await res.text()
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`BGA tournament HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
  if (json.status !== 1) throw new Error(`BGA tournament call failed: ${json.error ?? JSON.stringify(json).slice(0, 200)}`)
  return json.data
}

// BGA's internal type ids, mapped to a short human label. Mirrors
// getTournamentModes.html (mostly static reference data), hardcoded here
// rather than fetched every time since it rarely changes.
const TYPE_LABELS: Record<string, string> = {
  singleElimination: 'Single elimination',
  bracketElimination: 'Multiplayer elimination',
  swissSystem: 'Swiss system',
  swissSystemV2: 'Swiss system',
  twoStage: 'Two-stage',
  roundRobin: 'Round robin',
}

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type
}

// `tournament_i_registered`: 0 = no filter, 1 = only tournaments I'm
// registered in, 2 = only ones I'm not — inferred from the query string
// BGA's own /tournamentlist page sends when its "My tournaments" filter is
// active, not confirmed against a real account. Verify this once real BGA
// credentials are available — if it turns out to mean something else, this
// list will come back empty or showing tournaments that aren't mine.
async function listMyTournaments(session: BgaSession): Promise<any[]> {
  const data = await postJson(session, '/tournamentlist/tournamentlist/getTournaments.html', 'tournament_i_registered=1&full=false&order=date')
  return data?.list ?? []
}

export function toTournament(raw: any): Tournament {
  return {
    id: `bga:${raw.id}`,
    platform: 'bga',
    name: raw.name,
    ...(raw.championship_name && { championshipName: raw.championship_name }),
    ...(raw.game_name && { gameName: raw.game_name }),
    status: raw.status,
    typeLabel: typeLabel(raw.type),
    stage: raw.stage ?? 0,
    ...(raw.registered != null && { registeredPlayers: raw.registered }),
    ...(raw.remaining != null && { remainingPlayers: raw.remaining }),
    progress: typeof raw.progress === 'number' ? raw.progress : null,
    encountersTotal: raw.encounter_total ?? raw.encounters_total ?? 0,
    encountersPlayed: raw.encounter_played ?? raw.encounters_played ?? 0,
    encountersWon: raw.encounter_won ?? raw.encounters_won ?? 0,
    ...(raw.player_status != null && { myStatus: String(raw.player_status) }),
    tournamentUrl: `${BASE}/tournament?id=${raw.id}`,
  }
}

interface OverviewMatch {
  id?: number
  status: string
  tableId: number | null
  players?: { player_id: number }[]
}

// getOverview.html nests matches under stages -> groups -> steps -> matches
export function collectMatches(stages: unknown): OverviewMatch[] {
  const matches: OverviewMatch[] = []
  for (const stage of Object.values(stages ?? {}) as any[]) {
    for (const group of stage?.groups ?? []) {
      for (const step of group?.steps ?? []) {
        for (const m of step?.matches ?? []) matches.push(m)
      }
    }
  }
  return matches
}

// My current open match in this tournament (if any) — the table id links
// straight into the same bga: table ids the main games connector already
// knows, so the dashboard can tag that Game card instead of duplicating it.
export function findActiveTableId(stages: unknown, myId: number): string | undefined {
  const match = collectMatches(stages).find(m =>
    m.tableId != null && m.status !== 'finished' && m.players?.some(p => p.player_id === myId)
  )
  return match ? String(match.tableId) : undefined
}

// A tournament that hasn't started yet, or has already finished, has no open
// match to find — skip the extra request for those (its own status drives
// whether it's worth checking at all).
function mightHaveActiveMatch(status: string): boolean {
  return status !== 'finished' && status !== 'register'
}

async function attachActiveMatch(session: BgaSession, tournament: Tournament, rawId: number): Promise<Tournament> {
  if (!mightHaveActiveMatch(tournament.status)) return tournament
  try {
    const overview = await postJson(session, '/tournament/view/getOverview.html', `id=${rawId}`)
    const activeTableId = findActiveTableId(overview?.stages, Number(session.myId))
    return activeTableId ? { ...tournament, activeTableId } : tournament
  } catch {
    // Standings/overview are a nice-to-have on top of the list entry already
    // built — a failure here shouldn't drop the tournament from the tab.
    return tournament
  }
}

export async function fetchBgaTournaments(username: string, password: string, auth?: BgaAuthOptions): Promise<Tournament[]> {
  return withBgaSession(username, password, async session => {
    const raw = await listMyTournaments(session)
    return Promise.all(raw.map(r => attachActiveMatch(session, toTournament(r), Number(r.id))))
  }, auth)
}
