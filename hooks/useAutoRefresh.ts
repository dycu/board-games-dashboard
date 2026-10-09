'use client'
import { useEffect, useRef, useState } from 'react'

export function useAutoRefresh(onRefresh: () => void, isRefreshing: boolean) {
  // Off by default: background refreshes get in the way of dimming opened games
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- interval turned off
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
