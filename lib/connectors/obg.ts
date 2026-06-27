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
  // Step 1: GET /login/ — Django CSRF cookie + form token
  const loginPageRes = await fetch(`${BASE}/login/`, { headers: BROWSER, redirect: 'manual' })
  const loginPageHtml = await loginPageRes.text()
  const csrfCookieVal = loginPageRes.headers.get('set-cookie')?.match(/\bcsrftoken=([^;,\s]+)/)?.[1] ?? ''
  const csrfMiddleware = loginPageHtml.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/)?.[1] ?? csrfCookieVal

  // Step 2: POST /login/ with credentials
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

  // Step 3: GET / — extract profile name from "My Games" nav link
  const homeRes = await fetch(`${BASE}/`, { headers: { ...BROWSER, Cookie: cookieHeader } })
  const homeHtml = await homeRes.text()
  const profileName = homeHtml.match(/href="\/profile\/([^/"]+)\/"[^>]*>\s*My Games/)?.[1] ?? username

  // Step 4: GET /profile/{name}/ — active games table
  const profileRes = await fetch(`${BASE}/profile/${profileName}/`, {
    headers: { ...BROWSER, Cookie: cookieHeader },
  })
  const profileHtml = await profileRes.text()

  return parseGames(profileHtml, profileName)
}

function parseGames(html: string, profileName: string): Game[] {
  const $ = cheerio.load(html)
  const games: Game[] = []

  // Profile page has two gamesTable tables: "Current Games" then "Finished Games" — take only the first
  $('table.gamesTable').first().find('tr.clickableGameRow').each((_: number, el: any) => {
    const $tr = $(el)

    // Game ID from tr id: "AQYgamesRow28424" → "28424"
    const gameId = ($tr.attr('id') ?? '').match(/gamesRow(\d+)/)?.[1]
    if (!gameId) return

    // Game URL and name from the name cell anchor (col 0)
    const $nameAnchor = $tr.find('td').eq(0).find('a').first()
    const gameUrl = BASE + ($nameAnchor.attr('href') ?? '')
    const rawName = $nameAnchor.text().trim()
    const gameName = rawName.replace(/^\[(.+)\]$/, '$1') || 'Unknown'

    const isMyTurn = $tr.hasClass('myMove')

    // Col 1: current player(s) text — who can move right now
    // Numeric values (e.g. "5") indicate simultaneous-move games with N players pending
    const currentPlayerText = $tr.find('td').eq(1).text().trim()
    const currentPlayer = isMyTurn || /^\d+$/.test(currentPlayerText) ? undefined : (currentPlayerText || undefined)

    // Col 3: all players as profile links — exclude self
    const allPlayers = $tr.find('td').eq(3).find('a').map((_: number, a: any) => $(a).text().trim()).get() as string[]
    const players = allPlayers.filter((p: string) => p && p !== profileName)

    // Last turn: timeToConvertSpan holds Unix ms timestamp
    const tsText = $tr.find('.timeToConvertSpan').first().text().trim()
    const lastMoveAt = tsText ? new Date(parseInt(tsText)) : new Date()

    games.push({
      id: `obg:${gameId}`,
      platform: 'obg',
      gameName,
      myTurn: isMyTurn,
      currentPlayer,
      lastMoveAt,
      lastMoveAgo: formatTimeAgo(lastMoveAt),
      urgent: Date.now() - lastMoveAt.getTime() > 2 * 24 * 60 * 60 * 1000,
      gameUrl,
      platformUrl: `${BASE}/profile/${profileName}/`,
      players,
    })
  })

  return games
}
