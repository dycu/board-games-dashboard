import * as cheerio from 'cheerio/slim'

export const runtime = 'edge'

const BASE = 'https://www.onlineboardgamers.com'
const LOGIN_PATH = '/login/'

const BROWSER = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

async function login(username: string, password: string) {
  const loginPageRes = await fetch(`${BASE}${LOGIN_PATH}`, { headers: BROWSER, redirect: 'manual' })
  const loginPageHtml = await loginPageRes.text()
  const csrfCookieVal = loginPageRes.headers.get('set-cookie')?.match(/\bcsrftoken=([^;,\s]+)/)?.[1] ?? ''
  const csrfMiddleware = loginPageHtml.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/)?.[1] ?? csrfCookieVal

  const loginRes = await fetch(`${BASE}${LOGIN_PATH}`, {
    method: 'POST',
    headers: { ...BROWSER, 'Content-Type': 'application/x-www-form-urlencoded', Referer: `${BASE}${LOGIN_PATH}`, Origin: BASE, Cookie: `csrftoken=${csrfCookieVal}` },
    body: new URLSearchParams({ csrfmiddlewaretoken: csrfMiddleware, username, password, next: '' }),
    redirect: 'manual',
  })
  const loginSetCookie = loginRes.headers.get('set-cookie') ?? ''
  const sessionidMatch = loginSetCookie.match(/\bsessionid=([^;,\s]+)/)
  const newCsrf = loginSetCookie.match(/\bcsrftoken=([^;,\s]+)/)?.[1] ?? csrfCookieVal
  return [`csrftoken=${newCsrf}`, ...(sessionidMatch ? [`sessionid=${sessionidMatch[1]}`] : [])].join('; ')
}

export async function GET(req: Request) {
  const url = process.env.OBG_USERNAME
  const pw = process.env.OBG_PASSWORD
  if (!url || !pw) return new Response('missing creds', { status: 500 })
  const cookieHeader = await login(url, pw)

  const homeRes = await fetch(`${BASE}/`, { headers: { ...BROWSER, Cookie: cookieHeader } })
  const homeHtml = await homeRes.text()
  const profileName = homeHtml.match(/href="(?:\/nd)?\/profile\/([^/"]+)\/"[^>]*>\s*My Games/)?.[1] ?? url

  const profileRes = await fetch(`${BASE}/profile/${profileName}/`, { headers: { ...BROWSER, Cookie: cookieHeader } })
  const profileHtml = await profileRes.text()
  const $ = cheerio.load(profileHtml)
  const { searchParams } = new URL(req.url)
  const wantFinished = searchParams.get('finished') === '1'
  const $table = wantFinished
    ? $('table.gamesTable.finished-games-table').first()
    : $('table.gamesTable').filter((_: number, el: any) => !$(el).hasClass('finished-games-table')).first()
  const href = $table.find('tr.clickableGameRow td.col-game a').first().attr('href')
  if (!href) return new Response(JSON.stringify({ error: 'no game found', wantFinished, profileName, tables: $('table.gamesTable').length }), { headers: { 'Content-Type': 'application/json' } })

  const gameRes = await fetch(`${BASE}${href}`, { headers: { ...BROWSER, Cookie: cookieHeader } })
  const gameHtml = await gameRes.text()

  if (searchParams.get('raw') === '1') {
    return new Response(gameHtml, { headers: { 'Content-Type': 'text/html' } })
  }

  // Grep for anything turn/round-like
  const matches = [...gameHtml.matchAll(/.{0,30}\b(turn|round|move)\b.{0,30}/gi)].map(m => m[0].replace(/\s+/g, ' ').trim())
  return new Response(JSON.stringify({ href, gameUrl: `${BASE}${href}`, htmlLength: gameHtml.length, matches: matches.slice(0, 60) }, null, 2), { headers: { 'Content-Type': 'application/json' } })
}
