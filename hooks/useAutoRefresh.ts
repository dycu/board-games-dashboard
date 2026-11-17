'use client'
import { useEffect, useRef, useState } from 'react'

export function useAutoRefresh(onRefresh: () => void, isRefreshing: boolean, savedIntervalSeconds?: number) {
  // Off by default: background refreshes get in the way of dimming opened games
  const [intervalSeconds, setIntervalSeconds] = useState(0)
  const [countdown, setCountdown] = useState(0)

  const isRefreshingRef = useRef(isRefreshing)
  const onRefreshRef = useRef(onRefresh)
  const wasRefreshingRef = useRef(false)
  const hydrated = useRef(false)

  useEffect(() => { isRefreshingRef.current = isRefreshing }, [isRefreshing])
  useEffect(() => { onRefreshRef.current = onRefresh }, [onRefresh])

  // savedIntervalSeconds arrives asynchronously (prefs load from localStorage,
  // then the server) — adopt it once, the first time it's defined, so a later
  // user-driven setIntervalSeconds call isn't fought by a stale prefs re-render.
  useEffect(() => {
    if (hydrated.current || savedIntervalSeconds === undefined) return
    hydrated.current = true
    if (savedIntervalSeconds !== intervalSeconds) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time adoption of the async-loaded saved prefs value
      setIntervalSeconds(savedIntervalSeconds)
    }
  }, [savedIntervalSeconds, intervalSeconds])

  // Reset to full interval whenever a refresh completes (covers manual refresh)
  useEffect(() => {
    if (!isRefreshing && wasRefreshingRef.current && intervalSeconds > 0) {
      setCountdown(intervalSeconds)
    }
    wasRefreshingRef.current = isRefreshing
  }, [isRefreshing, intervalSeconds])

  // Start/restart ticker whenever the selected interval changes. Frozen
  // (not ticking down, so never fires) while the tab is in the background —
  // app/page.tsx's own presence effect is what catches the dashboard up
  // once it's looked at again (it needs to anyway, to decide whether a
  // played game's platform needs refreshing), rather than this timer having
  // kept firing unseen the whole time it was backgrounded. Keeping that
  // decision in one place avoids a second, separate refresh racing it.
  useEffect(() => {
    if (intervalSeconds === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- interval turned off
      setCountdown(0)
      return
    }
    setCountdown(intervalSeconds)
    const id = setInterval(() => {
      if (isRefreshingRef.current || document.hidden) return
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
