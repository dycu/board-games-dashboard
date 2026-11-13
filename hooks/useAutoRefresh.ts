'use client'
import { useEffect, useRef, useState } from 'react'

export function useAutoRefresh(onRefresh: () => void, isRefreshing: boolean, savedIntervalSeconds?: number, lastFetchedAt?: string) {
  // Off by default: background refreshes get in the way of dimming opened games
  const [intervalSeconds, setIntervalSeconds] = useState(0)
  const [countdown, setCountdown] = useState(0)

  const isRefreshingRef = useRef(isRefreshing)
  const onRefreshRef = useRef(onRefresh)
  const lastFetchedAtRef = useRef(lastFetchedAt)
  const wasRefreshingRef = useRef(false)
  const hydrated = useRef(false)

  useEffect(() => { isRefreshingRef.current = isRefreshing }, [isRefreshing])
  useEffect(() => { onRefreshRef.current = onRefresh }, [onRefresh])
  useEffect(() => { lastFetchedAtRef.current = lastFetchedAt }, [lastFetchedAt])

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
  // see the visibilitychange effect below, which is what actually catches
  // the dashboard back up once it's looked at again, rather than this timer
  // having kept firing unseen the whole time it was backgrounded.
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

  // Catches the dashboard up once it's actually stale, rather than on
  // whatever was last shown before it was backgrounded — the ticker above
  // does nothing while hidden, so without this a tab left in the background
  // a long time would just show year-old-feeling data indefinitely. But a
  // brief glance away (switching apps, a notification) shouldn't pay for a
  // full refresh of every platform just because the tab came back — only
  // refresh when the data is actually older than the refresh interval;
  // otherwise just let the countdown continue from where it would be.
  useEffect(() => {
    if (intervalSeconds === 0) return
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      if (isRefreshingRef.current) { setCountdown(intervalSeconds); return }

      const fetchedMs = lastFetchedAtRef.current ? Date.parse(lastFetchedAtRef.current) : NaN
      const staleForMs = Number.isNaN(fetchedMs) ? Infinity : Date.now() - fetchedMs

      if (staleForMs >= intervalSeconds * 1000) {
        onRefreshRef.current()
        setCountdown(intervalSeconds)
      } else {
        setCountdown(Math.max(1, intervalSeconds - Math.floor(staleForMs / 1000)))
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [intervalSeconds])

  return { intervalSeconds, setIntervalSeconds, countdown }
}
