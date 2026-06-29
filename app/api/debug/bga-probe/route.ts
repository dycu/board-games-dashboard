import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BASE = 'https://boardgamearena.com'
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
}

function parseCookies(headers: Headers): Record<string, string> {
  const cookies: Record<string, string> = {}
  const list = headers.getSetCookie?.() ?? (headers.get('set-cookie') ? [headers.get('set-cookie')!] : [])
  for (const raw of list) {
    const [kv] = raw.split(';')
    const eq = kv.indexOf('=')
    if (eq > 0) cookies[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim()
  }
  return cookies
}

function cookieString(c: Record<string, string>) {
  return Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; ')
}

function extractRequestToken(html: string): string {
  const m = html.match(/g_requestToken\s*[=:]\s*['"]([a-f0-9]{32,64})['"]/i)
           ?? html.match(/['"]request_token['"]\s*[=:]\s*['"]([a-f0-9]{32,64})['"]/i)
           ?? html.match(/name=['"]request_token['"][^>]*value=['"]([a-f0-9]{32,64})['"]/i)
           ?? html.match(/\brequestToken['"\s:=,]+([a-f0-9]{64})\b/i)
           ?? html.match(/\brequest_token['"\s:=,]+([a-f0-9]{64})\b/i)
  return m ? m[m.length - 1] : ''
}

export async function GET() {
  const username = process.env.BGA_USERNAME
  const password = process.env.BGA_PASSWORD
  if (!username || !password) {
    return NextResponse.json({ error: 'BGA_USERNAME / BGA_PASSWORD not set' }, { status: 500 })
  }

  const log: string[] = []

  try {
    // Step 1
    const initRes = await fetch(`${BASE}/account`, { redirect: 'manual', headers: { ...BROWSER_HEADERS, Accept: 'text/html,*/*' } })
    let cookies = parseCookies(initRes.headers)
    let loginBase = BASE
    if (initRes.status >= 300 && initRes.status < 400) {
      const location = initRes.headers.get('location') ?? ''
      if (location) {
        const url = new URL(location.startsWith('http') ? location : `${BASE}${location}`)
        loginBase = url.origin
        const followRes = await fetch(url.href, { redirect: 'manual', headers: { ...BROWSER_HEADERS, Accept: 'text/html,*/*', Cookie: cookieString(cookies) } })
        cookies = { ...cookies, ...parseCookies(followRes.headers) }
      }
    }
    log.push(`loginBase: ${loginBase}`)

    // Step 2
    const loginPageRes = await fetch(`${loginBase}/?page=login`, { headers: { ...BROWSER_HEADERS, Accept: 'text/html,*/*', Cookie: cookieString(cookies) } })
    cookies = { ...cookies, ...parseCookies(loginPageRes.headers) }
    const loginPageHtml = await loginPageRes.text()
    const requestToken = extractRequestToken(loginPageHtml)
    if (!requestToken) {
      const hex = [...loginPageHtml.matchAll(/[a-f0-9]{48,64}/gi)].map(m => m[0]).slice(0, 5)
      return NextResponse.json({ error: 'no request_token', hex }, { status: 500 })
    }
    log.push(`request_token: ${requestToken.slice(0, 8)}...`)

    // Step 3
    const loginRes = await fetch(`${loginBase}/account/auth/loginUserWithPassword.html`, {
      method: 'POST',
      headers: {
        ...BROWSER_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        Accept: '*/*',
        'X-Requested-With': 'XMLHttpRequest',
        'X-Request-Token': requestToken,
        Origin: loginBase,
        Referer: `${loginBase}/?step=2&page=login`,
        Cookie: cookieString(cookies),
      },
      body: new URLSearchParams({ username, password, remember_me: 'true', request_token: requestToken }),
    })
    const loginText = await loginRes.text()
    let loginData: any
    try { loginData = JSON.parse(loginText) } catch { return NextResponse.json({ error: `login HTTP ${loginRes.status}`, body: loginText.slice(0, 300) }, { status: 500 }) }
    if (loginData.status !== 1) return NextResponse.json({ error: 'login failed', details: loginData }, { status: 500 })

    const allCookies = { ...cookies, ...parseCookies(loginRes.headers) }
    // Dump full login data to find where myId lives
    const loginDataKeys = Object.keys(loginData.data ?? {})
    const myId = String(loginData.data?.id ?? loginData.data?.player_id ?? loginData.data?.user_id ?? '')
    const postLoginToken = allCookies['TournoiEnLigneidt'] ?? allCookies['TournoiEnLigneid'] ?? ''
    log.push(`myId: ${myId}, postLoginToken: ${postLoginToken}`)
    log.push(`loginData.data keys: ${loginDataKeys.join(', ')}`)
    log.push(`loginData.data sample: ${JSON.stringify(loginData.data).slice(0, 300)}`)

    if (!postLoginToken) {
      return NextResponse.json({ error: 'no post-login token', cookieKeys: Object.keys(allCookies), log }, { status: 500 })
    }

    // Step 4: probe — focus on in-progress game statuses, not lobby
    const authHeaders = {
      ...BROWSER_HEADERS,
      Accept: 'application/json, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Request-Token': postLoginToken,
      Origin: BASE,
      Referer: `${BASE}/gameinprogress`,
      Cookie: cookieString(allCookies),
    }

    const tablesRes = await fetch(`${BASE}/tablemanager/tablemanager/tableinfos.html`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: 'status=play&turninfo=true',
    })
    const tablesJson = await tablesRes.json().catch(() => null)

    // Top-level keys in data (looking for anything beyond 'tables')
    const dataKeys = Object.keys(tablesJson?.data ?? {})

    // Keys on a single table object
    const allTables: any[] = tablesJson?.data?.tables ? Object.values(tablesJson.data.tables) : []
    const tableKeys = allTables[0] ? Object.keys(allTables[0]) : []

    // All name/title/display/label fields across first 5 tables
    const nameSample = allTables.slice(0, 5).map((t: any) => ({
      game_name: t.game_name,
      game_id: t.game_id,
      ...Object.fromEntries(
        Object.entries(t).filter(([k]) =>
          k.includes('name') || k.includes('title') || k.includes('display') || k.includes('label')
        )
      ),
    }))

    // Also try BGA's gamelist endpoint to see if it returns display names
    const gamelistRes = await fetch(`${BASE}/gamelist/gamelist/gamelist.html`, {
      headers: { ...authHeaders },
    }).catch(() => null)
    const gamelistText = gamelistRes ? await gamelistRes.text().catch(() => '') : ''
    const gamelistPreview = gamelistText.slice(0, 500)

    // Test gamepanel fetches for all unique slugs — report failures
    const OG_RE = /content="Play ([^"]+?) online from your browser"/i
    const allSlugs = [...new Set(allTables.map((t: any) => t.game_name as string).filter(Boolean))]
    const slugToGameId = Object.fromEntries(allTables.map((t: any) => [t.game_name, t.game_id]))
    const gamepanelDiag = await Promise.all(allSlugs.map(async (slug) => {
      const headers: Record<string, string> = { ...BROWSER_HEADERS }
      try {
        const r = await fetch(`https://en.boardgamearena.com/gamepanel?game=${slug}`, { headers })
        const html = await r.text()
        const m = html.match(OG_RE)
        // On failure show more HTML (2000 chars) to find where the game name might be
        return { slug, game_id: slugToGameId[slug], status: r.status, ok: r.ok, matched: !!m, name: m?.[1] ?? null, htmlPreview: m ? null : html.slice(0, 2000) }
      } catch (e) {
        return { slug, game_id: slugToGameId[slug], error: String(e) }
      }
    }))

    // Try a few BGA API patterns for game info by game_id
    const sampleGameId = allTables[0]?.game_id
    const gameIdApiResults: Record<string, any> = {}
    if (sampleGameId) {
      const slug = allTables[0]?.game_name
      for (const [label, url] of [
        ['gamepanel_gameInfos', `${BASE}/gamepanel/gamepanel/gameInfos.html?game=${slug}`],
        ['gamepanel_gameInfos_id', `${BASE}/gamepanel/gamepanel/gameInfos.html?id=${sampleGameId}`],
        ['gameinfos_byid', `${BASE}/gameinfos/gameinfos/gameInfos.html?id=${sampleGameId}`],
        ['gamelist_gameinfos', `${BASE}/gamelist/gamelist/gameInfos.html?game=${slug}`],
      ] as [string, string][]) {
        try {
          const r = await fetch(url, { headers: { ...authHeaders } })
          const text = await r.text()
          let parsed: any = null
          try { parsed = JSON.parse(text) } catch {}
          gameIdApiResults[label] = { status: r.status, isJson: !!parsed, preview: parsed ? JSON.stringify(parsed).slice(0, 300) : text.slice(0, 300) }
        } catch (e) {
          gameIdApiResults[label] = { error: String(e) }
        }
      }
    }

    return NextResponse.json({ dataKeys, tableKeys, nameSample, gamelistPreview, gamepanelDiag, gameIdApiResults })
  } catch (e) {
    return NextResponse.json({ error: String(e), log }, { status: 500 })
  }
}
