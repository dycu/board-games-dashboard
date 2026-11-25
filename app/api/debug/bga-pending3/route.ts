import { NextResponse } from 'next/server'
import { withBgaSession, fetchBgaTables, bgaApiHeaders } from '@/lib/connectors/bga'

export const dynamic = 'force-dynamic'
const BASE = 'https://boardgamearena.com'

function extractHomepageTables(html: string): any[] {
  const key = '"table_infos":{"tables":'
  const start = html.indexOf(key)
  if (start === -1) return []
  const braceStart = start + key.length
  let depth = 0, inString = false, escaped = false
  for (let i = braceStart; i < html.length; i++) {
    const c = html[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        try { return Object.values(JSON.parse(html.slice(braceStart, i + 1))) } catch { return [] }
      }
    }
  }
  return []
}

export async function GET() {
  const username = process.env.BGA_USERNAME!
  const password = process.env.BGA_PASSWORD!
  const result = await withBgaSession(username, password, async s => {
    const tableinfos = await fetchBgaTables(s)
    const res = await fetch(`${BASE}/`, { headers: bgaApiHeaders(s, `${BASE}/`) })
    const homepage = extractHomepageTables(await res.text())
    return { tableinfos, homepage }
  })
  const summarize = (t: any) => ({ id: t.id, game_name: t.game_name, status: t.status })
  return NextResponse.json({
    tableinfosCount: result.tableinfos.length,
    homepageCount: result.homepage.length,
    tableinfos: result.tableinfos.map(summarize),
    homepage: result.homepage.map(summarize),
  })
}
