# Overview Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/overview` page that shows recently finished games from all connected services, accessible via a button in the dashboard header next to Settings and Refresh.

**Architecture:** New `FinishedGame` type + per-connector `fetchFinished*` functions → `makeFinishedConnectors()` in `lib/connectors/index.ts` → `/api/finished-games` SSE edge route (with `/api/choochoo-finished` Node.js proxy) → `useFinishedGamesData` hook → `app/overview/page.tsx` using `FinishedGameCard` components. Platforms that don't expose history are skipped gracefully.

**Tech Stack:** Next.js 16.2.9, React 19, TypeScript, Tailwind CSS v4, Jest 30, cheerio/slim, same SSE pattern as `/api/games`.

## Global Constraints

- Edge runtime (`export const runtime = 'edge'`) on `/api/finished-games`. Choochoo proxied through Node.js `/api/choochoo-finished` (same reason as `/api/choochoo` — uses `rejectUnauthorized: false`).
- Tests use Jest with `global.fetch = jest.fn()` — no network calls in tests.
- All new connector functions return `FinishedGame[]` (not `Game[]`).
- `completedAgo` is always pre-formatted via `formatTimeAgo` from `lib/connectors/utils.ts`.
- TDD: write the failing test first, then implement.
- Commit after each task.
- Platforms implemented: 18xx.games (certain), OBG (certain), BGA (likely), Rally (likely), Choochoo (likely). Yucata and Hansa skipped.

---

### Task 1: Add FinishedGame types

**Files:**
- Modify: `lib/types.ts`

**Interfaces:**
- Produces: `FinishedGame`, `FinishedGamesApiResponse` — used by every subsequent task.

- [ ] **Step 1: Add types to `lib/types.ts`**

Add after the existing `GamesApiResponse` interface:

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add FinishedGame and FinishedGamesApiResponse types"
```

---

### Task 2: fetchFinishedEighteenXX

**Files:**
- Modify: `lib/connectors/eighteenxx.ts`
- Test: `__tests__/lib/connectors/eighteenxx-finished.test.ts`

**Interfaces:**
- Consumes: `FinishedGame` from `lib/types.ts`, `formatTimeAgo` from `./utils`, fixture `__fixtures__/eighteenxx-games.json` (already has `{id:333, status:'finished', updated_at:'2026-06-01T00:00:00Z', title:'Finished Game', players:[{id:1,name:'testuser'}]}`).
- Produces: `fetchFinishedEighteenXX(username, password): Promise<FinishedGame[]>` — same login flow, filter games where `g.status !== 'active'`, use `updated_at` as `completedAt`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/connectors/eighteenxx-finished.test.ts`:

```typescript
import { fetchFinishedEighteenXX } from '@/lib/connectors/eighteenxx'
import fixture from '@/__fixtures__/eighteenxx-games.json'

const mockFetch = jest.fn()
global.fetch = mockFetch

describe('fetchFinishedEighteenXX', () => {
  beforeEach(() => mockFetch.mockClear())

  it('returns only finished games', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => '_18xx_session=xyz; Path=/' },
        json: async () => ({ user: { id: 1, name: 'testuser' } }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const games = await fetchFinishedEighteenXX('testuser', 'pass')
    expect(games).toHaveLength(1)
    expect(games[0]).toMatchObject({
      id: 'eighteenxx:333',
      platform: 'eighteenxx',
      gameName: 'Finished Game',
      gameUrl: 'https://18xx.games/game/333',
      completedAgo: expect.any(String),
    })
    expect(games[0].completedAt).toBeInstanceOf(Date)
  })

  it('returns empty array when no finished games', async () => {
    const activeOnly = fixture.filter((g: any) => g.status === 'active')
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => '_18xx_session=xyz; Path=/' },
        json: async () => ({ user: { id: 1, name: 'testuser' } }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => activeOnly })

    const games = await fetchFinishedEighteenXX('testuser', 'pass')
    expect(games).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/lib/connectors/eighteenxx-finished.test.ts --no-coverage
```

Expected: FAIL — `fetchFinishedEighteenXX` not exported.

- [ ] **Step 3: Add `fetchFinishedEighteenXX` to `lib/connectors/eighteenxx.ts`**

Add after the existing `fetchEighteenXX` function:

```typescript
export async function fetchFinishedEighteenXX(username: string, password: string): Promise<FinishedGame[]> {
  const loginRes = await fetch(`${BASE}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: username, password }),
  })
  if (!loginRes.ok) throw new Error('18xx.games login failed')

  const loginData = await loginRes.json()
  const myId: number = loginData.user?.id
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''

  const gamesRes = await fetch(`${BASE}/api/game/user`, {
    headers: { Cookie: cookie, Accept: 'application/json' },
  })
  if (!gamesRes.ok) throw new Error('18xx.games games fetch failed')

  const data = await gamesRes.json()
  const games: any[] = Array.isArray(data) ? data : data.games ?? []

  return games
    .filter((g: any) => g.status !== 'active' && (g.players ?? []).some((p: any) => p.id === myId))
    .map((g: any): FinishedGame => {
      const rawTime = g.updated_at ?? g.created_at
      const completedAt = typeof rawTime === 'number' ? new Date(rawTime * 1000) : new Date(rawTime)
      return {
        id: `eighteenxx:${g.id}`,
        platform: 'eighteenxx',
        gameName: g.title ?? 'Unknown',
        completedAt,
        completedAgo: formatTimeAgo(completedAt),
        gameUrl: `${BASE}/game/${g.id}`,
      }
    })
}
```

Also add `FinishedGame` to the import at the top of `eighteenxx.ts`:

```typescript
import { Game, FinishedGame } from '../types'
```

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/lib/connectors/eighteenxx-finished.test.ts --no-coverage
```

Expected: PASS (2 tests).

- [ ] **Step 5: Run full suite to check regressions**

```bash
npx jest --no-coverage
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add lib/connectors/eighteenxx.ts __tests__/lib/connectors/eighteenxx-finished.test.ts
git commit -m "feat: add fetchFinishedEighteenXX connector"
```

---

### Task 3: fetchFinishedOBG

**Files:**
- Modify: `lib/connectors/obg.ts`
- Modify: `__fixtures__/obg-games.html` (add Finished Games table)
- Test: `__tests__/lib/connectors/obg-finished.test.ts`

**Interfaces:**
- Consumes: `FinishedGame` from `lib/types.ts`, `formatTimeAgo` from `./utils`. OBG profile page already contains a second `table.gamesTable` for finished games — the existing connector only parses the first one. Reuses the full login+profile fetch from `fetchOBG`.
- Produces: `fetchFinishedOBG(username, password): Promise<FinishedGame[]>` — same 4-step login, parse second `table.gamesTable` on profile page.

- [ ] **Step 1: Update OBG fixture to include Finished Games section**

Open `__fixtures__/obg-games.html` and add after the closing `</table>` tag (before `</body>`):

```html
<h2>Finished Games (2)</h2>
<table class="gamesTable">
  <thead>
    <tr class="headingRow">
      <td class="nameHeaderCurrent">Name</td>
      <td class="currentPlayersHeader">Players</td>
      <td class="lastActivityHeader">Ended</td>
    </tr>
  </thead>
  <tbody>
    <tr class="clickableGameRow " id="FCMgamesRow301" onclick="window.location.href='/FCM/301/show/';">
      <td class="nameTDcurrent tdWithBox">
        <a href="/FCM/301/show/">[Finished Match]</a>
      </td>
      <td>
        <a href="/profile/testuser/">testuser</a>,
        <a href="/profile/carol/">carol</a>
      </td>
      <td>
        <span class="timeToConvertSpan">1748736000000</span>
        <br/>3 days ago
      </td>
    </tr>
    <tr class="clickableGameRow " id="AQYgamesRow302" onclick="window.location.href='/AQY/302/show/';">
      <td class="nameTDcurrent tdWithBox">
        <a href="/AQY/302/show/">Antiquity</a>
      </td>
      <td>
        <a href="/profile/testuser/">testuser</a>,
        <a href="/profile/dave/">dave</a>
      </td>
      <td>
        <span class="timeToConvertSpan">1748649600000</span>
        <br/>4 days ago
      </td>
    </tr>
  </tbody>
</table>
```

- [ ] **Step 2: Write the failing test**

Create `__tests__/lib/connectors/obg-finished.test.ts`:

```typescript
import { fetchFinishedOBG } from '@/lib/connectors/obg'
import { readFileSync } from 'fs'
import { join } from 'path'

const mockFetch = jest.fn()
global.fetch = mockFetch
const fixture = readFileSync(join(__dirname, '../../../__fixtures__/obg-games.html'), 'utf8')

const HOME_HTML = `<html><body>
  <a class="topBarLink" href="/profile/testuser/">My Games</a>
</body></html>`

function makeLoginPageResponse() {
  return {
    ok: true, status: 200,
    text: async () => '<form><input type="hidden" name="csrfmiddlewaretoken" value="formcsrf123"></form>',
    headers: { get: (h: string) => h === 'set-cookie' ? 'csrftoken=cookiecsrf123; Path=/' : null },
  }
}

function makeLoginSuccessResponse() {
  return {
    ok: false, status: 302,
    headers: { get: (h: string) => {
      if (h === 'set-cookie') return 'sessionid=sess456; Path=/; csrftoken=newcsrf; Path=/'
      if (h === 'location') return '/'
      return null
    }},
  }
}

describe('fetchFinishedOBG', () => {
  beforeEach(() => mockFetch.mockClear())

  it('returns FinishedGame[] from second gamesTable', async () => {
    mockFetch
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginSuccessResponse())
      .mockResolvedValueOnce({ ok: true, text: async () => HOME_HTML })
      .mockResolvedValueOnce({ ok: true, text: async () => fixture })

    const games = await fetchFinishedOBG('testuser', 'pass')
    expect(games).toHaveLength(2)
    expect(games[0]).toMatchObject({
      id: 'obg:301',
      platform: 'obg',
      gameName: 'Food Chain Magnate — Finished Match',
      gameUrl: 'https://www.onlineboardgamers.com/FCM/301/show/',
      completedAgo: expect.any(String),
    })
    expect(games[0].completedAt).toBeInstanceOf(Date)
    expect(games[1].id).toBe('obg:302')
    expect(games[1].gameName).toBe('Antiquity')
  })

  it('returns empty array when no finished games table exists', async () => {
    const noFinished = fixture.split('<h2>Finished Games')[0] + '</body></html>'
    mockFetch
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginSuccessResponse())
      .mockResolvedValueOnce({ ok: true, text: async () => HOME_HTML })
      .mockResolvedValueOnce({ ok: true, text: async () => noFinished })

    const games = await fetchFinishedOBG('testuser', 'pass')
    expect(games).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx jest __tests__/lib/connectors/obg-finished.test.ts --no-coverage
```

Expected: FAIL — `fetchFinishedOBG` not exported.

- [ ] **Step 4: Add `fetchFinishedOBG` to `lib/connectors/obg.ts`**

Add `FinishedGame` to the import at the top:

```typescript
import { Game, FinishedGame } from '../types'
```

Add a new parse function and the exported function after the existing `fetchOBG`:

```typescript
function parseFinishedGames(html: string): FinishedGame[] {
  const $ = cheerio.load(html)
  const tables = $('table.gamesTable')
  // second table is Finished Games; if only one table, return empty
  if (tables.length < 2) return []
  const $table = tables.eq(1)
  const games: FinishedGame[] = []

  $table.find('tr.clickableGameRow').each((_: number, el: any) => {
    const $tr = $(el)
    const gameId = ($tr.attr('id') ?? '').match(/gamesRow(\d+)/)?.[1]
    if (!gameId) return

    const $nameAnchor = $tr.find('td').eq(0).find('a').first()
    const href = $nameAnchor.attr('href') ?? ''
    const gameUrl = BASE + href
    const rawName = $nameAnchor.text().trim()
    const customTitle = rawName.match(/^\[(.+)\]$/)?.[1]
    const typeCode = href.match(/^\/([A-Z]+)\//)?.[1] ?? ''
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
  const loginPageRes = await fetch(`${BASE}/login/`, { headers: BROWSER, redirect: 'manual' })
  const loginPageHtml = await loginPageRes.text()
  const csrfCookieVal = loginPageRes.headers.get('set-cookie')?.match(/\bcsrftoken=([^;,\s]+)/)?.[1] ?? ''
  const csrfMiddleware = loginPageHtml.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/)?.[1] ?? csrfCookieVal

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

  const homeRes = await fetch(`${BASE}/`, { headers: { ...BROWSER, Cookie: cookieHeader } })
  const homeHtml = await homeRes.text()
  const profileName = homeHtml.match(/href="\/profile\/([^/"]+)\/"[^>]*>\s*My Games/)?.[1] ?? username

  const profileRes = await fetch(`${BASE}/profile/${profileName}/`, {
    headers: { ...BROWSER, Cookie: cookieHeader },
  })
  const profileHtml = await profileRes.text()
  return parseFinishedGames(profileHtml)
}
```

- [ ] **Step 5: Run tests**

```bash
npx jest __tests__/lib/connectors/obg-finished.test.ts --no-coverage
```

Expected: PASS (2 tests).

- [ ] **Step 6: Run full suite**

```bash
npx jest --no-coverage
```

Expected: all passing.

- [ ] **Step 7: Commit**

```bash
git add lib/connectors/obg.ts __fixtures__/obg-games.html __tests__/lib/connectors/obg-finished.test.ts
git commit -m "feat: add fetchFinishedOBG connector and update OBG fixture"
```

---

### Task 4: fetchFinishedBGA

**Files:**
- Modify: `lib/connectors/bga.ts`
- Create: `__fixtures__/bga-finished.json`
- Test: `__tests__/lib/connectors/bga-finished.test.ts`

**Interfaces:**
- Consumes: `FinishedGame` from `lib/types.ts`. BGA's tablemanager accepts `status=done` to fetch completed games. Finished tables include `date_end` (Unix seconds). Reuses the full BGA login flow.
- Produces: `fetchFinishedBGA(username, password): Promise<FinishedGame[]>` — same 5-step login, then POSTs `status=done` to tablemanager, returns last 30 games sorted newest-first.

- [ ] **Step 1: Create `__fixtures__/bga-finished.json`**

```json
{
  "status": 1,
  "data": {
    "tables": {
      "55555": {
        "id": "55555",
        "game_name": "brass",
        "date_end": 1748736000,
        "gameserver": "en",
        "players": {
          "42": { "id": "42", "fullname": "testuser" },
          "99": { "id": "99", "fullname": "alice" }
        }
      },
      "66666": {
        "id": "66666",
        "game_name": "terraformingmars",
        "date_end": 1748649600,
        "gameserver": "en",
        "players": {
          "42": { "id": "42", "fullname": "testuser" },
          "77": { "id": "77", "fullname": "bob" }
        }
      }
    }
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `__tests__/lib/connectors/bga-finished.test.ts`:

```typescript
import { fetchFinishedBGA } from '@/lib/connectors/bga'
import fixture from '@/__fixtures__/bga-finished.json'

const mockFetch = jest.fn()
global.fetch = mockFetch

const TOKEN = 'a'.repeat(64)

function makeMockHeaders(cookies: string[], extra: Record<string, string> = {}): Headers {
  return {
    getSetCookie: () => cookies,
    get: (name: string) => {
      if (name === 'set-cookie') return cookies.join(', ') || null
      return extra[name.toLowerCase()] ?? null
    },
  } as unknown as Headers
}

function setupBGALogin(playerId = '42') {
  mockFetch
    // Step 1: init redirect
    .mockResolvedValueOnce({
      ok: true, status: 302,
      headers: makeMockHeaders(
        ['PHPSESSID=session123; Path=/; HttpOnly'],
        { location: 'https://en.boardgamearena.com/account' }
      ),
    })
    // Step 2: follow redirect
    .mockResolvedValueOnce({ ok: true, status: 200, headers: makeMockHeaders([]) })
    // Step 3: login page
    .mockResolvedValueOnce({
      ok: true, status: 200,
      text: async () => `<html><script>var request_token = '${TOKEN}'</script></html>`,
      headers: makeMockHeaders([]),
    })
    // Step 4: login POST
    .mockResolvedValueOnce({
      ok: true, status: 200,
      text: async () => JSON.stringify({
        status: 1,
        data: { user_id: playerId },
      }),
      headers: makeMockHeaders([`TournoiEnLigneidt=authtoken123; Path=/`]),
    })
}

describe('fetchFinishedBGA', () => {
  beforeEach(() => mockFetch.mockClear())

  it('returns FinishedGame[] from finished tables', async () => {
    setupBGALogin('42')
    // Step 5: tablemanager with status=done
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      text: async () => JSON.stringify(fixture),
      headers: makeMockHeaders([]),
    })

    const games = await fetchFinishedBGA('testuser', 'pass')
    expect(games.length).toBeGreaterThanOrEqual(1)
    const g = games.find(g => g.id === 'bga:55555')!
    expect(g).toMatchObject({
      platform: 'bga',
      gameName: 'brass',
      gameUrl: expect.stringContaining('55555'),
      completedAgo: expect.any(String),
    })
    expect(g.completedAt).toBeInstanceOf(Date)
  })

  it('returns empty array when no finished tables', async () => {
    setupBGALogin('42')
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      text: async () => JSON.stringify({ status: 1, data: { tables: {} } }),
      headers: makeMockHeaders([]),
    })

    const games = await fetchFinishedBGA('testuser', 'pass')
    expect(games).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx jest __tests__/lib/connectors/bga-finished.test.ts --no-coverage
```

Expected: FAIL — `fetchFinishedBGA` not exported.

- [ ] **Step 4: Add `fetchFinishedBGA` to `lib/connectors/bga.ts`**

Add `FinishedGame` to the import:

```typescript
import { Game, FinishedGame } from '../types'
```

Add after the existing `fetchBGA` function (reuses `parseCookies`, `cookieString`, `extractRequestToken`, `BROWSER_HEADERS` that are already in the file):

```typescript
export async function fetchFinishedBGA(username: string, password: string): Promise<FinishedGame[]> {
  // Steps 1-4: identical login flow as fetchBGA
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
    }
  }

  const loginPageRes = await fetch(`${loginBase}/?page=login`, {
    headers: { ...BROWSER_HEADERS, Accept: 'text/html,application/xhtml+xml,*/*', Cookie: cookieString(cookies) },
  })
  cookies = { ...cookies, ...parseCookies(loginPageRes.headers) }
  const loginPageHtml = await loginPageRes.text()
  const requestToken = extractRequestToken(loginPageHtml)
  if (!requestToken) throw new Error(`BGA: could not extract request_token`)

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
  try { loginData = JSON.parse(loginText) } catch {
    throw new Error(`BGA login HTTP ${loginRes.status}: ${loginText.slice(0, 300)}`)
  }
  if (loginData.status !== 1) throw new Error(`BGA login failed: ${loginData.error ?? JSON.stringify(loginData)}`)

  const allCookies = { ...cookies, ...parseCookies(loginRes.headers) }
  const postLoginToken = allCookies['TournoiEnLigneidt'] ?? allCookies['TournoiEnLigneid'] ?? ''
  if (!postLoginToken) throw new Error(`BGA: no request token in login response cookies`)

  // Step 5: fetch finished games
  const tablesRes = await fetch(`${BASE}/tablemanager/tablemanager/tableinfos.html`, {
    method: 'POST',
    headers: {
      ...BROWSER_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      Accept: 'application/json, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Request-Token': postLoginToken,
      Origin: BASE,
      Referer: `${BASE}/gameinprogress`,
      Cookie: cookieString(allCookies),
    },
    body: 'status=done',
  })

  const tablesText = await tablesRes.text()
  let tablesData: any
  try { tablesData = JSON.parse(tablesText) } catch {
    throw new Error(`BGA finished tables HTTP ${tablesRes.status}: ${tablesText.slice(0, 300)}`)
  }
  if (tablesData.status !== 1) throw new Error(`BGA finished tables failed: ${JSON.stringify(tablesData).slice(0, 200)}`)

  const rawTables: Record<string, any> = tablesData?.data?.tables ?? {}
  const tables = Object.values(rawTables)

  return tables.map((t: any): FinishedGame => {
    const dateEndSec = t.date_end != null ? parseInt(t.date_end) : null
    const completedAt = dateEndSec && !isNaN(dateEndSec)
      ? new Date(dateEndSec * 1000)
      : new Date()

    return {
      id: `bga:${t.id}`,
      platform: 'bga',
      gameName: t.game_name ?? 'Unknown',
      completedAt,
      completedAgo: formatTimeAgo(completedAt),
      gameUrl: `${BASE}/${t.gameserver ?? 'en'}/${t.game_name}?table=${t.id}`,
    }
  })
}
```

Note: We skip `fetchGameNames` for finished games — the BGA slug is used directly as `gameName` (acceptable trade-off given the number of finished games could be large).

- [ ] **Step 5: Run tests**

```bash
npx jest __tests__/lib/connectors/bga-finished.test.ts --no-coverage
```

Expected: PASS (2 tests).

- [ ] **Step 6: Run full suite**

```bash
npx jest --no-coverage
```

Expected: all passing.

- [ ] **Step 7: Commit**

```bash
git add lib/connectors/bga.ts __fixtures__/bga-finished.json __tests__/lib/connectors/bga-finished.test.ts
git commit -m "feat: add fetchFinishedBGA connector"
```

---

### Task 5: fetchFinishedRally

**Files:**
- Modify: `lib/connectors/rally.ts`
- Create: `__fixtures__/rally-finished.html`
- Test: `__tests__/lib/connectors/rally-finished.test.ts`

**Interfaces:**
- Consumes: `FinishedGame` from types, `formatTimeAgo` from utils. Rally has `/games/finished` page with the same HTML structure as `/games/active`. Reuses the `solveAltcha` + login flow and `parseHumanDate`/`extractSection` helpers already in `rally.ts`.
- Produces: `fetchFinishedRally(username, password): Promise<FinishedGame[]>`.

- [ ] **Step 1: Create `__fixtures__/rally-finished.html`**

```html
<!DOCTYPE html>
<html>
<body>
<h2>Finished</h2>
<div class="game_item">
  <a href="/join/501">Game #501 – Twilight Struggle</a>
  <div>Players: <a href="/user/testuser">testuser</a>, <a href="/user/carol">carol</a></div>
  <div>Last move: 3 days ago</div>
  <a class="command" href="/join/501">Watch</a>
</div>
<div class="game_item">
  <a href="/join/502">Game #502 – Paths of Glory</a>
  <div>Players: <a href="/user/testuser">testuser</a>, <a href="/user/dave">dave</a></div>
  <div>Last move: 7 days ago</div>
  <a class="command" href="/join/502">Watch</a>
</div>
</body>
</html>
```

- [ ] **Step 2: Write the failing test**

Create `__tests__/lib/connectors/rally-finished.test.ts`:

```typescript
import { fetchFinishedRally } from '@/lib/connectors/rally'
import { readFileSync } from 'fs'
import { join } from 'path'

const mockFetch = jest.fn()
global.fetch = mockFetch
const fixture = readFileSync(join(__dirname, '../../../__fixtures__/rally-finished.html'), 'utf8')

const CHALLENGE = {
  algorithm: 'SHA-256',
  challenge: '0'.repeat(64),
  maxnumber: 0,
  salt: '',
  signature: 'sig',
}

// Override crypto.subtle.digest to return the expected challenge immediately
const originalDigest = globalThis.crypto?.subtle?.digest?.bind(globalThis.crypto.subtle)
beforeAll(() => {
  if (globalThis.crypto?.subtle) {
    globalThis.crypto.subtle.digest = async () => new Uint8Array(32).buffer
  }
})
afterAll(() => {
  if (globalThis.crypto?.subtle && originalDigest) {
    globalThis.crypto.subtle.digest = originalDigest
  }
})

function setupRallyLogin() {
  mockFetch
    .mockResolvedValueOnce({ ok: true, json: async () => CHALLENGE })
    .mockResolvedValueOnce({
      ok: true, status: 302,
      headers: { get: (h: string) => h === 'set-cookie' ? 'login=sid123; Path=/' : null },
    })
}

describe('fetchFinishedRally', () => {
  beforeEach(() => mockFetch.mockClear())

  it('returns FinishedGame[] from /games/finished', async () => {
    setupRallyLogin()
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => fixture })

    const games = await fetchFinishedRally('testuser', 'pass')
    expect(games).toHaveLength(2)
    expect(games[0]).toMatchObject({
      id: 'rally:501',
      platform: 'rally',
      gameName: 'Twilight Struggle',
      gameUrl: expect.stringContaining('rally-the-troops.com'),
      completedAgo: expect.any(String),
    })
    expect(games[0].completedAt).toBeInstanceOf(Date)
  })

  it('returns empty array when Finished section missing', async () => {
    setupRallyLogin()
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => '<html><body><h2>Other</h2></body></html>' })

    const games = await fetchFinishedRally('testuser', 'pass')
    expect(games).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx jest __tests__/lib/connectors/rally-finished.test.ts --no-coverage
```

Expected: FAIL — `fetchFinishedRally` not exported.

- [ ] **Step 4: Add `fetchFinishedRally` to `lib/connectors/rally.ts`**

Add `FinishedGame` to the import:

```typescript
import { Game, FinishedGame } from '../types'
```

Add after `parseGamesActive`:

```typescript
function parseGamesFinished(html: string, username: string): FinishedGame[] {
  const section = extractSection(html, 'Finished')
  if (!section) return []
  const games: FinishedGame[] = []
  const chunks = section.split(/(?=<div[^>]+class="[^"]*\bgame_item\b)/)
  for (const chunk of chunks) {
    const gameId = chunk.match(/href="\/join\/(\d+)"/)?.[1]
    if (!gameId) continue

    const titleMatch = chunk.match(/href="\/join\/\d+"[^>]*>#\d+\s*(?:&#x2013;|[–—-])\s*([^<(]+)/)
    const gameName = titleMatch ? titleMatch[1].trim() : 'Unknown'

    const cmdMatch = chunk.match(/<a[^>]+class="command"[^>]+href="([^"]+)"/)
                ?? chunk.match(/href="([^"]+)"[^>]*>(?:Play|Watch|Review)</)
    const rawUrl = (cmdMatch?.[1] ?? `/join/${gameId}`).replace(/&amp;/g, '&')
    const gameUrl = rawUrl.startsWith('http') ? rawUrl : `${BASE}${rawUrl}`

    const lastMoveMatch = chunk.match(/Last move:\s*([^<]+)</)
    const completedAt = lastMoveMatch ? parseHumanDate(lastMoveMatch[1].trim()) : new Date()

    games.push({
      id: `rally:${gameId}`,
      platform: 'rally',
      gameName,
      completedAt,
      completedAgo: formatTimeAgo(completedAt),
      gameUrl,
    })
  }
  return games
}

export async function fetchFinishedRally(username: string, password: string): Promise<FinishedGame[]> {
  const chRes = await fetch(`${BASE}/altcha-challenge`)
  const challenge: AltchaChallenge = await chRes.json()
  const altcha = await solveAltcha(challenge)

  const loginRes = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password, altcha }),
    redirect: 'manual',
  })
  if (loginRes.status !== 302) throw new Error('Rally the Troops login failed')
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
  if (!cookie) throw new Error('Rally the Troops login failed: no session cookie')

  const gamesRes = await fetch(`${BASE}/games/finished`, {
    headers: { ...HEADERS, Cookie: cookie },
  })
  if (!gamesRes.ok) throw new Error(`Rally finished games fetch failed (HTTP ${gamesRes.status})`)

  const html = await gamesRes.text()
  return parseGamesFinished(html, username)
}
```

- [ ] **Step 5: Run tests**

```bash
npx jest __tests__/lib/connectors/rally-finished.test.ts --no-coverage
```

Expected: PASS (2 tests).

- [ ] **Step 6: Run full suite**

```bash
npx jest --no-coverage
```

Expected: all passing.

- [ ] **Step 7: Commit**

```bash
git add lib/connectors/rally.ts __fixtures__/rally-finished.html __tests__/lib/connectors/rally-finished.test.ts
git commit -m "feat: add fetchFinishedRally connector"
```

---

### Task 6: Choochoo finished games proxy route

**Files:**
- Create: `app/api/choochoo-finished/route.ts`
- Test: `app/api/choochoo-finished/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `FinishedGame` from types, `formatTimeAgo` from utils. Same Node.js `https` module pattern as `/api/choochoo`. Queries Choochoo API with `status[]=FINISHED`.
- Produces: `GET /api/choochoo-finished` → `{ games: FinishedGame[], error: string | null }`.

- [ ] **Step 1: Write the failing test**

Create `app/api/choochoo-finished/__tests__/route.test.ts`:

```typescript
/**
 * @jest-environment node
 */

import { GET } from '../route'

// Mock https module
jest.mock('https', () => ({
  request: jest.fn(),
}))

import { request as mockRequest } from 'https'
const mockedRequest = mockRequest as jest.MockedFunction<typeof mockRequest>

function makeHttpsResponse(body: string, cookies: string[] = [], statusCode = 200) {
  return (opts: any, callback: any) => {
    const res = {
      statusCode,
      headers: { 'set-cookie': cookies },
      on: (event: string, handler: any) => {
        if (event === 'data') handler(Buffer.from(body))
        if (event === 'end') handler()
        return res
      },
    }
    callback(res)
    return {
      on: jest.fn().mockReturnThis(),
      write: jest.fn(),
      end: jest.fn(),
    }
  }
}

describe('GET /api/choochoo-finished', () => {
  const OLD_ENV = process.env
  beforeEach(() => {
    process.env = { ...OLD_ENV, CHOOCHOO_USERNAME: 'user', CHOOCHOO_PASSWORD: 'pass' }
    mockedRequest.mockReset()
  })
  afterEach(() => { process.env = OLD_ENV })

  it('returns finished games as JSON', async () => {
    const xsrfBody = JSON.stringify({ xsrfToken: 'tok123' })
    const loginBody = JSON.stringify({ user: { id: 99 } })
    const gamesBody = JSON.stringify({
      games: [
        { id: 777, name: 'Steam', playerIds: [99, 2], activePlayerId: null, updatedAt: '2026-06-01T00:00:00Z' },
        { id: 888, name: 'Age of Steam', playerIds: [1, 2], activePlayerId: null, updatedAt: '2026-06-05T00:00:00Z' },
      ],
    })

    mockedRequest
      .mockImplementationOnce(makeHttpsResponse(xsrfBody, ['XSRF-TOKEN=tok123; Path=/']))
      .mockImplementationOnce(makeHttpsResponse(loginBody, ['session=abc; Path=/']))
      .mockImplementationOnce(makeHttpsResponse(gamesBody))

    const res = await GET()
    const json = await res.json()
    expect(json.error).toBeNull()
    // Only game 777 includes userId 99
    expect(json.games).toHaveLength(1)
    expect(json.games[0]).toMatchObject({
      id: 'choochoo:777',
      platform: 'choochoo',
      gameName: 'Steam',
    })
  })

  it('returns empty games when credentials missing', async () => {
    process.env = { ...OLD_ENV }
    delete process.env.CHOOCHOO_USERNAME
    const res = await GET()
    const json = await res.json()
    expect(json.games).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest app/api/choochoo-finished/__tests__/route.test.ts --no-coverage
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `app/api/choochoo-finished/route.ts`**

```typescript
import { request as httpsRequest } from 'https'
import type { FinishedGame } from '@/lib/types'
import { formatTimeAgo } from '@/lib/connectors/utils'

export const dynamic = 'force-dynamic'

const API_HOST = 'api.choochoo.games'
const BASE_URL = 'https://www.choochoo.games'

function req(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: string,
): Promise<{ status: number; body: string; cookies: string[] }> {
  return new Promise((resolve) => {
    const r = httpsRequest(
      { hostname: API_HOST, port: 443, path, method, headers, rejectUnauthorized: false, timeout: 15000 },
      (res) => {
        let data = ''
        res.on('data', (c: Buffer) => { data += c })
        const cookies = (res.headers['set-cookie'] ?? []) as string[]
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data, cookies }))
      },
    )
    r.on('error', (e) => resolve({ status: 0, body: `ERROR: ${e.message}`, cookies: [] }))
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, body: 'TIMEOUT', cookies: [] }) })
    if (body) r.write(body)
    r.end()
  })
}

export async function GET() {
  const username = process.env.CHOOCHOO_USERNAME ?? ''
  const password = process.env.CHOOCHOO_PASSWORD ?? ''
  if (!username || !password) {
    return Response.json({ games: [], error: 'credentials not configured' })
  }

  const base = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }

  const xsrfRes = await req('GET', '/api/xsrf', base)
  let xsrfToken = ''
  try { xsrfToken = JSON.parse(xsrfRes.body).xsrfToken ?? '' } catch {}
  const xsrfCookie = xsrfRes.cookies.map(c => c.split(';')[0]).join('; ')
  if (!xsrfToken || !xsrfCookie) {
    return Response.json({ games: [], error: `choochoo: xsrf failed` })
  }

  const loginBody = JSON.stringify({ usernameOrEmail: username, password })
  const loginRes = await req('POST', '/api/users/login', {
    ...base,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(loginBody).toString(),
    'xsrf-token': xsrfToken,
    Cookie: xsrfCookie,
  }, loginBody)
  let loginJson: any = {}
  try { loginJson = JSON.parse(loginRes.body) } catch {}
  const myUserId: number = loginJson?.user?.id
  if (!myUserId) {
    return Response.json({ games: [], error: `choochoo: login failed` })
  }
  const authCookie = loginRes.cookies.map(c => c.split(';')[0]).join('; ') || xsrfCookie

  const gamesRes = await req('GET', '/api/games?status[]=FINISHED&pageSize=50', { ...base, Cookie: authCookie })
  let gamesJson: any = {}
  try { gamesJson = JSON.parse(gamesRes.body) } catch {}
  const allGames: any[] = gamesJson.games ?? (Array.isArray(gamesJson) ? gamesJson : [])
  const myGames = allGames.filter((g: any) => Array.isArray(g.playerIds) && g.playerIds.includes(myUserId))

  const games: FinishedGame[] = myGames.map((g: any): FinishedGame => {
    const gameId = g.id ?? 0
    const completedAt = g.updatedAt ? new Date(g.updatedAt) : new Date()
    return {
      id: `choochoo:${gameId}`,
      platform: 'choochoo',
      gameName: g.name ?? g.gameKey ?? 'Unknown',
      completedAt,
      completedAgo: formatTimeAgo(completedAt),
      gameUrl: `${BASE_URL}/app/games/${gameId}`,
    }
  })

  return Response.json({ games, error: null })
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest app/api/choochoo-finished/__tests__/route.test.ts --no-coverage
```

Expected: PASS (2 tests).

- [ ] **Step 5: Run full suite**

```bash
npx jest --no-coverage
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add app/api/choochoo-finished/route.ts "app/api/choochoo-finished/__tests__/route.test.ts"
git commit -m "feat: add choochoo-finished proxy route"
```

---

### Task 7: makeFinishedConnectors

**Files:**
- Modify: `lib/connectors/index.ts`
- Create: `__tests__/lib/connectors/index.test.ts`

**Interfaces:**
- Consumes: `fetchFinishedEighteenXX`, `fetchFinishedOBG`, `fetchFinishedBGA`, `fetchFinishedRally` from their respective connector files; `FinishedGame`, `FinishedGamesApiResponse` from types.
- Produces: `FinishedFetcher` type, `makeFinishedConnectors(): Partial<Record<Platform, FinishedFetcher>>` — registers 18xx, OBG, BGA, Rally, and Choochoo (Choochoo's fetcher throws — it is always called via proxy).

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/connectors/index.test.ts`:

```typescript
import { makeFinishedConnectors, FinishedFetcher } from '@/lib/connectors'

describe('makeFinishedConnectors', () => {
  it('returns connectors for the expected platforms', () => {
    const connectors = makeFinishedConnectors()
    const platforms = Object.keys(connectors)
    expect(platforms).toContain('eighteenxx')
    expect(platforms).toContain('obg')
    expect(platforms).toContain('bga')
    expect(platforms).toContain('rally')
    expect(platforms).toContain('choochoo')
  })

  it('choochoo connector throws (must be proxied)', () => {
    const connectors = makeFinishedConnectors()
    expect(() => connectors.choochoo!()).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/lib/connectors/index.test.ts --no-coverage
```

Expected: FAIL — `makeFinishedConnectors` not exported.

- [ ] **Step 4: Update `lib/connectors/index.ts`**

Add imports at the top (after existing imports):

```typescript
import { fetchFinishedEighteenXX } from './eighteenxx'
import { fetchFinishedOBG } from './obg'
import { fetchFinishedBGA } from './bga'
import { fetchFinishedRally } from './rally'
import { FinishedGame, FinishedGamesApiResponse } from '../types'
```

Add type and function after `hasCreds`:

```typescript
export type FinishedFetcher = () => Promise<FinishedGame[]>

export function makeFinishedConnectors(): Partial<Record<Platform, FinishedFetcher>> {
  return {
    eighteenxx: () => fetchFinishedEighteenXX(env('EIGHTEENXX_USERNAME'), env('EIGHTEENXX_PASSWORD')),
    obg: () => fetchFinishedOBG(env('OBG_USERNAME'), env('OBG_PASSWORD')),
    bga: () => fetchFinishedBGA(env('BGA_USERNAME'), env('BGA_PASSWORD')),
    rally: () => fetchFinishedRally(env('RALLY_USERNAME'), env('RALLY_PASSWORD')),
    choochoo: () => { throw new Error('choochoo must be called via /api/choochoo-finished proxy') },
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/lib/connectors/index.test.ts --no-coverage
```

Expected: PASS.

- [ ] **Step 5: Run full suite**

```bash
npx jest --no-coverage
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add lib/connectors/index.ts __tests__/lib/connectors/index.test.ts
git commit -m "feat: add makeFinishedConnectors and FinishedFetcher type"
```

---

### Task 8: /api/finished-games route

**Files:**
- Create: `app/api/finished-games/route.ts`
- Create: `app/api/finished-games/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `makeFinishedConnectors`, `hasCreds`, `FinishedFetcher` from `@/lib/connectors`; `Platform` from types.
- Produces: SSE stream with `start` / `platform` / `done` events, same shape as `/api/games`. `platform` events have `games: FinishedGame[]`. Choochoo proxied through `/api/choochoo-finished`.

- [ ] **Step 1: Write the failing test**

Create `app/api/finished-games/__tests__/route.test.ts`:

```typescript
/**
 * @jest-environment node
 */

jest.mock('@/lib/connectors', () => ({
  makeFinishedConnectors: jest.fn(),
  hasCreds: jest.fn(),
}))

import { GET } from '../route'
import { makeFinishedConnectors, hasCreds } from '@/lib/connectors'

const mockMakeFinished = makeFinishedConnectors as jest.MockedFunction<typeof makeFinishedConnectors>
const mockHasCreds = hasCreds as jest.MockedFunction<typeof hasCreds>

async function consumeSSE(body: ReadableStream<Uint8Array>): Promise<any[]> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const events: any[] = []
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''
    for (const chunk of chunks) {
      if (chunk.startsWith('data: ')) events.push(JSON.parse(chunk.slice(6)))
    }
  }
  return events
}

describe('GET /api/finished-games', () => {
  beforeEach(() => {
    mockMakeFinished.mockReset()
    mockHasCreds.mockReset()
  })

  it('emits start, platform, and done events over SSE', async () => {
    mockHasCreds.mockReturnValue(true)
    const mockFetcher = jest.fn().mockResolvedValue([{
      id: 'eighteenxx:1',
      platform: 'eighteenxx',
      gameName: '1830',
      completedAt: new Date('2026-06-01').toISOString(),
      completedAgo: '4 weeks ago',
      gameUrl: 'https://18xx.games/game/1',
    }])
    mockMakeFinished.mockReturnValue({ eighteenxx: mockFetcher })

    const res = await GET()
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')

    const events = await consumeSSE(res.body as ReadableStream<Uint8Array>)
    expect(events[0]).toEqual({ type: 'start', platforms: ['eighteenxx'] })
    expect(events[1]).toMatchObject({ type: 'platform', platform: 'eighteenxx', error: null })
    expect(events[1].games).toHaveLength(1)
    expect(events[2]).toMatchObject({ type: 'done', fetchedAt: expect.any(String) })
  })

  it('emits error when a connector throws', async () => {
    mockHasCreds.mockReturnValue(true)
    mockMakeFinished.mockReturnValue({ eighteenxx: jest.fn().mockRejectedValue(new Error('login failed')) })

    const res = await GET()
    const events = await consumeSSE(res.body as ReadableStream<Uint8Array>)
    const platformEvent = events.find(e => e.type === 'platform')
    expect(platformEvent).toMatchObject({ platform: 'eighteenxx', games: [], error: 'login failed' })
  })

  it('emits empty start when no platforms have credentials', async () => {
    mockHasCreds.mockReturnValue(false)
    mockMakeFinished.mockReturnValue({ eighteenxx: jest.fn() })

    const res = await GET()
    const events = await consumeSSE(res.body as ReadableStream<Uint8Array>)
    expect(events[0]).toEqual({ type: 'start', platforms: [] })
    expect(events[events.length - 1].type).toBe('done')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest "app/api/finished-games/__tests__/route.test.ts" --no-coverage
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `app/api/finished-games/route.ts`**

```typescript
import { makeFinishedConnectors, hasCreds } from '@/lib/connectors'
import { Platform } from '@/lib/types'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const PROXY_PATH: Partial<Record<Platform, string>> = {
  choochoo: '/api/choochoo-finished',
}

export async function GET(request?: Request) {
  const connectors = makeFinishedConnectors()
  const entries = (Object.entries(connectors) as [Platform, () => Promise<any>][])
    .filter(([p]) => hasCreds(p))

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      send({ type: 'start', platforms: entries.map(([p]) => p) })

      await Promise.allSettled(
        entries.map(async ([platform, fetcher]) => {
          try {
            let games: any[]
            const proxyPath = PROXY_PATH[platform]
            if (proxyPath) {
              const origin = request ? new URL(request.url).origin : 'http://localhost:3000'
              const res = await fetch(`${origin}${proxyPath}`)
              const json = await res.json() as any
              if (json.error) throw new Error(json.error)
              games = json.games ?? []
            } else {
              games = await fetcher()
            }
            send({ type: 'platform', platform, games, error: null })
          } catch (e) {
            send({ type: 'platform', platform, games: [], error: e instanceof Error ? e.message : String(e) })
          }
        })
      )

      send({ type: 'done', fetchedAt: new Date().toISOString() })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  })
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest "app/api/finished-games/__tests__/route.test.ts" --no-coverage
```

Expected: PASS (3 tests).

- [ ] **Step 5: Run full suite**

```bash
npx jest --no-coverage
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add app/api/finished-games/route.ts "app/api/finished-games/__tests__/route.test.ts"
git commit -m "feat: add /api/finished-games SSE route"
```

---

### Task 9: useFinishedGamesData hook

**Files:**
- Create: `hooks/useFinishedGamesData.ts`

**Interfaces:**
- Consumes: `FinishedGame`, `FinishedGamesApiResponse`, `Platform` from types; `/api/finished-games` SSE endpoint.
- Produces: `useFinishedGamesData()` → `{ data: FinishedGamesApiResponse | null, isLoading: boolean, lastError: string | null, platformStatuses: Partial<Record<Platform, PlatformStatus>> }`. Simpler than `useGamesData` — no cache, no pending/displayed split, no manual refresh needed.

- [ ] **Step 1: Create `hooks/useFinishedGamesData.ts`**

```typescript
'use client'
import { useEffect, useRef, useState } from 'react'
import { FinishedGame, FinishedGamesApiResponse, Platform } from '@/lib/types'

export type PlatformStatus =
  | { state: 'loading' }
  | { state: 'done'; count: number }
  | { state: 'error' }

export function useFinishedGamesData() {
  const [data, setData] = useState<FinishedGamesApiResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [lastError, setLastError] = useState<string | null>(null)
  const [platformStatuses, setPlatformStatuses] = useState<Partial<Record<Platform, PlatformStatus>>>({})
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    let allGames: FinishedGame[] = []
    let allErrors: FinishedGamesApiResponse['errors'] = []

    ;(async () => {
      try {
        const res = await fetch('/api/finished-games', { signal: controller.signal })
        if (!res.ok) throw new Error(`Server error ${res.status}`)

        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const chunks = buffer.split('\n\n')
          buffer = chunks.pop() ?? ''

          for (const chunk of chunks) {
            if (!chunk.startsWith('data: ')) continue
            let event: any
            try { event = JSON.parse(chunk.slice(6)) } catch { continue }

            if (event.type === 'start') {
              setPlatformStatuses(
                Object.fromEntries(event.platforms.map((p: Platform) => [p, { state: 'loading' }]))
              )
            } else if (event.type === 'platform') {
              if (event.error) {
                allErrors.push({ platform: event.platform, error: event.error })
                setPlatformStatuses(prev => ({ ...prev, [event.platform]: { state: 'error' } }))
              } else {
                const games: FinishedGame[] = (event.games as any[]).map(g => ({
                  ...g,
                  completedAt: new Date(g.completedAt),
                }))
                allGames = [...allGames, ...games]
                setPlatformStatuses(prev => ({
                  ...prev,
                  [event.platform]: { state: 'done', count: event.games.length },
                }))
              }
            } else if (event.type === 'done') {
              const sorted = [...allGames].sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
              setData({ games: sorted, errors: allErrors, fetchedAt: event.fetchedAt })
            }
          }
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
        setLastError(e instanceof Error ? e.message : 'Fetch failed')
      } finally {
        setIsLoading(false)
      }
    })()

    return () => {
      abortRef.current?.abort()
    }
  }, [])

  return { data, isLoading, lastError, platformStatuses }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add hooks/useFinishedGamesData.ts
git commit -m "feat: add useFinishedGamesData hook"
```

---

### Task 10: FinishedGameCard component

**Files:**
- Create: `components/FinishedGameCard.tsx`
- Create: `__tests__/components/FinishedGameCard.test.tsx`

**Interfaces:**
- Consumes: `FinishedGame` from types, `BADGE_COLORS` from `lib/platform-colors`, `PLATFORM_LABELS` from types.
- Produces: `FinishedGameCard({ game }: { game: FinishedGame })` — renders platform badge, game name, `completedAgo`, and "View →" link (always `target="_blank"`).

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/FinishedGameCard.test.tsx`:

```typescript
/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import FinishedGameCard from '@/components/FinishedGameCard'
import { FinishedGame } from '@/lib/types'

const game: FinishedGame = {
  id: 'eighteenxx:333',
  platform: 'eighteenxx',
  gameName: '1830: Railways & Robber Barons',
  completedAt: new Date('2026-06-01T00:00:00Z'),
  completedAgo: '4 weeks ago',
  gameUrl: 'https://18xx.games/game/333',
}

describe('FinishedGameCard', () => {
  it('renders game name and completedAgo', () => {
    render(<FinishedGameCard game={game} />)
    expect(screen.getByText('1830: Railways & Robber Barons')).toBeInTheDocument()
    expect(screen.getByText(/4 weeks ago/)).toBeInTheDocument()
  })

  it('renders View link opening in new tab', () => {
    render(<FinishedGameCard game={game} />)
    const link = screen.getByRole('link', { name: /view/i })
    expect(link).toHaveAttribute('href', 'https://18xx.games/game/333')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('renders platform badge label', () => {
    render(<FinishedGameCard game={game} />)
    expect(screen.getByText('18xx.games')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/components/FinishedGameCard.test.tsx --no-coverage
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `components/FinishedGameCard.tsx`**

```typescript
'use client'
import { FinishedGame, PLATFORM_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'

interface Props {
  game: FinishedGame
}

export default function FinishedGameCard({ game }: Props) {
  const badgeClass = BADGE_COLORS[game.platform] ?? 'bg-slate-800 text-slate-400'

  return (
    <div className="flex items-center justify-between py-3 px-4 rounded-lg border border-slate-700 bg-slate-900 hover:border-slate-600 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`shrink-0 text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${badgeClass}`}>
          {PLATFORM_LABELS[game.platform]}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-100 truncate">{game.gameName}</p>
          <p className="text-xs text-slate-500">Completed {game.completedAgo}</p>
        </div>
      </div>
      <a
        href={game.gameUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`View ${game.gameName}`}
        className="shrink-0 ml-4 text-xs font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 px-3 py-1 rounded-md transition-colors"
      >
        View →
      </a>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/components/FinishedGameCard.test.tsx --no-coverage
```

Expected: PASS (3 tests).

- [ ] **Step 5: Run full suite**

```bash
npx jest --no-coverage
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add components/FinishedGameCard.tsx __tests__/components/FinishedGameCard.test.tsx
git commit -m "feat: add FinishedGameCard component"
```

---

### Task 11: Overview page

**Files:**
- Create: `app/overview/page.tsx`

**Interfaces:**
- Consumes: `useFinishedGamesData` from `hooks/useFinishedGamesData`, `FinishedGameCard` from components, `BADGE_COLORS` and `PLATFORM_LABELS` from lib, `FetchProgress` from components, `Platform` from types.
- Produces: `app/overview/page.tsx` — `'use client'` page at `/overview`. Fetches on mount, shows FetchProgress while loading, platform filter chips, flat list of FinishedGameCard with "Load more" (20 per page).

- [ ] **Step 1: Create `app/overview/page.tsx`**

```typescript
'use client'
import { useState } from 'react'
import { Platform, PLATFORM_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import { useFinishedGamesData } from '@/hooks/useFinishedGamesData'
import FinishedGameCard from '@/components/FinishedGameCard'
import FetchProgress from '@/components/FetchProgress'

const PAGE_SIZE = 20

export default function OverviewPage() {
  const { data, isLoading, lastError, platformStatuses } = useFinishedGamesData()
  const [platformFilter, setPlatformFilter] = useState<Platform | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const availablePlatforms = data
    ? Array.from(new Set(data.games.map(g => g.platform)))
    : []

  const filtered = data
    ? (platformFilter ? data.games.filter(g => g.platform === platformFilter) : data.games)
    : []

  const visible = filtered.slice(0, visibleCount)
  const hasMore = filtered.length > visibleCount

  const handleFilterChange = (p: Platform | null) => {
    setPlatformFilter(p)
    setVisibleCount(PAGE_SIZE)
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold">Recently Finished Games</h1>
          {data && (
            <p className="text-sm text-slate-500">
              {data.games.length} games · updated {new Date(data.fetchedAt).toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a href="/" className="text-xs bg-slate-800 text-slate-400 hover:bg-slate-700 px-3 py-1.5 rounded-md">
            ← Dashboard
          </a>
          <a href="/setup" className="text-xs bg-slate-800 text-slate-400 hover:bg-slate-700 px-3 py-1.5 rounded-md">
            ⚙ Settings
          </a>
        </div>
      </div>

      {/* Loading */}
      {isLoading && !data && (
        <FetchProgress platformStatuses={platformStatuses} />
      )}

      {/* Compact loading indicator when data is partially in */}
      {isLoading && data && (
        <FetchProgress platformStatuses={platformStatuses} compact />
      )}

      {/* Error */}
      {lastError && !data && (
        <div className="text-center py-12">
          <p className="text-red-400 mb-3">Failed to load finished games</p>
          <a href="/overview" className="text-xs bg-slate-800 text-slate-400 hover:bg-slate-700 px-3 py-1.5 rounded-md">
            ↻ Try again
          </a>
        </div>
      )}

      {/* Platform errors */}
      {data && data.errors.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {data.errors.map(e => (
            <span key={e.platform} className="text-xs bg-red-950 text-red-400 px-2 py-1 rounded-md">
              ⚠ {e.platform} unavailable
            </span>
          ))}
        </div>
      )}

      {/* Platform filter chips */}
      {availablePlatforms.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            onClick={() => handleFilterChange(null)}
            className={`text-xs px-3 py-1 rounded-full font-medium transition-colors
              ${platformFilter === null
                ? 'bg-slate-200 text-slate-900'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
          >
            All ({data?.games.length ?? 0})
          </button>
          {availablePlatforms.map(p => (
            <button
              key={p}
              onClick={() => handleFilterChange(p)}
              className={`text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full transition-opacity
                ${BADGE_COLORS[p] ?? 'bg-slate-800 text-slate-400'}
                ${platformFilter === p ? 'opacity-100 ring-2 ring-white/30' : 'opacity-70 hover:opacity-100'}`}
            >
              {PLATFORM_LABELS[p]} ({data?.games.filter(g => g.platform === p).length ?? 0})
            </button>
          ))}
        </div>
      )}

      {/* Game list */}
      {data && visible.length > 0 && (
        <div className="flex flex-col gap-2">
          {visible.map(g => (
            <FinishedGameCard key={g.id} game={g} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {data && filtered.length === 0 && !isLoading && (
        <div className="text-center py-12 text-slate-500">
          No recently finished games found
          {platformFilter && (
            <span> on {PLATFORM_LABELS[platformFilter]}</span>
          )}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
            className="text-xs bg-slate-800 text-slate-400 hover:bg-slate-700 px-4 py-2 rounded-md"
          >
            Load more ({filtered.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: all passing.

- [ ] **Step 4: Commit**

```bash
git add app/overview/page.tsx
git commit -m "feat: add /overview page with finished games list"
```

---

### Task 12: Add Overview button to GameGrid

**Files:**
- Modify: `components/GameGrid.tsx`
- Modify: `__tests__/components/GameGrid.test.tsx`

**Interfaces:**
- Consumes: existing `GameGrid` props — no changes to the interface.
- Produces: "⊞ Overview" `<a href="/overview">` button added to the header row between the title block and the Settings button. Consistent style with existing Settings/Refresh buttons.

- [ ] **Step 1: Read the existing GameGrid test to understand its structure**

File: `__tests__/components/GameGrid.test.tsx`

- [ ] **Step 2: Add a test asserting the Overview link exists**

In `__tests__/components/GameGrid.test.tsx`, add to the appropriate describe block (or as a new test):

```typescript
it('renders Overview navigation link', () => {
  // render GameGrid with minimal props — reuse whatever setup already exists in the file
  // then:
  const overviewLink = screen.getByRole('link', { name: /overview/i })
  expect(overviewLink).toHaveAttribute('href', '/overview')
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx jest __tests__/components/GameGrid.test.tsx --no-coverage
```

Expected: FAIL — no "Overview" link found.

- [ ] **Step 4: Add the Overview button to `components/GameGrid.tsx`**

In the header `<div className="flex items-center gap-2">` (line ~64), add the Overview link before the Settings link:

```typescript
<a href="/overview" className="text-xs bg-slate-800 text-slate-400 hover:bg-slate-700 px-3 py-1.5 rounded-md">
  ⊞ Overview
</a>
```

The header block becomes:

```typescript
<div className="flex items-center gap-2">
  <a href="/overview" className="text-xs bg-slate-800 text-slate-400 hover:bg-slate-700 px-3 py-1.5 rounded-md">
    ⊞ Overview
  </a>
  <a href="/setup" className="text-xs bg-slate-800 text-slate-400 hover:bg-slate-700 px-3 py-1.5 rounded-md">
    ⚙ Settings
  </a>
  <button
    onClick={onRefresh}
    disabled={isRefreshing}
    className="text-xs bg-slate-800 text-slate-400 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-md flex items-center gap-1.5"
  >
    <span className={isRefreshing ? 'animate-spin inline-block' : ''}>↻</span>
    Refresh
  </button>
</div>
```

- [ ] **Step 5: Run tests**

```bash
npx jest __tests__/components/GameGrid.test.tsx --no-coverage
```

Expected: PASS.

- [ ] **Step 6: Run full suite**

```bash
npx jest --no-coverage
```

Expected: all passing.

- [ ] **Step 7: Commit**

```bash
git add components/GameGrid.tsx __tests__/components/GameGrid.test.tsx
git commit -m "feat: add Overview navigation button to dashboard header"
```
