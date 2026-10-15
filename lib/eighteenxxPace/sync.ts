import { BASE, loginEighteenxx, fetchProfileGames } from '../connectors/eighteenxx'
import { withTimeout } from '../connectors/utils'
import { getEighteenxxPaceGames, putEighteenxxPaceGames, EighteenxxPaceGame } from './store'

const CONCURRENCY = 5
// A single hung request (no response, ever) would otherwise block the whole
// worker loop past the edge runtime's real ~25s ceiling regardless of the
// overall budget check between iterations — see /api/games/route.ts's own
// note on that ceiling. Kept short enough that even a job started right at
// the worker loop's own cutoff still finishes with margin to spare.
const DETAIL_FETCH_TIMEOUT_MS = 6000
// Worker loop stops starting new jobs this long before the deadline, so an
// in-flight job (up to DETAIL_FETCH_TIMEOUT_MS) can't itself run past it
const WORKER_CUTOFF_MARGIN_MS = 4000

type FetchResult = { actionCount: number } | { error: string }

// The games list (/api/game/user, and the profile page's embedded games)
// only ever carries an empty `actions` array — the full log is only in each
// game's own detail endpoint, one request per game.
async function fetchActionCount(id: string, cookie: string): Promise<FetchResult> {
  try {
    const res = await withTimeout(
      fetch(`${BASE}/api/game/${id}`, { headers: { Cookie: cookie, Accept: 'application/json' } }),
      DETAIL_FETCH_TIMEOUT_MS, `18xx game ${id} detail fetch`,
    )
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const data = await res.json()
    if (!Array.isArray(data?.actions)) return { error: 'no actions array in response' }
    return { actionCount: data.actions.length }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

interface Job {
  id: string
  title: string
  playerCount: number
  end: number | null
  start?: number
}

export async function syncEighteenxx(
  username: string, password: string, sessionCookie: string | undefined, budgetMs: number,
): Promise<{ active: number; finished: number; read: number }> {
  const deadline = Date.now() + budgetMs
  // fetchProfileGames does its own auth round-trip internally and fetches an
  // unauthenticated page (not Cookie-based), so it doesn't need `cookie` and
  // can run fully in parallel with login rather than after it. It's also the
  // slowest of these — resolving myId plus a page embedding up to 100 games —
  // so it gets the longest individual budget.
  const profilePromise = withTimeout(fetchProfileGames(username, password, sessionCookie), 12000, '18xx profile fetch')
  const cookie = await withTimeout(loginEighteenxx(username, password, sessionCookie), 6000, '18xx login')
  // fetchProfileGames resolves myId robustly (env override, or the login
  // response) — /api/game/user can come back with zero active games when
  // everything's caught up, which would leave no way to recognize "me" in it.
  const [{ myId, games: profileGames }, gamesRes] = await Promise.all([
    profilePromise,
    withTimeout(fetch(`${BASE}/api/game/user`, { headers: { Cookie: cookie, Accept: 'application/json' } }), 6000, '18xx games/user fetch'),
  ])
  if (!gamesRes.ok) throw new Error(`18xx.games games fetch failed (HTTP ${gamesRes.status})`)
  const data = await gamesRes.json()
  const allGames: any[] = Array.isArray(data) ? data : data.games ?? []
  const activeRaw = allGames.filter(g => g.status === 'active' && (g.players ?? []).some((p: any) => p.id === myId))

  // Older finished games fall out of /api/game/user's pool — the profile
  // page is the only place that still lists them (up to the last 100)
  const finishedRaw = profileGames.filter(g =>
    (g.status === 'finished' || g.status === 'archived') && (g.players ?? []).some((p: any) => p.id === myId))

  const stored = await getEighteenxxPaceGames()
  const activeIds = new Set(activeRaw.map(g => String(g.id)))

  // Active games are always re-read (their action count keeps growing); a
  // finished game's is final, so one already recorded is never re-fetched
  const startOf = (g: any): number | undefined => typeof g.created_at === 'number' ? g.created_at : undefined

  const jobs: Job[] = [
    ...activeRaw.map((g): Job => ({ id: String(g.id), title: g.title ?? 'Unknown', playerCount: (g.players ?? []).length, end: null, start: startOf(g) })),
    ...finishedRaw
      .filter(g => {
        const existing = stored[String(g.id)]
        return !(existing && existing.end !== null && existing.actionCount != null)
      })
      .map((g): Job => ({
        id: String(g.id), title: g.title ?? 'Unknown', playerCount: (g.players ?? []).length,
        end: typeof g.finished_at === 'number' ? g.finished_at : typeof g.updated_at === 'number' ? g.updated_at : Math.floor(Date.now() / 1000),
        start: startOf(g),
      })),
  ]

  const updates: EighteenxxPaceGame[] = []
  let read = 0
  let next = 0
  async function worker() {
    while (next < jobs.length && Date.now() < deadline - WORKER_CUTOFF_MARGIN_MS) {
      const job = jobs[next++]
      const result = await fetchActionCount(job.id, cookie)
      const now = Math.floor(Date.now() / 1000)
      if ('actionCount' in result) {
        read++
        updates.push({ id: job.id, title: job.title, end: job.end, actionCount: result.actionCount, playerCount: job.playerCount, start: job.start, lastCheckedAt: now })
      } else {
        const existing = stored[job.id]
        updates.push({
          ...(existing ?? { id: job.id, title: job.title, end: job.end, actionCount: null, start: job.start }),
          lastError: result.error, lastCheckedAt: now,
        })
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  // A game that dropped out of the active list before the profile page
  // caught up to it — freeze it at its last known count rather than
  // dropping it, same fallback as Rally
  const touched = new Set(jobs.map(j => j.id))
  for (const [id, g] of Object.entries(stored)) {
    if (g.end === null && !activeIds.has(id) && !touched.has(id)) {
      updates.push({ ...g, end: Math.floor(Date.now() / 1000) })
    }
  }

  await putEighteenxxPaceGames(updates)
  return { active: activeRaw.length, finished: finishedRaw.length, read }
}
