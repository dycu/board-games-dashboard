# Opponent Slow-Play Highlighting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply amber urgency styling to "Waiting for others" game cards when the opponent hasn't moved in more than N days (default 5, configurable in Settings).

**Architecture:** Add `opponentSlowDays: number` to `UserPrefs`. In `GameCard`, compute `opponentSlow` for waiting games using `lastMoveAt` and apply the same amber label treatment already used for overdue "my turn" games. Add a settings input on the setup page.

**Tech Stack:** TypeScript, React, Tailwind CSS, Vercel KV (via existing prefs system)

## Global Constraints
- Default threshold: 5 days
- Min 1, max 90 (same bounds as `bgaSortCapDays`)
- BGA `lastMoveAt` is approximate (derived from time-limit remaining) — same caveat applies to your-turn urgency, no worse here
- `opponentSlowDays` pref is persisted to Vercel KV via existing `/api/prefs` POST (no route change needed — it already accepts `Partial<UserPrefs>`)

---

### Task 1: Add opponentSlowDays to UserPrefs and the settings UI

**Files:**
- Modify: `lib/types.ts`
- Modify: `app/setup/page.tsx`

**Interfaces:**
- Produces: `opponentSlowDays: number` in `UserPrefs` with default `5`

- [ ] **Step 1: Add opponentSlowDays to lib/types.ts**

Open `lib/types.ts`. In the `UserPrefs` interface, add after `bgaSortCapDays`:

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
  eighteenxxSessionCookie?: string
  opponentSlowDays: number
}
```

In `DEFAULT_PREFS`, add:

```ts
export const DEFAULT_PREFS: UserPrefs = {
  pins: [],
  sort: 'longest-wait',
  filter: { turnStatus: 'all', platforms: [] },
  disabledPlatforms: [],
  bgaSortCapDays: 3,
  opponentSlowDays: 5,
}
```

- [ ] **Step 2: Add opponentSlowDays input to app/setup/page.tsx**

Open `app/setup/page.tsx`. Add state after `bgaSortCapDays`:

```tsx
const [opponentSlowDays, setOpponentSlowDays] = useState(5)
```

In the `useEffect` that loads prefs, add:

```tsx
setOpponentSlowDays(prefs.opponentSlowDays ?? 5)
```

So the full useEffect becomes:

```tsx
useEffect(() => {
  fetch('/api/prefs').then(r => r.json()).then(prefs => {
    setDisabled(new Set(prefs.disabledPlatforms ?? []))
    setBgaSortCapDays(prefs.bgaSortCapDays ?? 3)
    setOpponentSlowDays(prefs.opponentSlowDays ?? 5)
    setCookieSaved(!!prefs.eighteenxxSessionCookie)
  })
}, [])
```

Add a settings card for the new pref, after the BGA sort cap card and before the platforms list:

```tsx
<div className="bg-white rounded-xl border border-[#e5e5e5] p-5 mb-5">
  <h2 className="text-sm font-semibold text-[#1a1a1a] mb-1">Opponent slow-play threshold</h2>
  <p className="text-xs text-[#9b9b9b] mb-3">
    Highlight waiting games with an urgency indicator when the opponent hasn&apos;t moved in this many days.
  </p>
  <div className="flex items-center gap-3">
    <input
      type="number"
      min={1}
      max={90}
      value={opponentSlowDays}
      onChange={async e => {
        const val = Math.max(1, Math.min(90, parseInt(e.target.value) || 5))
        setOpponentSlowDays(val)
        await fetch('/api/prefs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ opponentSlowDays: val }),
        })
      }}
      className="w-20 bg-white text-[#1a1a1a] text-sm px-3 py-1.5 rounded-md border border-[#e5e5e5]"
    />
    <span className="text-sm text-[#6b6b6b]">days</span>
  </div>
</div>
```

- [ ] **Step 3: Verify in browser**

Run `npm run dev`, open http://localhost:3000/setup.

- The "Opponent slow-play threshold" card appears between the BGA sort cap and the platform list
- Change the value → saves immediately (same pattern as BGA sort cap)
- GET /api/prefs returns the new `opponentSlowDays` value

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts app/setup/page.tsx
git commit -m "feat: add opponentSlowDays pref with settings UI"
```

---

### Task 2: Apply slow-opponent urgency in GameCard

**Files:**
- Modify: `components/GameCard.tsx`
- Modify: `components/GameGrid.tsx`

**Interfaces:**
- Consumes: `opponentSlowDays: number` from prefs (passed via GameGrid)

- [ ] **Step 1: Add opponentSlowDays prop to GameCard and compute urgency**

Open `components/GameCard.tsx`. Add to Props:

```tsx
interface Props {
  game: Game
  pinned: boolean
  onTogglePin: (id: string) => void
  onDismiss: () => void
  opened: boolean
  onOpen: () => void
  opponentSlowDays: number
}
```

Destructure in function signature:

```tsx
export default function GameCard({ game, pinned, onTogglePin, onDismiss, opened, onOpen, opponentSlowDays }: Props) {
```

Compute `opponentSlow` right after `badgeClass`:

```tsx
const badgeClass = BADGE_COLORS[game.platform] ?? 'bg-[#f3f3f3] text-[#6b6b6b]'
const opponentSlow = !game.myTurn &&
  (Date.now() - game.lastMoveAt.getTime()) > opponentSlowDays * 86_400_000
```

Update the time label to apply urgency for both your-turn urgency and opponent slow-play. Replace the existing time `<span>`:

```tsx
<span className={`text-xs ${(game.urgent || opponentSlow) ? 'text-amber-500 font-medium' : 'text-[#9b9b9b]'}`}>
  {(game.urgent || opponentSlow) ? '⏱ ' : ''}{game.lastMoveAgo}
</span>
```

- [ ] **Step 2: Pass opponentSlowDays through GameGrid**

Open `components/GameGrid.tsx`. Add to the Props interface:

```tsx
interface Props {
  data: GamesApiResponse
  prefs: UserPrefs
  onPrefsChange: (p: UserPrefs) => void
  dismissed: Set<string>
  onDismiss: (id: string) => void
  onRefresh: () => void
  isRefreshing: boolean
  lastError: string | null
  cachedAt: string | null
  opened: Set<string>
  onOpen: (id: string) => void
  departedGames: DepartedGame[]
}
```

(No change needed in Props — `opponentSlowDays` comes from `prefs` which is already a prop.)

In both `myTurnGames.map` and `waitingGames.map`, add `opponentSlowDays` to `GameCard`:

```tsx
<GameCard
  key={g.id}
  game={g}
  pinned={prefs.pins.includes(g.id)}
  onTogglePin={togglePin}
  onDismiss={() => onDismiss(g.id)}
  opened={opened.has(g.id)}
  onOpen={() => onOpen(g.id)}
  opponentSlowDays={prefs.opponentSlowDays ?? 5}
/>
```

- [ ] **Step 3: Verify in browser**

Run `npm run dev`, open http://localhost:3000.

- In the "Waiting for others" section, any game with a `lastMoveAgo` value older than 5 days should show `⏱` prefix and amber text on the time label
- Games under the threshold should show normal grey text
- Go to Settings, change threshold to 1 day → more waiting games should turn amber on next refresh
- Your-turn games are unaffected by `opponentSlowDays`

- [ ] **Step 4: Commit**

```bash
git add components/GameCard.tsx components/GameGrid.tsx
git commit -m "feat: highlight waiting games where opponent exceeds slow-play threshold"
```
