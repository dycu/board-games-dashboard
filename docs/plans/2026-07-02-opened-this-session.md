# Opened-This-Session Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visually dim game cards the user has already clicked "Open →" on during the current browser session, so they can tell at a glance which games they've already visited.

**Architecture:** Pure client-side. `app/page.tsx` owns `opened: Set<string>` in React state, seeded from `sessionStorage` on mount and cleared when fresh server data arrives. An `handleOpen(id)` callback writes to both state and sessionStorage. Threaded through GameGrid → GameCard.

**Tech Stack:** React useState/useEffect, sessionStorage, TypeScript, Tailwind CSS

## Global Constraints
- No backend changes
- `sessionStorage` clears automatically on tab close — correct behavior
- Opened state clears on fresh server data (same trigger as dismissed state at `freshDataVersion` change)
- Opened card stays in the list and remains fully interactive — it's dimmed, not hidden

---

### Task 1: Add opened state + handler + thread through to GameCard

**Files:**
- Modify: `app/page.tsx`
- Modify: `components/GameGrid.tsx`
- Modify: `components/GameCard.tsx`

**Interfaces:**
- Produces: `opened: Set<string>` + `onOpen: (id: string) => void` on GameGrid; `opened: boolean` + `onOpen: () => void` on GameCard

- [ ] **Step 1: Add opened state and handler to app/page.tsx**

Open `app/page.tsx`. Add the storage key constant after `DISMISSED_KEY`:

```tsx
const OPENED_KEY = 'opened-games'
```

Add state after the `dismissed` state declaration:

```tsx
const [opened, setOpened] = useState<Set<string>>(new Set())
```

In the first `useEffect` (the one that loads dismissed from localStorage and fetches prefs), add sessionStorage loading:

```tsx
useEffect(() => {
  const stored = localStorage.getItem(DISMISSED_KEY)
  setDismissed(stored ? new Set(JSON.parse(stored)) : new Set())
  const storedOpened = sessionStorage.getItem(OPENED_KEY)
  setOpened(storedOpened ? new Set(JSON.parse(storedOpened)) : new Set())
  fetch('/api/prefs').then(r => r.json()).then(setPrefs).catch(() => {})
}, [])
```

In the `useEffect` that watches `freshDataVersion`, also clear opened:

```tsx
useEffect(() => {
  if (freshDataVersion === 0) return
  setDismissed(new Set())
  localStorage.removeItem(DISMISSED_KEY)
  setOpened(new Set())
  sessionStorage.removeItem(OPENED_KEY)
}, [freshDataVersion])
```

Add a handler after `handleDismiss`:

```tsx
const handleOpen = (id: string) => {
  setOpened(prev => {
    const next = new Set(prev)
    next.add(id)
    sessionStorage.setItem(OPENED_KEY, JSON.stringify([...next]))
    return next
  })
}
```

Pass to `GameGrid` (add two props to the existing JSX):

```tsx
<GameGrid
  data={displayedData}
  prefs={prefs}
  onPrefsChange={setPrefs}
  dismissed={dismissed}
  onDismiss={handleDismiss}
  onRefresh={triggerRefresh}
  isRefreshing={isRefreshing}
  lastError={lastError}
  cachedAt={cachedAt}
  opened={opened}
  onOpen={handleOpen}
/>
```

- [ ] **Step 2: Update GameGrid Props and thread to GameCard**

Open `components/GameGrid.tsx`. Add to the `Props` interface:

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
}
```

Destructure in the function signature:

```tsx
export default function GameGrid({ data, prefs, onPrefsChange, dismissed, onDismiss, onRefresh, isRefreshing, lastError, cachedAt, opened, onOpen }: Props) {
```

In the `myTurnGames.map` call, add the two new props to GameCard:

```tsx
{myTurnGames.map(g => (
  <GameCard
    key={g.id}
    game={g}
    pinned={prefs.pins.includes(g.id)}
    onTogglePin={togglePin}
    onDismiss={() => onDismiss(g.id)}
    opened={opened.has(g.id)}
    onOpen={() => onOpen(g.id)}
  />
))}
```

In the `waitingGames.map` call, same addition:

```tsx
{waitingGames.map(g => (
  <GameCard
    key={g.id}
    game={g}
    pinned={prefs.pins.includes(g.id)}
    onTogglePin={togglePin}
    onDismiss={() => onDismiss(g.id)}
    opened={opened.has(g.id)}
    onOpen={() => onOpen(g.id)}
  />
))}
```

- [ ] **Step 3: Update GameCard to accept and apply opened state**

Open `components/GameCard.tsx`. Replace the Props interface:

```tsx
interface Props {
  game: Game
  pinned: boolean
  onTogglePin: (id: string) => void
  onDismiss: () => void
  opened: boolean
  onOpen: () => void
}
```

Update the function signature:

```tsx
export default function GameCard({ game, pinned, onTogglePin, onDismiss, opened, onOpen }: Props) {
```

Add `opacity-60` when opened to the outer div's className (add as a final interpolation):

```tsx
<div className={`rounded-lg border p-3.5 flex flex-col gap-2.5 transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.05)]
  ${game.myTurn
    ? 'bg-white border-[#e5e5e5] border-l-[3px] border-l-[#5e6ad2]'
    : 'bg-[#fafafa] border-[#e5e5e5] hover:border-[#d5d5d5]'}
  ${opened ? 'opacity-60' : ''}`}>
```

Update the "Open →" anchor to fire `onOpen` and change its label when opened:

```tsx
<a
  href={game.gameUrl}
  target={game.platform === 'bga' ? '_self' : '_blank'}
  rel="noopener noreferrer"
  aria-label="Open game"
  onClick={onOpen}
  className={`text-xs font-medium px-3 py-1 rounded-md transition-colors
    ${game.myTurn
      ? 'bg-[#5e6ad2] text-white hover:bg-[#4f5ab8]'
      : 'bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb]'}`}>
  {opened ? '↗ Open' : 'Open →'}
</a>
```

- [ ] **Step 4: Verify in browser**

Run `npm run dev`, open http://localhost:3000.

- Click "Open →" on any card → card dims to ~60% opacity, button shows "↗ Open"
- Click "↗ Open" again → still dimmed (idempotent)
- Dismiss a dimmed card with "✓ Done" → disappears normally
- Click "↻ Refresh" or wait for auto-refresh to fire → all dimming clears
- Open a new tab to the dashboard → no cards dimmed (sessionStorage cleared on tab close)

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx components/GameGrid.tsx components/GameCard.tsx
git commit -m "feat: dim game cards already opened in this session"
```
