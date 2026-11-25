import { NextResponse } from 'next/server'
import { withBgaSession, bgaApiHeaders } from '@/lib/connectors/bga'

export const dynamic = 'force-dynamic'

const BASE = 'https://boardgamearena.com'

// Temporary: the earlier status=setup attempt failed with "Bad argument
// type: status should be a value from the enumeration (setup)" — "setup"
// is named as a valid member right there, so the single string may be the
// wrong *shape* (BGA wanting an array), not the wrong value. Trying a few
// request-body variants to find one that actually works.
async function tryBody(s: any, body: string) {
  const res = await fetch(`${BASE}/tablemanager/tablemanager/tableinfos.html`, {
    method: 'POST',
    headers: { ...bgaApiHeaders(s), 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body,
  })
  const text = await res.text()
  try {
    const data = JSON.parse(text)
    if (data.status !== 1) return { body, error: data.error ?? data }
    const tables: any[] = Object.values(data?.data?.tables ?? {})
    return { body, count: tables.length, tables: tables.map(t => ({ id: t.id, game_name: t.game_name, status: t.status })) }
  } catch {
    return { body, error: `non-JSON (${res.status}): ${text.slice(0, 150)}` }
  }
}

export async function GET() {
  const username = process.env.BGA_USERNAME!
  const password = process.env.BGA_PASSWORD!
  const html = await withBgaSession(username, password, async s => {
    const res = await fetch(`${BASE}/`, { headers: bgaApiHeaders(s, `${BASE}/`) })
    return res.text()
  })
  const idx = html.toLowerCase().indexOf('elpaso')
  // Walk backwards from the match to find the start of the enclosing JS
  // variable assignment / object literal, so we can see the actual key
  // this table data lives under.
  const back = html.slice(Math.max(0, idx - 4000), idx)
  const varMatch = [...back.matchAll(/(?:var|let|const)\s+(\w+)\s*=/g)].pop()
  return NextResponse.json({
    length: html.length,
    mentionsElPaso: idx !== -1,
    lastVarBeforeMatch: varMatch ? { name: varMatch[1], offsetBeforeMatch: back.length - (varMatch.index ?? 0) } : null,
    around: idx !== -1 ? html.slice(Math.max(0, idx - 800), idx + 400) : null,
  })
}
