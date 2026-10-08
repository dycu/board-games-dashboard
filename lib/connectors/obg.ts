import { kv } from '@vercel/kv'
import * as cheerio from 'cheerio/slim'
import { Game, FinishedGame } from '../types'
import { formatTimeAgo } from './utils'

const BASE = 'https://www.onlineboardgamers.com'

const BROWSER = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

// Site briefly migrated its login/home pages under a "/nd/" (new design)
// prefix but has since reverted the URLs — /nd/login/ and /nd/ now
// 301-redirect back to the bare paths, and the real <form> still posts to
// /login/. The games-table markup (parsed below) was also reverted back to
// its pre-redesign "col-*" classes (not "nd-col-*") at the same time.
const LOGIN_PATH = '/login/'
const HOME_PATH = '/'

interface OBGSession {
  cookieHeader: string
  profileName: string
}

const SESSION_KV_KEY = 'obg-session'
// The 4-request login dance (CSRF cookie, credentials POST, home page,
// profile page) is what makes this connector slow, not the HTML parsing —
// so a logged-in session is cached and reused across calls, cutting a
// refresh down to the one profile-page request. The TTL is comfortably
// longer than the dashboard's shortest auto-refresh interval (30s) so
// almost every refresh hits the cache; if the real site session actually
// expires sooner, fetchOBGProfileHtml below detects that and re-logs in.
const SESSION_TTL_SECONDS = 60 * 60

async function loginOBG(username: string, password: string): Promise<OBGSession> {
  // Step 1: GET /login/ — Django CSRF cookie + form token
  const loginPageRes = await fetch(`${BASE}${LOGIN_PATH}`, { headers: BROWSER, redirect: 'manual' })
  const loginPageHtml = await loginPageRes.text()
  const csrfCookieVal = loginPageRes.headers.get('set-cookie')?.match(/\bcsrftoken=([^;,\s]+)/)?.[1] ?? ''
  const csrfMiddleware = loginPageHtml.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/)?.[1] ?? csrfCookieVal

  // Step 2: POST /login/ with credentials
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

  // Step 3: GET / — extract profile name from "My Games" nav link
  const homeRes = await fetch(`${BASE}${HOME_PATH}`, { headers: { ...BROWSER, Cookie: cookieHeader } })
  const homeHtml = await homeRes.text()
  const profileName = homeHtml.match(/href="(?:\/nd)?\/profile\/([^/"]+)\/"[^>]*>\s*My Games/)?.[1] ?? username

  return { cookieHeader, profileName }
}

async function getCachedSession(): Promise<OBGSession | null> {
  try {
    return await kv.get<OBGSession>(SESSION_KV_KEY)
  } catch {
    return null // KV unavailable — fall through to a fresh login
  }
}

async function cacheSession(session: OBGSession): Promise<void> {
  try {
    await kv.set(SESSION_KV_KEY, session, { ex: SESSION_TTL_SECONDS })
  } catch {
    // caching is best-effort; the connector still works without it
  }
}

// A session that's expired or been invalidated server-side still gets a 200
// back, just a login page (or a redirect to one) instead of the profile —
// gamesTable/"no current games" are the two markers every real profile page
// has, so their absence means the cookie no longer works.
function looksLoggedOut(html: string, finalUrl: string): boolean {
  return finalUrl.includes(LOGIN_PATH) || (!html.includes('gamesTable') && !/no current games/i.test(html))
}

async function fetchProfilePage(session: OBGSession): Promise<{ html: string; finalUrl: string }> {
  const res = await fetch(`${BASE}/profile/${session.profileName}/`, { headers: { ...BROWSER, Cookie: session.cookieHeader } })
  return { html: await res.text(), finalUrl: res.url ?? '' }
}

// Shared by fetchOBG and fetchFinishedOBG — both just parse different
// tables out of the same profile page, so there's no reason to log in or
// fetch it twice.
async function fetchOBGProfileHtml(username: string, password: string): Promise<{ html: string; profileName: string }> {
  let session = await getCachedSession()
  if (!session) {
    session = await loginOBG(username, password)
    await cacheSession(session)
  }

  let { html, finalUrl } = await fetchProfilePage(session)

  if (looksLoggedOut(html, finalUrl)) {
    session = await loginOBG(username, password)
    await cacheSession(session)
    ;({ html, finalUrl } = await fetchProfilePage(session))
  }

  return { html, profileName: session.profileName }
}

export async function fetchOBG(username: string, password: string): Promise<Game[]> {
  const { html, profileName } = await fetchOBGProfileHtml(username, password)
  return parseGames(html, profileName)
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

// Historically the site nested game-type-coded links under "/nd/" (e.g.
// "/nd/FCM/101/show/" instead of "/FCM/101/show/") during a since-reverted
// redesign — strip that prefix before reading the code in case it reappears.
function extractTypeCode(href: string): string {
  return href.replace(/^\/nd(?=\/)/, '').match(/^\/([A-Z]+)\//)?.[1] ?? ''
}

// The name cell shows either the plain game type name, or a player-set custom
// table title in its place — sometimes bracket-wrapped ("[Foo's Game]"),
// sometimes not (just "Dycu", replacing the type name entirely with no
// indication of the actual game). Detect a custom title either way and always
// prefix it with the real game type so the dashboard shows which game it is.
function gameTypeName(href: string): string {
  const typeCode = extractTypeCode(href)
  return OBG_GAME_NAMES[typeCode] ?? typeCode
}

function buildGameName(rawName: string, href: string): string {
  const typeName = gameTypeName(href)
  const customTitle = rawName.match(/^\[(.+)\]$/)?.[1] ?? (rawName && rawName !== typeName ? rawName : undefined)
  if (customTitle) return typeName ? `${typeName} — ${customTitle}` : customTitle
  return typeName || rawName || 'Unknown'
}

function parseGames(html: string, profileName: string): Game[] {
  const $ = cheerio.load(html)
  const games: Game[] = []

  // Profile page may render a "Current Games" table and/or a "Finished
  // Games" table (tagged with the finished-games-table modifier class) — or
  // no current-games table at all when the player has none ("No Current
  // Games" text, nothing else). Never assume the first gamesTable is the
  // current one: when there are zero current games, the finished table is
  // the *only* gamesTable present, and blindly taking .first() reports every
  // finished game as active. Explicitly exclude the finished table instead.
  const $currentTable = $('table.gamesTable')
    .filter((_: number, el: any) => !$(el).hasClass('finished-games-table'))
    .first()

  // OBG has changed this markup several times, each time silently breaking the
  // parser — so a page whose shape doesn't match is an error, not "no games"
  if ($currentTable.length === 0 && !/no current games/i.test(html)) {
    throw new Error('OBG: no current-games table and no "No Current Games" text, so the profile page layout has changed')
  }
  const $rows = $currentTable.find('tr.clickableGameRow')
  if ($currentTable.length > 0 && $rows.length === 0) {
    throw new Error('OBG: current-games table has no tr.clickableGameRow rows, so the table markup has changed')
  }
  if ($rows.length > 0 && $rows.find('td.col-status').length === 0) {
    throw new Error('OBG: game rows have no td.col-status cell, so the table markup has changed')
  }

  $rows.each((_: number, el: any) => {
    const $tr = $(el)

    // Game ID from tr id: "AQYgamesRow28424" → "28424"
    const gameId = ($tr.attr('id') ?? '').match(/gamesRow(\d+)/)?.[1]
    if (!gameId) return

    // Game URL and name from the name cell anchor
    const $nameAnchor = $tr.find('td.col-game a').first()
    const href = $nameAnchor.attr('href') ?? ''
    const gameUrl = BASE + href
    const rawName = $nameAnchor.text().trim()
    const gameName = buildGameName(rawName, href)

    // The status cell names whoever needs to act next, so compare it to our
    // own profile name. Numeric values (e.g. "5") indicate simultaneous-move
    // games with N players pending.
    const statusText = $tr.find('td.col-status').text().trim()
    const isSimultaneous = /^\d+$/.test(statusText)
    const isMyTurn = !isSimultaneous && statusText.toLowerCase() === profileName.toLowerCase()
    const currentPlayer = isMyTurn || isSimultaneous ? undefined : (statusText || undefined)

    // All players as profile links — exclude self
    const allPlayers = $tr.find('td.col-players a').map((_: number, a: any) => $(a).text().trim()).get() as string[]
    const players = allPlayers.filter((p: string) => p && p !== profileName)

    // Last turn: timeToConvertSpan holds Unix ms timestamp
    const tsText = $tr.find('.timeToConvertSpan').first().text().trim()
    const lastMoveAt = tsText ? new Date(parseInt(tsText)) : new Date()

    games.push({
      id: `obg:${gameId}`,
      platform: 'obg',
      gameName,
      gameType: gameTypeName(href) || undefined,
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

  if (games.length < $rows.length) {
    throw new Error(`OBG: parsed ${games.length} of ${$rows.length} game rows, so the row markup has changed`)
  }
  return games
}

function parseFinishedGames(html: string): FinishedGame[] {
  const $ = cheerio.load(html)
  // The finished table is explicitly tagged with the finished-games-table
  // modifier class — select it directly rather than assuming table position,
  // since it's the *only* gamesTable on the page whenever the player has no
  // current games (see parseGames).
  const $table = $('table.gamesTable.finished-games-table').first()
  const games: FinishedGame[] = []

  $table.find('tr.clickableGameRow').each((_: number, el: any) => {
    const $tr = $(el)
    const gameId = ($tr.attr('id') ?? '').match(/gamesRow(\d+)/)?.[1]
    if (!gameId) return

    const $nameAnchor = $tr.find('td.col-game a').first()
    const href = $nameAnchor.attr('href') ?? ''
    const gameUrl = BASE + href
    const rawName = $nameAnchor.text().trim()
    const gameName = buildGameName(rawName, href)

    const tsText = $tr.find('.timeToConvertSpan').first().text().trim()
    const completedAt = tsText ? new Date(parseInt(tsText)) : new Date()

    games.push({
      id: `obg:${gameId}`,
      platform: 'obg',
      gameName,
      gameType: gameTypeName(href) || undefined,
      completedAt,
      completedAgo: formatTimeAgo(completedAt),
      gameUrl,
    })
  })

  return games
}

export async function fetchFinishedOBG(username: string, password: string): Promise<FinishedGame[]> {
  const { html } = await fetchOBGProfileHtml(username, password)
  return parseFinishedGames(html)
}
