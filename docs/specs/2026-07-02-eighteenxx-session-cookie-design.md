# Design: 18xx.games Session Cookie Auth

**Date:** 2026-07-02  
**Status:** Approved

## Problem

18xx.games added Cloudflare Turnstile to their login endpoint. Server-side login from Vercel's edge runtime is blocked with `{"error":"Please complete the captcha"}`. The connector is currently broken.

## Solution

Allow the user to paste a session cookie obtained from their browser into the setup page. When present, the connector skips the login flow entirely and uses the cookie directly on the games API call.

## Data Layer

Add one optional field to `UserPrefs` in `lib/types.ts`:

```ts
eighteenxxSessionCookie?: string
```

`DEFAULT_PREFS` does not need a default value (undefined = not set).

The field is stored in Vercel KV alongside other prefs via the existing `/api/prefs` POST endpoint. It is returned by `/api/prefs` GET — acceptable for this single-user, basic-auth-protected app.

## Connector Changes (`lib/connectors/eighteenxx.ts`)

`fetchEighteenXX(username, password, sessionCookie?)`:

- If `sessionCookie` is truthy: skip login, call `GET /api/game/user` with `Cookie: <sessionCookie>` directly.
- If `sessionCookie` is falsy: attempt username/password login as before (may fail due to Turnstile, but kept as fallback).

Same change applied to `fetchFinishedEighteenXX`.

## Connector Index (`lib/connectors/index.ts`)

`makeConnectors(bgaSortCapDays, eighteenxxSessionCookie?)`:

- Passes `eighteenxxSessionCookie` through to `fetchEighteenXX`.
- Same for `makeFinishedConnectors`.

`hasCreds('eighteenxx')` currently requires `EIGHTEENXX_USERNAME` + `EIGHTEENXX_PASSWORD` env vars. Since the cookie lives in prefs (not env vars), `hasCreds` cannot check it. Instead, the games route inlines the check:

```ts
.filter(([p]) => (hasCreds(p) || (p === 'eighteenxx' && !!prefs.eighteenxxSessionCookie)) && !disabled.includes(p))
```

Same pattern applied in `app/api/finished-games/route.ts`.

## Games Route (`app/api/games/route.ts`)

Pass `prefs.eighteenxxSessionCookie` to `makeConnectors`:

```ts
const connectors = makeConnectors(prefs.bgaSortCapDays ?? 3, prefs.eighteenxxSessionCookie)
```

Update the `hasCreds` filter as described above.

## Setup Page UI (`app/setup/page.tsx`)

Under the 18xx.games platform card, add a collapsible or always-visible sub-row with:

- Label: "Session cookie"
- Helper text: "Open 18xx.games in your browser, log in, open DevTools → Application → Cookies → `18xx.games` → find the session cookie and paste its full value here."
- `<input type="password">` — masked field
- When a cookie is already saved: show "●●●●● saved" placeholder text (the actual value is never echoed back)
- Save button → PATCH `/api/prefs` with `{ eighteenxxSessionCookie: value }`
- Clear button → saves empty string, treated as not set

The cookie field only appears for the eighteenxx platform row, not for others.

## Error Handling

- If the cookie is expired/invalid, the games fetch will get a non-200 or empty response from 18xx.games. The connector should throw a descriptive error: `"18xx.games session cookie is invalid or expired — update it in Settings"`.
- The error surfaces in the dashboard as the existing platform error badge for 18xx.games.

## Out of Scope

- Automatic cookie refresh
- Cookie expiry detection
- Applying this pattern to other platforms
