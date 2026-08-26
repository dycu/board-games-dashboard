import * as cheerio from 'cheerio/slim'
import { Game, FinishedGame } from '../types'
import { formatTimeAgo } from './utils'

const BASE = 'https://www.onlineboardgamers.com'

const BROWSER = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

// Site migrated its login/home pages under a "/nd/" (new design) prefix; the
// old paths now 301-redirect there with no body, which broke CSRF-token
// scraping. Profile pages still 301-redirect from the old path, so those are
// left as-is and just followed automatically.
const LOGIN_PATH = '/nd/login/'
const HOME_PATH = '/nd/'

export async function fetchOBG(username: string, password: string): Promise<Game[]> {
  // Step 1: GET /nd/login/ — Django CSRF cookie + form token
  const loginPageRes = await fetch(`${BASE}${LOGIN_PATH}`, { headers: BROWSER, redirect: 'manual' })
  const loginPageHtml = await loginPageRes.text()
  const csrfCookieVal = loginPageRes.headers.get('set-cookie')?.match(/\bcsrftoken=([^;,\s]+)/)?.[1] ?? ''
  const csrfMiddleware = loginPageHtml.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/)?.[1] ?? csrfCookieVal

  // Step 2: POST /nd/login/ with credentials
  const loginRes = await fetch(`${BASE}${LOGIN_PATH}`, {
    method: 'POST',
    headers: {
      ...BROWSER,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': `${BASE}${LOGIN_PATH}`,
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
  const loginOk = !!sessionidMatch || (loginRes.status >= 300 && loginRes.status < 400 && loginLoc && loginLoc !== LOGIN_PATH && loginLoc !== `${BASE}${LOGIN_PATH}`)
  if (!loginOk) throw new Error('OBG login failed')

  const cookieHeader = [`csrftoken=${newCsrf}`, ...(sessionidMatch ? [`sessionid=${sessionidMatch[1]}`] : [])].join('; ')

  // Step 3: GET /nd/ — extract profile name from "My Games" nav link
  const homeRes = await fetch(`${BASE}${HOME_PATH}`, { headers: { ...BROWSER, Cookie: cookieHeader } })
  const homeHtml = await homeRes.text()
  const profileName = homeHtml.match(/href="(?:\/nd)?\/profile\/([^/"]+)\/"[^>]*>\s*My Games/)?.[1] ?? username

  // Step 4: GET /profile/{name}/ — active games table (still redirects to /nd/profile/{name}/, followed automatically)
  const profileRes = await fetch(`${BASE}/profile/${profileName}/`, {
    headers: { ...BROWSER, Cookie: cookieHeader },
  })
  const profileHtml = await profileRes.text()

  return parseGames(profileHtml, profileName)
}

const OBG_GAME_NAMES: Record<string, string> = {
  FCM: 'Food Chain Magnate',
  HLC: 'Horseless Carriage',
  AQY: 'Antiquity',
  IND: 'Indonesia',
  BUS: 'Bus',
  TGZ: 'The Great Zimbabwe',
  CNS: 'Cannes',
  WEB: 'Web of Power',
  KFW: 'Keyflower',
  RNB: 'Roads & Boats',
}

// The redesign nests game-type-coded links under "/nd/" (e.g. "/nd/FCM/101/show/"
// instead of "/FCM/101/show/") — strip that prefix before reading the code.
function extractTypeCode(href: string): string {
  return href.replace(/^\/nd(?=\/)/, '').match(/^\/([A-Z]+)\//)?.[1] ?? ''
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

    // Game URL and name from the name cell anchor
    const $nameAnchor = $tr.find('td.nd-col-game a').first()
    const href = $nameAnchor.attr('href') ?? ''
    const gameUrl = BASE + href
    const rawName = $nameAnchor.text().trim()
    const customTitle = rawName.match(/^\[(.+)\]$/)?.[1]
    const typeCode = extractTypeCode(href)
    const typeName = OBG_GAME_NAMES[typeCode] ?? typeCode
    const gameName = customTitle ? `${typeName} — ${customTitle}` : (rawName || typeName || 'Unknown')

    // The redesign dropped the old "myMove" row class; the status cell now just
    // names whoever needs to act next, so compare it to our own profile name.
    // Numeric values (e.g. "5") indicate simultaneous-move games with N players pending.
    const statusText = $tr.find('td.nd-col-status').text().trim()
    const isSimultaneous = /^\d+$/.test(statusText)
    const isMyTurn = !isSimultaneous && statusText.toLowerCase() === profileName.toLowerCase()
    const currentPlayer = isMyTurn || isSimultaneous ? undefined : (statusText || undefined)

    // All players as profile links — exclude self
    const allPlayers = $tr.find('td.nd-col-players a').map((_: number, a: any) => $(a).text().trim()).get() as string[]
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
      platformUrl: `${BASE}/nd/profile/${profileName}/`,
      players,
    })
  })

  return games
}

function parseFinishedGames(html: string): FinishedGame[] {
  const $ = cheerio.load(html)
  const tables = $('table.gamesTable')
  if (tables.length < 2) return []
  const $table = tables.eq(1)
  const games: FinishedGame[] = []

  $table.find('tr.clickableGameRow').each((_: number, el: any) => {
    const $tr = $(el)
    const gameId = ($tr.attr('id') ?? '').match(/gamesRow(\d+)/)?.[1]
    if (!gameId) return

    const $nameAnchor = $tr.find('td.nd-col-game a').first()
    const href = $nameAnchor.attr('href') ?? ''
    const gameUrl = BASE + href
    const rawName = $nameAnchor.text().trim()
    const customTitle = rawName.match(/^\[(.+)\]$/)?.[1]
    const typeCode = extractTypeCode(href)
    const typeName = OBG_GAME_NAMES[typeCode] ?? typeCode
    const gameName = customTitle ? `${typeName} — ${customTitle}` : (rawName || typeName || 'Unknown')

    const tsText = $tr.find('.timeToConvertSpan').first().text().trim()
    const completedAt = tsText ? new Date(parseInt(tsText)) : new Date()

    games.push({
      id: `obg:${gameId}`,
      platform: 'obg',
      gameName,
      completedAt,
      completedAgo: formatTimeAgo(completedAt),
      gameUrl,
    })
  })

  return games
}

export async function fetchFinishedOBG(username: string, password: string): Promise<FinishedGame[]> {
  const loginPageRes = await fetch(`${BASE}${LOGIN_PATH}`, { headers: BROWSER, redirect: 'manual' })
  const loginPageHtml = await loginPageRes.text()
  const csrfCookieVal = loginPageRes.headers.get('set-cookie')?.match(/\bcsrftoken=([^;,\s]+)/)?.[1] ?? ''
  const csrfMiddleware = loginPageHtml.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/)?.[1] ?? csrfCookieVal

  const loginRes = await fetch(`${BASE}${LOGIN_PATH}`, {
    method: 'POST',
    headers: {
      ...BROWSER,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': `${BASE}${LOGIN_PATH}`,
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
  const loginOk = !!sessionidMatch || (loginRes.status >= 300 && loginRes.status < 400 && loginLoc && loginLoc !== LOGIN_PATH && loginLoc !== `${BASE}${LOGIN_PATH}`)
  if (!loginOk) throw new Error('OBG login failed')

  const cookieHeader = [`csrftoken=${newCsrf}`, ...(sessionidMatch ? [`sessionid=${sessionidMatch[1]}`] : [])].join('; ')

  const homeRes = await fetch(`${BASE}${HOME_PATH}`, { headers: { ...BROWSER, Cookie: cookieHeader } })
  const homeHtml = await homeRes.text()
  const profileName = homeHtml.match(/href="(?:\/nd)?\/profile\/([^/"]+)\/"[^>]*>\s*My Games/)?.[1] ?? username

  const profileRes = await fetch(`${BASE}/profile/${profileName}/`, {
    headers: { ...BROWSER, Cookie: cookieHeader },
  })
  const profileHtml = await profileRes.text()
  return parseFinishedGames(profileHtml)
}
