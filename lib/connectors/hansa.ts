// lib/connectors/hansa.ts
import * as cheerio from 'cheerio/slim'
import { Game } from '../types'
import { formatTimeAgo } from './utils'

const BASE = 'https://www.hansa-teutonica.de'
// TODO: Verify login endpoint and field names by inspecting the real login form
const LOGIN_URL = `${BASE}/login`
// TODO: Verify the URL of the page listing your active games
const GAMES_URL = `${BASE}/my-games`

export async function fetchHansa(username: string, password: string): Promise<Game[]> {
  // Login to get session cookie
  // TODO: Verify form field names (may be 'username'/'password', 'email'/'password', etc.)
  const loginRes = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password }),
    redirect: 'manual',
  })
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
  if (!cookie) throw new Error('Hansa Teutonica login failed')

  // Fetch active games page
  const gamesRes = await fetch(GAMES_URL, {
    headers: { Cookie: cookie },
  })
  const html = await gamesRes.text()
  const $ = cheerio.load(html)
  const games: Game[] = []

  // TODO: Verify selectors by inspecting real HTML — update these when real fixture is captured
  $('.game-item').each((_: number, el: any) => {
    const $el = $(el)
    const gameId = $el.attr('data-game-id') ?? ''
    const lastMoveStr = $el.find('.last-move-time').text().trim()
    const lastMoveAt = lastMoveStr ? new Date(lastMoveStr) : new Date()
    const activePlayer = $el.find('.active-player').text().trim()
    const isMyTurn = $el.hasClass('my-turn')
    const playerNames = $el.find('.player-names').text().trim()
      .split(',')
      .map((n: string) => n.trim())
      .filter((n: string) => n && n !== username)

    games.push({
      id: `hansa:${gameId}`,
      platform: 'hansa',
      gameName: $el.find('.game-title').text().trim(),
      myTurn: isMyTurn,
      currentPlayer: isMyTurn ? undefined : activePlayer,
      lastMoveAt,
      lastMoveAgo: formatTimeAgo(lastMoveAt),
      urgent: Date.now() - lastMoveAt.getTime() > 2 * 24 * 60 * 60 * 1000,
      gameUrl: BASE + ($el.find('.game-link').attr('href') ?? ''),
      platformUrl: GAMES_URL,
      players: playerNames,
    })
  })

  return games
}
