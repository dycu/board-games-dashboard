# 18xx.games Session Cookie Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to paste a browser session cookie for 18xx.games into the setup page so the connector can bypass the Cloudflare-blocked login flow.

**Architecture:** Add `eighteenxxSessionCookie` to `UserPrefs` (Vercel KV). Thread it through `makeConnectors` into `fetchEighteenXX`, which skips login and uses the cookie directly when present. Expose a password input on the setup page to save/clear the value. Update the `hasCreds` filter in the games routes to treat a stored cookie as valid credentials.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Vercel KV (`@vercel/kv`), Jest

## Global Constraints

- All modified files must remain TypeScript strict-compatible
- Do not change the `/api/prefs` route — it already handles arbitrary `Partial<UserPrefs>` POST bodies
- Test runner: `npm test` (Jest, `jest.config.ts` in repo root)
- The connector runs in Vercel edge runtime — no Node.js-only APIs

---

### Task 1: Extend UserPrefs type and update connector signature

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/connectors/eighteenxx.ts` (signature only, logic in Task 2)
- Modify: `lib/connectors/__tests__/index.test.ts`

**Interfaces:**
- Produces: `UserPrefs.eighteenxxSessionCookie?: string` — used by Tasks 3 and 4
- Produces: `fetchEighteenXX(username, password, sessionCookie?: string)` — implemented in Task 2
- Produces: `fetchFinishedEighteenXX(username, password, sessionCookie?: string)` — implemented in Task 2

- [ ] **Step 1: Add field to UserPrefs in `lib/types.ts`**

```ts
export interface UserPrefs {
  pins: string[]
  sort: 'longest-wait' | 'most-recent' | 'platform' | 'game-name'
  filter: {
    turnStatus: 'all' | 'my-turn' | 'waiting'
    platforms: Platform[]
  }
  disabledPlatforms: Platform[]
  bgaSortCapDays: number
  eighteenxxSessionCookie?: string   // ← add this line
}
```

`DEFAULT_PREFS` needs no change — missing optional fields are `undefined`.

- [ ] **Step 2: Add `sessionCookie` param to both exported functions in `lib/connectors/eighteenxx.ts`**

Change the two function signatures (logic stays unchanged in this task):

```ts
export async function fetchEighteenXX(
  username: string,
  password: string,
  sessionCookie?: string
): Promise<Game[]> {
  // existing body unchanged
}

export async function fetchFinishedEighteenXX(
  username: string,
  password: string,
  sessionCookie?: string
): Promise<FinishedGame[]> {
  // existing body unchanged
}
```

- [ ] **Step 3: Run existing tests to confirm nothing broke**

```bash
npm test
```

Expected: all tests pass. The new optional param is backwards-compatible.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts lib/connectors/eighteenxx.ts
git commit -m "feat: add eighteenxxSessionCookie to UserPrefs and extend connector signature"
```

---

### Task 2: Implement cookie-based auth in the eighteenxx connector

**Files:**
- Modify: `lib/connectors/eighteenxx.ts`
- Create: `lib/connectors/__tests__/eighteenxx.test.ts`

**Interfaces:**
- Consumes: `fetchEighteenXX(username, password, sessionCookie?)` from Task 1
- Consumes: `fetchFinishedEighteenXX(username, password, sessionCookie?)` from Task 1

**Cookie flow when `sessionCookie` is provided:**
1. Call `GET https://18xx.games/api/user` with `Cookie: <sessionCookie>` to get `myId`
2. If response is not ok, throw `"18xx.games session cookie is invalid or expired — update it in Settings"`
3. Call `GET https://18xx.games/api/game/user` with `Cookie: <sessionCookie>`
4. Filter and map games as normal using `myId`

- [ ] **Step 1: Write the failing tests**

Create `lib/connectors/__tests__/eighteenxx.test.ts`:

```ts
/**
 * @jest-environment node
 */
import { fetchEighteenXX, fetchFinishedEighteenXX } from '../eighteenxx'

const BASE = 'https://18xx.games'

const ACTIVE_GAME = {
  id: 100,
  title: '18Chesapeake',
  status: 'active',
  updated_at: '2026-01-15T10:00:00Z',
  players: [{ id: 42, name: 'Dycu' }, { id: 99, name: 'Other' }],
  acting: [42],
}

const FINISHED_GAME = {
  id: 200,
  title: '1830',
  status: 'finished',
  updated_at: '2026-01-10T10:00:00Z',
  players: [{ id: 42, name: 'Dycu' }, { id: 99, name: 'Other' }],
  acting: [],
}

function mockFetch(...responses: Array<{ ok: boolean; status?: number; data: unknown }>) {
  let call = 0
  global.fetch = jest.fn().mockImplementation(() => {
    const r = responses[call++] ?? responses[responses.length - 1]
    return Promise.resolve({
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 401),
      headers: { get: () => null },
      json: async () => r.data,
      text: async () => JSON.stringify(r.data),
    } as unknown as Response)
  })
}

afterEach(() => {
  jest.restoreAllMocks()
})

describe('fetchEighteenXX — session cookie path', () => {
  it('calls /api/user then /api/game/user with cookie, skipping login', async () => {
    mockFetch(
      { ok: true, data: { user: { id: 42, name: 'Dycu' } } },   // /api/user
      { ok: true, data: [ACTIVE_GAME] },                          // /api/game/user
    )

    const games = await fetchEighteenXX('', '', 'session_abc')

    expect(global.fetch).toHaveBeenCalledTimes(2)
    const [firstCall, secondCall] = (global.fetch as jest.Mock).mock.calls
    expect(firstCall[0]).toBe(`${BASE}/api/user`)
    expect(firstCall[1].headers).toMatchObject({ Cookie: 'session_abc' })
    expect(secondCall[0]).toBe(`${BASE}/api/game/user`)
    expect(secondCall[1].headers).toMatchObject({ Cookie: 'session_abc' })
    expect(games).toHaveLength(1)
    expect(games[0].id).toBe('eighteenxx:100')
    expect(games[0].myTurn).toBe(true)
  })

  it('throws descriptive error when cookie is expired (401 on /api/user)', async () => {
    mockFetch({ ok: false, status: 401, data: {} })

    await expect(fetchEighteenXX('', '', 'expired_cookie')).rejects.toThrow(
      '18xx.games session cookie is invalid or expired — update it in Settings'
    )
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('falls back to login flow when no cookie provided', async () => {
    mockFetch(
      { ok: true, data: { user: { id: 42 }, headers: { get: () => 'sid=abc' } } }, // login — note: mock handles cookie header below
      { ok: true, data: [ACTIVE_GAME] },
    )
    // Override to return proper set-cookie header for login
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: (h: string) => h === 'set-cookie' ? 'sid=abc; Path=/' : null },
        json: async () => ({ user: { id: 42 } }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        json: async () => [ACTIVE_GAME],
      } as unknown as Response)

    const games = await fetchEighteenXX('user', 'pass')

    const firstUrl = (global.fetch as jest.Mock).mock.calls[0][0]
    expect(firstUrl).toBe(`${BASE}/api/user/login`)
  })
})

describe('fetchFinishedEighteenXX — session cookie path', () => {
  it('uses cookie directly and returns finished games', async () => {
    mockFetch(
      { ok: true, data: { user: { id: 42, name: 'Dycu' } } },
      { ok: true, data: [FINISHED_GAME, ACTIVE_GAME] },
    )

    const games = await fetchFinishedEighteenXX('', '', 'session_abc')

    expect(games).toHaveLength(1)
    expect(games[0].id).toBe('eighteenxx:200')
  })

  it('throws descriptive error when cookie is expired', async () => {
    mockFetch({ ok: false, status: 401, data: {} })

    await expect(fetchFinishedEighteenXX('', '', 'bad_cookie')).rejects.toThrow(
      '18xx.games session cookie is invalid or expired — update it in Settings'
    )
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test lib/connectors/__tests__/eighteenxx.test.ts
```

Expected: FAIL — the cookie path tests will fail because no cookie logic exists yet.

- [ ] **Step 3: Implement cookie path in `fetchEighteenXX`**

Replace the function body in `lib/connectors/eighteenxx.ts`:

```ts
export async function fetchEighteenXX(username: string, password: string, sessionCookie?: string): Promise<Game[]> {
  let myId: number
  let cookie: string

  if (sessionCookie) {
    const userRes = await fetch(`${BASE}/api/user`, {
      headers: { Cookie: sessionCookie, Accept: 'application/json' },
    })
    if (!userRes.ok) throw new Error('18xx.games session cookie is invalid or expired — update it in Settings')
    const userData = await userRes.json()
    myId = userData.user?.id
    cookie = sessionCookie
  } else {
    const loginRes = await fetch(`${BASE}/api/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: username, password }),
    })
    if (!loginRes.ok) throw new Error('18xx.games login failed')
    const loginData = await loginRes.json()
    myId = loginData.user?.id
    cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
  }

  const gamesRes = await fetch(`${BASE}/api/game/user`, {
    headers: { Cookie: cookie, Accept: 'application/json' },
  })
  if (!gamesRes.ok) throw new Error('18xx.games games fetch failed')

  const data = await gamesRes.json()
  const games: any[] = Array.isArray(data) ? data : data.games ?? []

  return games
    .filter((g: any) => g.status === 'active' && (g.players ?? []).some((p: any) => p.id === myId))
    .map((g: any): Game => {
      const rawTime = g.updated_at ?? g.created_at
      const lastMoveAt = typeof rawTime === 'number' ? new Date(rawTime * 1000) : new Date(rawTime)
      const activePlayers: any[] = g.active_players ?? []
      const acting: number[] = g.acting ?? activePlayers.map((p: any) => p.id)
      const isMyTurn = acting.includes(myId)
      const currentPlayer = isMyTurn
        ? undefined
        : (g.players ?? []).find((p: any) => acting.includes(p.id) && p.id !== myId)?.name
          ?? activePlayers.find((p: any) => p.id !== myId)?.name

      return {
        id: `eighteenxx:${g.id}`,
        platform: 'eighteenxx',
        gameName: g.title ?? 'Unknown',
        myTurn: isMyTurn,
        currentPlayer,
        lastMoveAt,
        lastMoveAgo: formatTimeAgo(lastMoveAt),
        urgent: Date.now() - lastMoveAt.getTime() > 2 * 24 * 60 * 60 * 1000,
        gameUrl: `${BASE}/game/${g.id}`,
        platformUrl: BASE,
        players: (g.players ?? [])
          .map((p: any) => p.name)
          .filter((n: string) => n !== username),
      }
    })
}
```

- [ ] **Step 4: Implement cookie path in `fetchFinishedEighteenXX`**

Replace the function body:

```ts
export async function fetchFinishedEighteenXX(username: string, password: string, sessionCookie?: string): Promise<FinishedGame[]> {
  let myId: number
  let cookie: string

  if (sessionCookie) {
    const userRes = await fetch(`${BASE}/api/user`, {
      headers: { Cookie: sessionCookie, Accept: 'application/json' },
    })
    if (!userRes.ok) throw new Error('18xx.games session cookie is invalid or expired — update it in Settings')
    const userData = await userRes.json()
    myId = userData.user?.id
    cookie = sessionCookie
  } else {
    const loginRes = await fetch(`${BASE}/api/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: username, password }),
    })
    if (!loginRes.ok) throw new Error('18xx.games login failed')
    const loginData = await loginRes.json()
    myId = loginData.user?.id
    cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
  }

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

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all tests pass, including the new eighteenxx tests.

- [ ] **Step 6: Commit**

```bash
git add lib/connectors/eighteenxx.ts lib/connectors/__tests__/eighteenxx.test.ts
git commit -m "feat: use session cookie in 18xx connector, skip login when present"
```

---

### Task 3: Wire session cookie through connectors index and API routes

**Files:**
- Modify: `lib/connectors/index.ts`
- Modify: `app/api/games/route.ts`
- Modify: `app/api/finished-games/route.ts`

**Interfaces:**
- Consumes: `fetchEighteenXX(username, password, sessionCookie?)` from Task 2
- Consumes: `fetchFinishedEighteenXX(username, password, sessionCookie?)` from Task 2
- Consumes: `UserPrefs.eighteenxxSessionCookie?: string` from Task 1

- [ ] **Step 1: Update `makeConnectors` in `lib/connectors/index.ts`**

Change the signature and the eighteenxx entry:

```ts
export function makeConnectors(bgaSortCapDays = 3, eighteenxxSessionCookie?: string): Record<Platform, Fetcher> {
  return {
    bga: () => fetchBGA(env('BGA_USERNAME'), env('BGA_PASSWORD'), bgaSortCapDays),
    eighteenxx: () => fetchEighteenXX(env('EIGHTEENXX_USERNAME'), env('EIGHTEENXX_PASSWORD'), eighteenxxSessionCookie),
    obg: () => fetchOBG(env('OBG_USERNAME'), env('OBG_PASSWORD')),
    yucata: () => fetchYucata(env('YUCATA_USERNAME'), env('YUCATA_PASSWORD')),
    choochoo: () => fetchChoochoo(env('CHOOCHOO_USERNAME'), env('CHOOCHOO_PASSWORD')),
    hansa: () => fetchHansa(env('HANSA_USER_ID')),
    rally: () => fetchRally(env('RALLY_USERNAME'), env('RALLY_PASSWORD')),
  }
}
```

- [ ] **Step 2: Update `makeFinishedConnectors` in `lib/connectors/index.ts`**

```ts
export function makeFinishedConnectors(eighteenxxSessionCookie?: string): Partial<Record<Platform, FinishedFetcher>> {
  return {
    eighteenxx: () => fetchFinishedEighteenXX(env('EIGHTEENXX_USERNAME'), env('EIGHTEENXX_PASSWORD'), eighteenxxSessionCookie),
    obg: () => fetchFinishedOBG(env('OBG_USERNAME'), env('OBG_PASSWORD')),
    bga: () => fetchFinishedBGA(env('BGA_USERNAME'), env('BGA_PASSWORD')),
    rally: () => fetchFinishedRally(env('RALLY_USERNAME'), env('RALLY_PASSWORD')),
    hansa: () => fetchFinishedHansa(env('HANSA_USER_ID')),
    choochoo: () => { throw new Error('choochoo must be called via /api/choochoo-finished proxy') },
  }
}
```

- [ ] **Step 3: Update `app/api/games/route.ts`**

Pass the cookie to `makeConnectors` and extend the `hasCreds` filter:

```ts
export async function GET(request?: Request) {
  const prefs = await getPrefs()
  const disabled = prefs.disabledPlatforms ?? []
  const connectors = makeConnectors(prefs.bgaSortCapDays ?? 3, prefs.eighteenxxSessionCookie)

  const entries = (Object.entries(connectors) as [Platform, () => Promise<any>][])
    .filter(([p]) =>
      (hasCreds(p) || (p === 'eighteenxx' && !!prefs.eighteenxxSessionCookie))
      && !disabled.includes(p)
    )
  // rest of function unchanged
```

- [ ] **Step 4: Update `app/api/finished-games/route.ts`**

```ts
export async function GET(request?: Request) {
  const prefs = await getPrefs()
  const connectors = makeFinishedConnectors(prefs.eighteenxxSessionCookie)
  const entries = (Object.entries(connectors) as [Platform, () => Promise<any>][])
    .filter(([p]) =>
      hasCreds(p) || (p === 'eighteenxx' && !!prefs.eighteenxxSessionCookie)
    )
  // rest of function unchanged
```

Also add the import at the top of `app/api/finished-games/route.ts`:

```ts
import { getPrefs } from '@/lib/prefs'
```

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all tests pass. The `makeConnectors` call in the route test is mocked so the signature change is invisible to it.

- [ ] **Step 6: Commit**

```bash
git add lib/connectors/index.ts app/api/games/route.ts app/api/finished-games/route.ts
git commit -m "feat: thread 18xx session cookie through connectors and API routes"
```

---

### Task 4: Setup page UI — session cookie input for 18xx.games

**Files:**
- Modify: `app/setup/page.tsx`

**Interfaces:**
- Consumes: `UserPrefs.eighteenxxSessionCookie?: string` from Task 1
- Consumes: `PATCH /api/prefs` with `{ eighteenxxSessionCookie: string }` body — existing endpoint, no changes needed

**UI behaviour:**
- A password `<input>` appears only under the `eighteenxx` platform card
- When `prefs.eighteenxxSessionCookie` is set, the placeholder reads "●●●●● saved" and the input is empty (value not echoed)
- Typing a new value and clicking Save POSTs to `/api/prefs`
- A Clear button saves `""` (empty string), which the connector treats as not set
- The Save button is disabled while saving (shows "Saving…")

- [ ] **Step 1: Add local state for the cookie input**

In `SetupPage`, add after the existing `useState` declarations:

```ts
const [cookieInput, setCookieInput] = useState('')
const [cookieSaving, setCookieSaving] = useState(false)
const [cookieSaved, setCookieSaved] = useState(false)   // tracks whether a cookie is currently stored
```

- [ ] **Step 2: Load cookie presence from prefs**

In the existing `useEffect` that loads prefs, add:

```ts
useEffect(() => {
  fetch('/api/prefs').then(r => r.json()).then(prefs => {
    setDisabled(new Set(prefs.disabledPlatforms ?? []))
    setBgaSortCapDays(prefs.bgaSortCapDays ?? 3)
    setCookieSaved(!!prefs.eighteenxxSessionCookie)   // ← add this line
  })
}, [])
```

- [ ] **Step 3: Add save/clear handlers**

Add these two functions inside `SetupPage`, after the `togglePlatform` function:

```ts
const saveCookie = async (value: string) => {
  setCookieSaving(true)
  await fetch('/api/prefs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eighteenxxSessionCookie: value }),
  })
  setCookieSaved(!!value)
  setCookieInput('')
  setCookieSaving(false)
}
```

- [ ] **Step 4: Render the cookie sub-row inside the eighteenxx platform card**

In the JSX, find the closing `</div>` of the platform card content (after the test button row). Add the cookie sub-row **only for the `eighteenxx` platform**, inside the `PLATFORMS.map` callback:

```tsx
{platform === 'eighteenxx' && (
  <div className="mt-3 pt-3 border-t border-[#f0f0f0]">
    <p className="text-xs text-[#9b9b9b] mb-2">
      Session cookie — log in to 18xx.games in your browser, open DevTools → Application → Cookies → <code>18xx.games</code> → find the session cookie and paste its value here.
    </p>
    <div className="flex gap-2">
      <input
        type="password"
        value={cookieInput}
        onChange={e => setCookieInput(e.target.value)}
        placeholder={cookieSaved ? '●●●●● saved' : 'Paste cookie value…'}
        className="flex-1 text-xs bg-white text-[#1a1a1a] px-3 py-1.5 rounded-md border border-[#e5e5e5] font-mono"
      />
      <button
        onClick={() => saveCookie(cookieInput)}
        disabled={!cookieInput || cookieSaving}
        className="text-xs bg-[#5e6ad2] text-white hover:bg-[#4f5ab8] px-3 py-1.5 rounded-md disabled:opacity-50 whitespace-nowrap"
      >
        {cookieSaving ? 'Saving…' : 'Save'}
      </button>
      {cookieSaved && (
        <button
          onClick={() => saveCookie('')}
          disabled={cookieSaving}
          className="text-xs bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb] px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          Clear
        </button>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all tests pass (setup page has no tests — UI-only change).

- [ ] **Step 6: Commit**

```bash
git add app/setup/page.tsx
git commit -m "feat: add 18xx.games session cookie input to setup page"
```

---

### Task 5: Deploy and verify

- [ ] **Step 1: Push to master**

```bash
git push
```

Vercel auto-deploys on push to master.

- [ ] **Step 2: Get your session cookie from 18xx.games**

1. Open https://18xx.games in your browser and log in
2. Open DevTools (F12) → Application tab → Cookies → `https://18xx.games`
3. Find the session cookie (likely named `_18xx_session` or similar)
4. Copy its value

- [ ] **Step 3: Paste cookie into setup page**

1. Go to the deployed dashboard → Setup page
2. Find the 18xx.games card — paste the cookie value into the field
3. Click Save

- [ ] **Step 4: Verify on dashboard**

Go to the dashboard — 18xx.games games should appear. If the platform error badge still shows, check the cookie value and retry.

- [ ] **Step 5: Tag the release**

```bash
git tag v1.9
git push origin v1.9
```
