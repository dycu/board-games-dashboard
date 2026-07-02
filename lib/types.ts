export type Platform =
  | 'bga'
  | 'eighteenxx'
  | 'obg'
  | 'yucata'
  | 'choochoo'
  | 'hansa'
  | 'rally'

export interface Game {
  id: string              // e.g. "bga:12345"
  platform: Platform
  gameName: string
  myTurn: boolean
  currentPlayer?: string  // whose turn when myTurn is false; omit if unavailable
  lastMoveAt: Date
  lastMoveAgo: string     // pre-formatted: "3h ago", "2 days ago"
  urgent: boolean         // true when lastMoveAt is > 2 days ago
  gameUrl: string
  platformUrl: string
  players: string[]       // other players; empty array if unavailable
}

export interface UserPrefs {
  pins: string[]
  sort: 'longest-wait' | 'most-recent' | 'platform' | 'game-name'
  filter: {
    turnStatus: 'all' | 'my-turn' | 'waiting'
    platforms: Platform[]  // empty = show all
  }
  disabledPlatforms: Platform[]  // skipped entirely during fetch
  bgaSortCapDays: number         // cap for BGA urgency sort and display (default 3)
  eighteenxxSessionCookie?: string
}

export const DEFAULT_PREFS: UserPrefs = {
  pins: [],
  sort: 'longest-wait',
  filter: { turnStatus: 'all', platforms: [] },
  disabledPlatforms: [],
  bgaSortCapDays: 3,
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
  completedAt: Date
  completedAgo: string // pre-formatted: "3h ago", "2 days ago"
  gameUrl: string
}

export interface FinishedGamesApiResponse {
  games: FinishedGame[]
  errors: { platform: Platform; error: string }[]
  fetchedAt: string
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  bga: 'BGA',
  eighteenxx: '18xx.games',
  obg: 'onlineboardgamers',
  yucata: 'Yucata',
  choochoo: 'choochoo.games',
  hansa: 'Hansa Teutonica',
  rally: 'Rally the Troops',
}

export const PLATFORM_URLS: Record<Platform, string> = {
  bga: 'https://boardgamearena.com',
  eighteenxx: 'https://18xx.games',
  obg: 'https://www.onlineboardgamers.com',
  yucata: 'https://www.yucata.de',
  choochoo: 'https://www.choochoo.games/',
  hansa: 'https://playhansa.app',
  rally: 'https://rally-the-troops.com',
}
