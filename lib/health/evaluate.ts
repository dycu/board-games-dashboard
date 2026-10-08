import { Platform, PLATFORM_LABELS } from '../types'

export interface PlatformResult {
  platform: Platform
  count?: number  // games fetched, when it worked
  error?: string
}

export interface PlatformHealth {
  error?: string
  failingSince?: string  // ISO; set while the platform keeps failing
  lastOkAt?: string
  lastOkCount?: number
}

export type HealthState = Partial<Record<Platform, PlatformHealth>>

export interface Alert {
  platform: Platform
  kind: 'broken' | 'recovered' | 'emptied'
  message: string
}

// Fewer games than this before dropping to zero isn't suspicious enough to email about
const EMPTIED_FROM = 3

// Alerts only on changes (a platform starting or stopping to fail, or its games
// suddenly vanishing), so a platform that stays broken sends one email, not one a day
export function evaluateHealth(results: PlatformResult[], prev: HealthState, now: string): { state: HealthState; alerts: Alert[] } {
  const state: HealthState = {}
  const alerts: Alert[] = []

  for (const r of results) {
    const before = prev[r.platform] ?? {}
    const label = PLATFORM_LABELS[r.platform]
    if (r.error !== undefined) {
      state[r.platform] = { ...before, error: r.error, failingSince: before.failingSince ?? now }
      if (!before.failingSince) alerts.push({ platform: r.platform, kind: 'broken', message: `${label} stopped working: ${r.error}` })
      continue
    }
    const count = r.count ?? 0
    if (before.failingSince) {
      alerts.push({ platform: r.platform, kind: 'recovered', message: `${label} works again (${count} games)` })
    } else if (count === 0 && (before.lastOkCount ?? 0) >= EMPTIED_FROM) {
      alerts.push({
        platform: r.platform,
        kind: 'emptied',
        message: `${label} returned no games (${before.lastOkCount} last time). If you still have games there, its page has probably changed.`,
      })
    }
    state[r.platform] = { lastOkAt: now, lastOkCount: count }
  }

  return { state, alerts }
}
