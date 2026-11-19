import { Game, Platform } from '../types'
import { addResponseSample, getGameWatch, putGameWatch, deleteGameWatch, getOpponents, putOpponents, GameWatchEntry, OpponentEntry } from './store'
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

// Compares this fetch's myTurn against what was last observed, the same
// true/false-flip detection as lib/moveCounts/track.ts, but timing both
// directions instead of just counting one: myTurn true -> false means I
// just moved (a sample of *my* response time), false -> true means the
// resolved opponent just moved (a sample of *theirs*). The same applies
// mid-wait, in a 3+ player game, when the resolved opponent changes without
// myTurn flipping (the currentPlayer moved on to someone else without it
// coming back to me yet) — that's still a completed response from the
// *previous* opponent, so it's sampled and the clock restarts for the new
// one. Without that, a multi-player game's elapsed-since-my-move time would
// all land on whoever happened to be currentPlayer right before it became
// my turn again, hugely overstating their response time and ignoring
// everyone else's. Only entries that actually changed need writing back —
// see `changed`.
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
        if (!prev.myTurn && prev.opponentName) oppSamples.push({ name: prev.opponentName, seconds: now - prev.since })
        const next: GameWatchEntry = { myTurn: prev.myTurn, since: now, opponentName }
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

// Side effect only: records response-time samples (mine and each resolved
// opponent's) by comparing this fetch's myTurn to the last one seen for
// each game, and mirrors any avatar URL a game carries (Game.playerAvatars)
// onto the matching opponent entry — both feed the Players page (its
// "typical reply time" stat and its own avatar, which otherwise has no way
// to see live game data at all). Must run on every fetch, same contract as
// attachMoveCounts/attachFirstSeenProgress.
export async function attachOpponentTracking(platform: Platform, games: Game[]): Promise<Game[]> {
  const relevant = games.filter(g => g.platform === platform)
  try {
    const now = Math.floor(Date.now() / 1000)
    const [prevWatch, currentOpponents] = await Promise.all([getGameWatch(platform), getOpponents(platform)])
    const { all, changed, oppSamples, mySamples } = reconcile(prevWatch, relevant, now)
    const vanished = Object.keys(prevWatch).filter(id => !(id in all))

    const avatarUpdates: Record<string, OpponentEntry> = {}
    for (const g of relevant) {
      for (const [playerName, url] of Object.entries(g.playerAvatars ?? {})) {
        if (currentOpponents[playerName]?.avatarUrl === url) continue
        const existing = avatarUpdates[playerName] ?? currentOpponents[playerName] ?? { tags: [], responseSamples: [] }
        avatarUpdates[playerName] = { ...existing, avatarUrl: url }
      }
    }

    await Promise.all([
      putGameWatch(platform, changed),
      deleteGameWatch(platform, vanished),
      ...oppSamples.map(s => addResponseSample(platform, s.name, s.seconds)),
      ...mySamples.map(s => addMySample(platform, s)),
      putOpponents(platform, avatarUpdates),
    ])
  } catch {
    // A KV hiccup should just mean no samples recorded this refresh, not
    // that the games themselves fail to show
  }
  return games
}
