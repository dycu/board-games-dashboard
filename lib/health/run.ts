import { kv } from '@vercel/kv'
import { PLATFORM_LABELS } from '../types'
import { evaluateHealth, HealthState, PlatformResult, Alert } from './evaluate'
import { sendAlertEmail } from './email'

const STATE_KEY = 'health:v1'

export interface HealthReport {
  checkedAt: string
  results: PlatformResult[]
  alerts: Alert[]
  email: { sent: boolean; reason?: string } | null
  state: HealthState
}

// Reads /api/games' event stream: one 'platform' event per site
export function parseGamesStream(body: string): PlatformResult[] {
  const results: PlatformResult[] = []
  let done = false
  for (const chunk of body.split('\n\n')) {
    if (!chunk.startsWith('data: ')) continue
    let event: { type?: string; platform?: PlatformResult['platform']; games?: unknown[]; error?: string | null }
    try { event = JSON.parse(chunk.slice(6)) } catch { continue }
    if (event.type === 'platform' && event.platform) {
      results.push(event.error
        ? { platform: event.platform, error: event.error }
        : { platform: event.platform, count: event.games?.length ?? 0 })
    } else if (event.type === 'done') {
      done = true
    }
  }
  if (!done) throw new Error('/api/games stream ended without a done event')
  return results
}

// Runs the same fetch the dashboard does (so proxies, prefs and validation all
// apply), compares with the last check and emails about what changed
export async function runHealthCheck(origin: string, authorization: string, options: { forceEmail?: boolean } = {}): Promise<HealthReport> {
  const checkedAt = new Date().toISOString()
  let results: PlatformResult[]
  try {
    const res = await fetch(`${origin}/api/games`, { headers: { Authorization: authorization } })
    if (!res.ok) throw new Error(`/api/games HTTP ${res.status}`)
    results = parseGamesStream(await res.text())
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const email = await sendAlertEmail('Board games dashboard: health check failed', `The daily check couldn't load the dashboard's games at all:\n\n${message}`)
    return { checkedAt, results: [], alerts: [], email, state: {} }
  }

  const prev = (await kv.get<HealthState>(STATE_KEY).catch(() => null)) ?? {}
  const { state, alerts } = evaluateHealth(results, prev, checkedAt)
  await kv.set(STATE_KEY, state).catch(() => {})

  let email: HealthReport['email'] = null
  if (alerts.length > 0 || options.forceEmail) {
    const broken = alerts.filter(a => a.kind !== 'recovered')
    const subject = alerts.length === 0
      ? 'Board games dashboard: test alert'
      : broken.length > 0
        ? `Board games dashboard: ${broken.map(a => PLATFORM_LABELS[a.platform]).join(', ')} needs a look`
        : `Board games dashboard: ${alerts.map(a => PLATFORM_LABELS[a.platform]).join(', ')} working again`
    const lines = alerts.length > 0 ? alerts.map(a => `• ${a.message}`) : ['No problems found — this is just a test that alerts reach you.']
    const status = results.map(r => `${PLATFORM_LABELS[r.platform]}: ${r.error ? `ERROR ${r.error}` : `${r.count} games`}`)
    email = await sendAlertEmail(subject, `${lines.join('\n')}\n\nAll platforms:\n${status.join('\n')}`)
  }

  return { checkedAt, results, alerts, email, state }
}

export async function readHealthState(): Promise<HealthState> {
  return (await kv.get<HealthState>(STATE_KEY).catch(() => null)) ?? {}
}
