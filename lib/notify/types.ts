import { Platform } from '../types'

// A game as /api/games streams it (dates are ISO strings)
export interface StreamedGame {
  id: string
  platform: Platform
  gameName: string
  myTurn: boolean
  currentPlayer?: string
  lastMoveAt: string
  deadlineAt?: string
  gameUrl: string
}
