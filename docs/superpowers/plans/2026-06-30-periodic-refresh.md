# Periodic Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-tab, non-persistent auto-refresh select next to the refresh button on the Active tab, with 30s / 1m / 5m options and a live countdown.

**Architecture:** A new `useAutoRefresh` hook owns all timer state and logic (countdown, interval, pause-while-fetching, reset-on-complete). `GameGrid` calls the hook and renders the `<select>` and countdown badge in `navRight`. No persistence — plain `useState` only.

**Tech Stack:** React 19, Jest 30, `@testing-library/react` (renderHook + act), jsdom

## Global Constraints

- No localStorage or server persistence — state is ephemeral per browser tab.
- Feature applies to the Active tab (`/`) only — no changes to History tab.
- UI must match existing nav button style: `bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5]`, `text-xs`.
- Countdown badge hidden on mobile (`hidden sm:inline`).
- Run tests with: `npx jest` from `board-games-dashboard/`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `hooks/useAutoRefresh.ts` | All timer logic: countdown, pause, reset |
| Create | `hooks/__tests__/useAutoRefresh.test.ts` | Unit tests for the hook |
| Modify | `components/GameGrid.tsx` | Call hook, render select + countdown in navRight |

---

### Task 1: `useAutoRefresh` hook

**Files:**
- Create: `hooks/useAutoRefresh.ts`
- Create: `hooks/__tests__/useAutoRefresh.test.ts`

**Interfaces:**
- Produces:
  ```ts
  function useAutoRefresh(
    onRefresh: () => void,
    isRefreshing: boolean,
  ): {
    intervalSeconds: number      // 0 = Off
    setIntervalSeconds: (s: number) => void
    countdown: number            // seconds until next refresh; 0 when Off
  }
  ```

- [ ] **Step 1: Write the failing tests**

Create `hooks/__tests__/useAutoRefresh.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react'
import { useAutoRefresh } from '../useAutoRefresh'

describe('useAutoRefresh', () => {
  beforeEach(() => { jest.useFakeTimers() })
  afterEach(() => { jest.useRealTimers() })

  it('starts with Off state — intervalSeconds 0, countdown 0', () => {
    const onRefresh = jest.fn()
    const { result } = renderHook(() => useAutoRefresh(onRefresh, false))
    expect(result.current.intervalSeconds).toBe(0)
    expect(result.current.countdown).toBe(0)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('sets countdown to intervalSeconds immediately on activation', () => {
    const { result } = renderHook(() => useAutoRefresh(jest.fn(), false))
    act(() => { result.current.setIntervalSeconds(30) })
    expect(result.current.countdown).toBe(30)
  })

  it('counts down each second', () => {
    const { result } = renderHook(() => useAutoRefresh(jest.fn(), false))
    act(() => { result.current.setIntervalSeconds(30) })
    act(() => { jest.advanceTimersByTime(5000) })
    expect(result.current.countdown).toBe(25)
  })

  it('calls onRefresh when countdown reaches 0 and resets to intervalSeconds', () => {
    const onRefresh = jest.fn()
    const { result } = renderHook(() => useAutoRefresh(onRefresh, false))
    act(() => { result.current.setIntervalSeconds(30) })
    act(() => { jest.advanceTimersByTime(30000) })
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(result.current.countdown).toBe(30)
  })

  it('pauses countdown while isRefreshing is true', () => {
    const onRefresh = jest.fn()
    const { result, rerender } = renderHook(
      ({ r }: { r: boolean }) => useAutoRefresh(onRefresh, r),
      { initialProps: { r: false } },
    )
    act(() => { result.current.setIntervalSeconds(30) })
    act(() => { jest.advanceTimersByTime(10000) })
    expect(result.current.countdown).toBe(20)

    rerender({ r: true })
    act(() => { jest.advanceTimersByTime(15000) })
    expect(result.current.countdown).toBe(20) // paused — no decrement
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('resets countdown to full interval when refresh completes', () => {
    const onRefresh = jest.fn()
    const { result, rerender } = renderHook(
      ({ r }: { r: boolean }) => useAutoRefresh(onRefresh, r),
      { initialProps: { r: false } },
    )
    act(() => { result.current.setIntervalSeconds(30) })
    act(() => { jest.advanceTimersByTime(10000) })
    expect(result.current.countdown).toBe(20)

    rerender({ r: true })
    rerender({ r: false }) // refresh done
    expect(result.current.countdown).toBe(30)
  })

  it('resets countdown when interval changes mid-flight', () => {
    const { result } = renderHook(() => useAutoRefresh(jest.fn(), false))
    act(() => { result.current.setIntervalSeconds(30) })
    act(() => { jest.advanceTimersByTime(10000) })
    expect(result.current.countdown).toBe(20)

    act(() => { result.current.setIntervalSeconds(60) })
    expect(result.current.countdown).toBe(60)
  })

  it('stops countdown and clears it when switched to Off', () => {
    const onRefresh = jest.fn()
    const { result } = renderHook(() => useAutoRefresh(onRefresh, false))
    act(() => { result.current.setIntervalSeconds(30) })
    act(() => { jest.advanceTimersByTime(10000) })
    act(() => { result.current.setIntervalSeconds(0) })
    expect(result.current.countdown).toBe(0)

    act(() => { jest.advanceTimersByTime(30000) })
    expect(onRefresh).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they all fail**

```
cd board-games-dashboard
npx jest hooks/__tests__/useAutoRefresh.test.ts --no-coverage
```

Expected: all tests fail with `Cannot find module '../useAutoRefresh'`.

- [ ] **Step 3: Implement the hook**

Create `hooks/useAutoRefresh.ts`:

```ts
'use client'
import { useEffect, useRef, useState } from 'react'

export function useAutoRefresh(onRefresh: () => void, isRefreshing: boolean) {
  const [intervalSeconds, setIntervalSeconds] = useState(0)
  const [countdown, setCountdown] = useState(0)

  const isRefreshingRef = useRef(isRefreshing)
  const onRefreshRef = useRef(onRefresh)
  const wasRefreshingRef = useRef(false)

  useEffect(() => { isRefreshingRef.current = isRefreshing }, [isRefreshing])
  useEffect(() => { onRefreshRef.current = onRefresh }, [onRefresh])

  // Reset to full interval whenever a refresh completes (covers manual refresh)
  useEffect(() => {
    if (!isRefreshing && wasRefreshingRef.current && intervalSeconds > 0) {
      setCountdown(intervalSeconds)
    }
    wasRefreshingRef.current = isRefreshing
  }, [isRefreshing, intervalSeconds])

  // Start/restart ticker whenever the selected interval changes
  useEffect(() => {
    if (intervalSeconds === 0) {
      setCountdown(0)
      return
    }
    setCountdown(intervalSeconds)
    const id = setInterval(() => {
      if (isRefreshingRef.current) return
      setCountdown(prev => {
        if (prev <= 1) {
          onRefreshRef.current()
          return intervalSeconds
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [intervalSeconds])

  return { intervalSeconds, setIntervalSeconds, countdown }
}
```

- [ ] **Step 4: Run tests to confirm they all pass**

```
npx jest hooks/__tests__/useAutoRefresh.test.ts --no-coverage
```

Expected: 7 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```
git add hooks/useAutoRefresh.ts hooks/__tests__/useAutoRefresh.test.ts
git commit -m "feat: add useAutoRefresh hook with countdown and pause-while-fetching"
```

---

### Task 2: Wire hook into GameGrid UI

**Files:**
- Modify: `components/GameGrid.tsx`

**Interfaces:**
- Consumes from Task 1:
  ```ts
  import { useAutoRefresh } from '@/hooks/useAutoRefresh'
  // returns: { intervalSeconds, setIntervalSeconds, countdown }
  ```

- [ ] **Step 1: Update `components/GameGrid.tsx`**

Replace the existing `navRight` block and add the hook call. The full diff to apply:

1. Add import at the top of the file (after existing imports):
```ts
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
```

2. Inside the `GameGrid` component body, before `const navRight = (`, add:
```ts
const { intervalSeconds, setIntervalSeconds, countdown } = useAutoRefresh(onRefresh, isRefreshing)
```

3. Replace the existing `navRight` const entirely:
```tsx
const navRight = (
  <>
    <span className="hidden sm:inline">
      {games.length}{' '}active &nbsp;·&nbsp;
      <span className="text-[#5e6ad2] font-medium">{myTurnCount}{' '}your turn</span>
    </span>
    <button
      onClick={onRefresh}
      disabled={isRefreshing}
      className="bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb] disabled:opacity-50 disabled:cursor-not-allowed px-2.5 py-1 rounded-md flex items-center gap-1">
      <span className={isRefreshing ? 'animate-spin inline-block' : ''}>↻</span>
      <span className="hidden sm:inline">Refresh</span>
    </button>
    {intervalSeconds > 0 && (
      <span className="hidden sm:inline">{countdown}s</span>
    )}
    <select
      value={intervalSeconds}
      onChange={e => setIntervalSeconds(Number(e.target.value))}
      className="bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb] text-xs px-2 py-1 rounded-md cursor-pointer"
    >
      <option value={0}>Off</option>
      <option value={30}>30s</option>
      <option value={60}>1m</option>
      <option value={300}>5m</option>
    </select>
  </>
)
```

- [ ] **Step 2: Run the full test suite to confirm nothing broke**

```
npx jest --no-coverage
```

Expected: all existing tests pass plus the 7 new hook tests.

- [ ] **Step 3: Verify in the browser**

Start the dev server:
```
npm run dev
```

Open `http://localhost:3000`. Confirm:
- Select shows "Off" by default.
- Changing to "30s" starts a visible `30s → 29s → …` countdown next to the select.
- When countdown hits 0, the page refreshes (spinner appears) and countdown resets to 30.
- Clicking Refresh manually resets the countdown to the full interval once the fetch completes.
- Switching to "Off" clears the countdown immediately and stops auto-refresh.
- Opening a new tab resets to Off.
- History tab (`/overview`) is unaffected.

- [ ] **Step 4: Commit**

```
git add components/GameGrid.tsx
git commit -m "feat: add periodic refresh selector to Active tab nav"
```
