import { NextResponse } from 'next/server'
import { withBgaSession, bgaApiHeaders, BgaSession } from '@/lib/connectors/bga'

// TEMPORARY debug route — remove once the "Waiting to start" BGA investigation
// is done. Reuses whatever BGA session the dashboard's own cron/fetches have
// already cached in KV, so this doesn't risk a fresh login (and BGA's
// anti-automation cooldown on one) just to answer "which status value does
// tableinfos.html actually accept for a lobby waiting on players".
const BASE = 'https://boardgamearena.com'

async function probeStatus(session: BgaSession, status: string) {
  const res = await fetch(`${BASE}/tablemanager/tablemanager/tableinfos.html`, {
    method: 'POST',
    headers: {
      ...bgaApiHeaders(session),
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: `status=${status}&turninfo=true`,
  })
  const text = await res.text()
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    return { status, error: `non-JSON HTTP ${res.status}: ${text.slice(0, 150)}` }
  }
  if (json.status !== 1) return { status, error: json.error ?? JSON.stringify(json).slice(0, 150) }
  const tables = Object.values(json.data?.tables ?? {}) as any[]
  return {
    status,
    count: tables.length,
    tables: tables.map(t => ({ id: t.id, game_name: t.game_name, bgaStatus: t.status, players: Object.keys(t.players ?? {}).length })),
  }
}

export async function GET() {
  const username = process.env.BGA_USERNAME
  const password = process.env.BGA_PASSWORD
  if (!username || !password) {
    return NextResponse.json({ error: 'BGA_USERNAME/BGA_PASSWORD not configured' }, { status: 500 })
  }

  try {
    const results = await withBgaSession(username, password, async session => {
      const candidates = ['setup', 'play', 'open', 'created', 'waiting']
      const out = []
      for (const status of candidates) out.push(await probeStatus(session, status))
      return out
    })
    return NextResponse.json({ results })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
