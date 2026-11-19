import { Game, Platform } from '../types'
import { getOpponents, addResponseSample, getGameWatch, putGameWatch, deleteGameWatch, GameWatchEntry } from './store'
import { addMySample } from '../responseTime/store'

// The one opponent a waiting game is on, when it can be told apart from a
// myTurn flip alone: the site's own currentPlayer when it reports one, else
// the sole other player in a 2-player game. Anything else (3+ players, no
// currentPlayer) is genuinely ambiguous — "not my turn" doesn't say which of
// several people is holding things up — so it's left unresolved rather than
// guessed, and that game simply isn't counted toward anyone's response time.
function resolveOpponent(game: Pick<Game, 'currentPlayer' | 'players'>): string | undefined {
  return game.currentPlayer ?? (game.players.length === 1 ? game.players[0] : undefined)
}

function median(sorted: number[]): number {
  const n = sorted.length
  const mid = Math.floor(n / 2)
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Compares this fetch's myTurn against what was last observed, the same
// true/false-flip detection as lib/moveCounts/track.ts, but timing both
// directions instead of just counting one: myTurn true -> false means I
// just moved (a sample of *my* response time), false -> true means the
// resolved opponent just moved (a sample of *theirs*). Only entries that
// actually changed need writing back — see `changed`.
function reconcile(prevWatch: Record<string, GameWatchEntry>, games: Game[], now: number) {
  const all: Record<string, GameWatchEntry> = {}
  const changed: Record<string, GameWatchEntry> = {}
  const oppSamples: { name: string; seconds: number }[] = []
  const mySamples: number[] = []

  for (const g of games) {
    const prev = prevWatch[g.id]
    const opponentName = resolveOpponent(g)

    if (!prev) {
      const fresh: GameWatchEntry = { myTurn: g.myTurn, since: now, opponentName }
      all[g.id] = fresh
      changed[g.id] = fresh
      continue
    }

    if (prev.myTurn === g.myTurn) {
      if (opponentName !== undefined && opponentName !== prev.opponentName) {
        const next = { ...prev, opponentName }
        all[g.id] = next
        changed[g.id] = next
      } else {
        all[g.id] = prev
      }
      continue
    }

    const elapsed = now - prev.since
    if (prev.myTurn) mySamples.push(elapsed)
    else if (prev.opponentName) oppSamples.push({ name: prev.opponentName, seconds: elapsed })

    const next: GameWatchEntry = { myTurn: g.myTurn, since: now, opponentName }
    all[g.id] = next
    changed[g.id] = next
  }

  return { all, changed, oppSamples, mySamples }
}

// Side effect: records response-time samples (mine and the resolved
// opponent's) by comparing this fetch's myTurn to the last one seen for
// each game. Return value: attaches `predictedReturnAt` to a waiting game
// whose opponent has enough history to estimate from — lastMoveAt plus
// the median of their past response times — for the "likely to reply
// soonest" sort (lib/sort-filter.ts). Must run on every fetch, same
// contract as attachMoveCounts/attachFirstSeenProgress.
export async function attachOpponentTracking(platform: Platform, games: Game[]): Promise<Game[]> {
  const relevant = games.filter(g => g.platform === platform)
  try {
    const now = Math.floor(Date.now() / 1000)
    const prevWatch = await getGameWatch(platform)
    const { all, changed, oppSamples, mySamples } = reconcile(prevWatch, relevant, now)
    const vanished = Object.keys(prevWatch).filter(id => !(id in all))

    await Promise.all([
      putGameWatch(platform, changed),
      deleteGameWatch(platform, vanished),
      ...oppSamples.map(s => addResponseSample(platform, s.name, s.seconds)),
      ...mySamples.map(s => addMySample(platform, s)),
    ])

    const opponents = await getOpponents(platform)
    return games.map(g => {
      if (g.platform !== platform || g.myTurn) return g
      const name = resolveOpponent(g)
      const samples = name ? opponents[name]?.responseSamples : undefined
      if (!samples || samples.length === 0) return g
      const etaSeconds = median([...samples].sort((a, b) => a - b))
      return { ...g, predictedReturnAt: new Date(g.lastMoveAt.getTime() + etaSeconds * 1000).toISOString() }
    })
  } catch {
    // A KV hiccup should just mean no prediction shown this refresh, not
    // that the games themselves fail to show
    return games
  }
}
