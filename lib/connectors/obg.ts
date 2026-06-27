import * as cheerio from 'cheerio/slim'
import { Game } from '../types'
import { formatTimeAgo } from './utils'

const BASE = 'https://www.onlineboardgamers.com'

const BROWSER = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

export async function fetchOBG(username: string, password: string): Promise<Game[]> {
  // Step 1: GET /login/ to obtain Django CSRF cookie + form token
  const loginPageRes = await fetch(`${BASE}/login/`, {
    headers: BROWSER,
    redirect: 'manual',
  })
  const loginPageHtml = await loginPageRes.text()
  const csrfCookieVal = loginPageRes.headers.get('set-cookie')?.match(/\bcsrftoken=([^;,\s]+)/)?.[1] ?? ''
  const csrfMiddleware = loginPageHtml.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/)?.[1] ?? csrfCookieVal

  // Step 2: POST login with Django CSRF tokens
  const loginRes = await fetch(`${BASE}/login/`, {
    method: 'POST',
    headers: {
      ...BROWSER,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': `${BASE}/login/`,
      'Origin': BASE,
      Cookie: `csrftoken=${csrfCookieVal}`,
    },
    body: new URLSearchParams({ csrfmiddlewaretoken: csrfMiddleware, username, password, next: '' }),
    redirect: 'manual',
  })

  const loginSetCookie = loginRes.headers.get('set-cookie') ?? ''
  const sessionidMatch = loginSetCookie.match(/\bsessionid=([^;,\s]+)/)
  const newCsrf = loginSetCookie.match(/\bcsrftoken=([^;,\s]+)/)?.[1] ?? csrfCookieVal
  const loginLoc = loginRes.headers.get('location') ?? ''
  const loginOk = !!sessionidMatch || (loginRes.status >= 300 && loginRes.status < 400 && loginLoc && loginLoc !== '/login/' && loginLoc !== `${BASE}/login/`)
  if (!loginOk) throw new Error('OBG login failed')

  const cookieHeader = [`csrftoken=${newCsrf}`, ...(sessionidMatch ? [`sessionid=${sessionidMatch[1]}`] : [])].join('; ')

  // Step 3: Fetch active games page
  const gamesRes = await fetch(`${BASE}/dashboard/`, {
    headers: { ...BROWSER, Cookie: cookieHeader, 'Referer': `${BASE}/` },
  })
  const html = await gamesRes.text()
  const $ = cheerio.load(html)
  const games: Game[] = []

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
      id: `obg:${gameId}`,
      platform: 'obg',
      gameName: $el.find('.game-title').text().trim(),
      myTurn: isMyTurn,
      currentPlayer: isMyTurn ? undefined : activePlayer,
      lastMoveAt,
      lastMoveAgo: formatTimeAgo(lastMoveAt),
      urgent: Date.now() - lastMoveAt.getTime() > 2 * 24 * 60 * 60 * 1000,
      gameUrl: BASE + ($el.find('.game-link').attr('href') ?? ''),
      platformUrl: `${BASE}/dashboard/`,
      players: playerNames,
    })
  })

  return games
}
