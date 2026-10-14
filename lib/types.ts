export type Platform =
  | 'bga'
  | 'eighteenxx'
  | 'obg'
  | 'yucata'
  | 'choochoo'
  | 'hansa'
  | 'rally'
  | 'oldkingscrown'

export interface Game {
  id: string              // e.g. "bga:12345"
  platform: Platform
  gameName: string
  gameType?: string       // the game itself, when gameName is a player-set table title
  myTurn: boolean
  currentPlayer?: string  // whose turn when myTurn is false; omit if unavailable
  lastMoveAt: Date
  lastMoveAgo: string     // pre-formatted: "3h ago", "2 days ago"
  urgent: boolean         // true when lastMoveAt is > 2 days ago
  gameUrl: string
  platformUrl: string
  players: string[]       // other players; empty array if unavailable
  deadlineAt?: string     // ISO; when the active player's time runs out (BGA)
  gameKey?: string        // the site's id for the game itself (BGA game_id), for its full history
  // How far along this game looks, estimated from turns played so far vs. the
  // median of your finished games of the same type (BGA only — see lib/pace).
  // Omitted when there isn't enough data (no history to compare against yet).
  progress?: {
    percent: number
    turnsSoFar: number
    estimatedTotalTurns: number
    sampleCount: number
    samples: number[]
    sameSizeOnly: boolean
  }
}

export interface UserPrefs {
  pins: string[]
  sunk: string[]          // always sorted to the end of their section (e.g. solo games you don't want cluttering the top)
  sort: 'longest-wait' | 'most-recent' | 'platform' | 'game-name' | 'closest-to-end'
  filter: {
    turnStatus: 'all' | 'my-turn' | 'waiting'
    platforms: Platform[]  // empty = show all
  }
  disabledPlatforms: Platform[]  // skipped entirely during fetch
  eighteenxxSessionCookie?: string
  opponentSlowDays: number       // waiting games older than this show urgency indicator (default 5)
  deadlineSoonHours: number      // my-turn games with a deadline under this show the red "time's running out" indicator (default 24)
  oldkingscrownGameIds?: string[] // manually tracked game ids — no account system to discover them automatically
  backlogPlatforms?: Platform[]   // sites shown by default when adding games to the backlog
  // BGA's session cookie + numeric player id. Tried before logging in with
  // username/password, so it also works while BGA is throttling or blocking
  // automated logins. Re-saved here automatically after every successful
  // login, so it's usually a self-refreshing cache rather than something you
  // maintain by hand — pasting one manually (from an already-logged-in
  // browser) is only needed to bootstrap it, or when login is stuck.
  bgaSessionCookie?: string
  bgaPlayerId?: string
  watchedGames: string[] // get an instant ntfy push the moment one of these flips to myTurn, rather than waiting for the twice-daily digest
  ntfyTopic?: string      // your ntfy.sh topic — install the ntfy app and subscribe to this same topic to receive the push
  showProgress?: boolean  // show the "% through the game" bar (beta — undefined/missing defaults to on; off reverts to the old cards)
}

export const DEFAULT_BACKLOG_PLATFORMS: Platform[] = ['bga', 'yucata']

export const DEFAULT_PREFS: UserPrefs = {
  pins: [],
  sunk: [],
  sort: 'longest-wait',
  filter: { turnStatus: 'all', platforms: [] },
  disabledPlatforms: [],
  opponentSlowDays: 5,
  deadlineSoonHours: 24,
  watchedGames: [],
}

export interface GamesApiResponse {
  games: Game[]
  errors: { platform: Platform; error: string }[]
  fetchedAt: string
  platforms?: Platform[]  // all queried platforms (including those with 0 games)
}

export interface FinishedGame {
  id: string           // e.g. "eighteenxx:333"
  platform: Platform
  gameName: string
  gameType?: string    // the game itself, when gameName is a player-set table title
  completedAt: Date
  completedAgo: string // pre-formatted: "3h ago", "2 days ago"
  gameUrl: string
  result?: 'won' | 'lost' | 'draw' | 'coop' // my result, where the site reports it
  rank?: number        // my place, 1 = first
  playerCount?: number
  elo?: number         // my rating for this game after it (BGA, ranked games)
  eloDelta?: number    // change since my previous game of it in the fetched history
  opponents?: { name: string; rank?: number }[] // where the site lists them
  score?: string       // my final score (BGA)
  startedAt?: string   // ISO (BGA)
  gameKey?: string     // the site's id for the game itself (BGA game_id), for its full history
  turns?: number       // the whole game's turn count, when tracked (BGA only — see lib/pace)
}

export interface FinishedGamesApiResponse {
  games: FinishedGame[]
  errors: { platform: Platform; error: string }[]
  fetchedAt: string
}

// For tight spots like the dashboard's filter chips
export const PLATFORM_SHORT_LABELS: Record<Platform, string> = {
  bga: 'BGA',
  eighteenxx: '18xx',
  obg: 'OBG',
  yucata: 'Yucata',
  choochoo: 'choochoo',
  hansa: 'Hansa',
  rally: 'Rally',
  oldkingscrown: 'OKC',
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  bga: 'BGA',
  eighteenxx: '18xx.games',
  obg: 'onlineboardgamers',
  yucata: 'Yucata',
  choochoo: 'choochoo.games',
  hansa: 'Hansa Teutonica',
  rally: 'Rally the Troops',
  oldkingscrown: "The Old King's Crown",
}

export const PLATFORM_URLS: Record<Platform, string> = {
  bga: 'https://boardgamearena.com',
  eighteenxx: 'https://18xx.games',
  obg: 'https://www.onlineboardgamers.com',
  yucata: 'https://www.yucata.de',
  choochoo: 'https://www.choochoo.games/',
  hansa: 'https://playhansa.app',
  rally: 'https://rally-the-troops.com',
  oldkingscrown: 'https://oldkingscrown.fly.dev',
}
