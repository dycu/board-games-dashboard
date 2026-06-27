import { Game } from '../types'

const BASE = 'https://rallythetroops.com'

export async function fetchRally(_username: string, _password: string): Promise<Game[]> {
  // rallythetroops.com returns 403/502 from Vercel IPs — server appears to be down
  const r = await fetch(`${BASE}/`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    redirect: 'manual',
  })
  if (!r.ok && r.status !== 301 && r.status !== 302) {
    throw new Error(`Rally the Troops unreachable (HTTP ${r.status})`)
  }
  return []
}
