#!/usr/bin/env node
// BGA endpoint investigation script
// Usage: BGA_USERNAME=... BGA_PASSWORD=... node scripts/investigate-bga.mjs

const BASE = 'https://boardgamearena.com'
const username = process.env.BGA_USERNAME
const password = process.env.BGA_PASSWORD

if (!username || !password) {
  console.error('Set BGA_USERNAME and BGA_PASSWORD env vars')
  process.exit(1)
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
}

function parseCookies(headers) {
  const cookies = {}
  const setCookieList = headers.getSetCookie?.() ?? (headers.get('set-cookie') ? [headers.get('set-cookie')] : [])
  for (const raw of setCookieList) {
    const [kv] = raw.split(';')
    const eq = kv.indexOf('=')
    if (eq > 0) cookies[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim()
  }
  return cookies
}

function cookieString(cookies) {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
}

function extractRequestToken(html) {
  const m = html.match(/g_requestToken\s*[=:]\s*['"]([a-f0-9]{32,64})['"]/i)
           ?? html.match(/['"]request_token['"]\s*[=:]\s*['"]([a-f0-9]{32,64})['"]/i)
           ?? html.match(/name=['"]request_token['"][^>]*value=['"]([a-f0-9]{32,64})['"]/i)
           ?? html.match(/\brequestToken['"\s:=,]+([a-f0-9]{64})\b/i)
           ?? html.match(/\brequest_token['"\s:=,]+([a-f0-9]{64})\b/i)
  return m ? m[m.length - 1] : ''
}

async function login() {
  console.log('--- Step 1: init + redirect ---')
  const initRes = await fetch(`${BASE}/account`, {
    redirect: 'manual',
    headers: { ...BROWSER_HEADERS, Accept: 'text/html,application/xhtml+xml,*/*' },
  })
  let cookies = parseCookies(initRes.headers)
  let loginBase = BASE

  if (initRes.status >= 300 && initRes.status < 400) {
    const location = initRes.headers.get('location') ?? ''
    if (location) {
      const redirectUrl = new URL(location.startsWith('http') ? location : `${BASE}${location}`)
      loginBase = redirectUrl.origin
      const followRes = await fetch(redirectUrl.href, {
        redirect: 'manual',
        headers: { ...BROWSER_HEADERS, Accept: 'text/html,application/xhtml+xml,*/*', Cookie: cookieString(cookies) },
      })
      cookies = { ...cookies, ...parseCookies(followRes.headers) }
      console.log(`  Redirected to ${loginBase}`)
    }
  }

  console.log('--- Step 2: login page for request_token ---')
  const loginPageRes = await fetch(`${loginBase}/?page=login`, {
    headers: { ...BROWSER_HEADERS, Accept: 'text/html,application/xhtml+xml,*/*', Cookie: cookieString(cookies) },
  })
  cookies = { ...cookies, ...parseCookies(loginPageRes.headers) }
  const loginPageHtml = await loginPageRes.text()
  const requestToken = extractRequestToken(loginPageHtml)
  if (!requestToken) {
    const hexFound = [...loginPageHtml.matchAll(/[a-f0-9]{48,64}/gi)].map(m => m[0]).slice(0, 5)
    throw new Error(`Could not extract request_token. Hex strings: [${hexFound.join(', ') || 'none'}]`)
  }
  console.log(`  request_token: ${requestToken.slice(0, 8)}...`)

  console.log('--- Step 3: POST login ---')
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
  let loginData
  try { loginData = JSON.parse(loginText) } catch { throw new Error(`Login HTTP ${loginRes.status}: ${loginText.slice(0, 300)}`) }
  if (loginData.status !== 1) throw new Error(`Login failed: ${loginData.error ?? JSON.stringify(loginData)}`)

  const allCookies = { ...cookies, ...parseCookies(loginRes.headers) }
  const myId = String(loginData.data?.id ?? '')
  const postLoginToken = allCookies['TournoiEnLigneidt'] ?? allCookies['TournoiEnLigneid'] ?? ''
  console.log(`  Logged in! myId=${myId} token=${postLoginToken}`)
  console.log(`  All cookie keys: ${Object.keys(allCookies).join(', ')}`)

  return { allCookies, myId, postLoginToken }
}

async function probe(method, url, body, cookies, token) {
  const headers = {
    ...BROWSER_HEADERS,
    Accept: 'application/json, */*',
    'X-Requested-With': 'XMLHttpRequest',
    'X-Request-Token': token,
    Origin: BASE,
    Referer: `${BASE}/gameinprogress`,
    Cookie: cookieString(cookies),
    ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' } : {}),
  }
  const res = await fetch(url, { method, headers, ...(body ? { body } : {}) })
  const text = await res.text()
  let parsed = null
  try { parsed = JSON.parse(text) } catch {}
  return { status: res.status, text, parsed }
}

async function main() {
  const { allCookies, myId, postLoginToken } = await login()

  console.log('\n=== PROBING ENDPOINTS ===\n')

  const endpoints = [
    // From user's browser curl — the key candidate
    { label: 'tablemanager/tableinfos ALL open', method: 'POST', url: `${BASE}/tablemanager/tablemanager/tableinfos.html`, body: 'status=open&turninfo=true&matchmakingtables=true' },
    // Same but with specific game filter removed — might return all games
    { label: 'tablemanager/tableinfos page1', method: 'POST', url: `${BASE}/tablemanager/tablemanager/tableinfos.html`, body: 'status=open&turninfo=true&matchmakingtables=true&start=0&nbmax=50' },
    // Maybe there's a dedicated "my tables" endpoint
    { label: 'tablemanager/getMytables', method: 'POST', url: `${BASE}/tablemanager/tablemanager/getMytables.html`, body: 'status=open' },
    { label: 'tablemanager/myactivetables', method: 'POST', url: `${BASE}/tablemanager/tablemanager/myactivetables.html`, body: '' },
    // Player-based endpoints
    { label: 'player/getactivetables POST', method: 'POST', url: `${BASE}/player/player/getactivetables.html`, body: 'status=open' },
    { label: 'player/getactivetables GET', method: 'GET', url: `${BASE}/player/player/getactivetables.html?status=open&ajax=1`, body: null },
    { label: 'player/index', method: 'GET', url: `${BASE}/player/player/index.html?id=${myId}&ajax=1`, body: null },
    // gameinprogress-based
    { label: 'gameinprogress/getGameList', method: 'POST', url: `${BASE}/gameinprogress/gameinprogress/getGameList.html`, body: '' },
    { label: 'gameinprogress/index', method: 'POST', url: `${BASE}/gameinprogress/gameinprogress/index.html`, body: '' },
    // table-based
    { label: 'table/getMytables', method: 'POST', url: `${BASE}/table/table/getMytables.html`, body: 'status=open' },
  ]

  for (const { label, method, url, body } of endpoints) {
    const { status, text, parsed } = await probe(method, url, body, allCookies, postLoginToken)
    const preview = text.slice(0, 200).replace(/\s+/g, ' ')
    console.log(`\n[${label}] ${method} → HTTP ${status}`)
    if (parsed !== null) {
      if (parsed.status === 1 && parsed.data) {
        const keys = Object.keys(parsed.data)
        console.log(`  ✓ JSON status=1, data keys: [${keys.join(', ')}]`)
        // If there are tables, dump the first one
        const tables = parsed.data.tables ?? parsed.data.table ?? parsed.tables
        if (Array.isArray(tables)) {
          console.log(`  ✓ TABLES ARRAY found! Length=${tables.length}`)
          if (tables.length > 0) {
            console.log(`  First table keys: ${Object.keys(tables[0]).join(', ')}`)
            console.log(`  First table sample:`, JSON.stringify(tables[0]).slice(0, 400))
          }
        } else {
          console.log(`  JSON preview:`, JSON.stringify(parsed).slice(0, 300))
        }
      } else {
        console.log(`  JSON:`, JSON.stringify(parsed).slice(0, 300))
      }
    } else {
      console.log(`  Raw:`, preview)
    }
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
