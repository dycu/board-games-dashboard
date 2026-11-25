import { NextResponse } from 'next/server'
import { withBgaSession, fetchBgaTables, bgaApiHeaders } from '@/lib/connectors/bga'

export const dynamic = 'force-dynamic'

const BASE = 'https://boardgamearena.com'

export async function GET() {
  const username = process.env.BGA_USERNAME!
  const password = process.env.BGA_PASSWORD!
  const result = await withBgaSession(username, password, async s => {
    const tables = await fetchBgaTables(s)
    const res = await fetch(`${BASE}/`, { headers: bgaApiHeaders(s, `${BASE}/`) })
    const html = await res.text()
    const key = '"table_infos":{"tables":'
    const start = html.indexOf(key)
    let homepageTables: any[] = []
    let parseError: string | null = null
    if (start !== -1) {
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
            const json = html.slice(braceStart, i + 1)
            try { homepageTables = Object.values(JSON.parse(json)) } catch (e) { parseError = String(e) }
            break
          }
        }
      }
    } else {
      parseError = 'key not found'
    }
    return {
      tablesCount: tables.length,
      tableStatuses: tables.map((t: any) => t.status),
      homepageFound: start !== -1,
      homepageCount: homepageTables.length,
      homepageStatuses: homepageTables.map((t: any) => t.status),
      homepageNames: homepageTables.map((t: any) => t.game_name),
      parseError,
      htmlLength: html.length,
    }
  })
  return NextResponse.json(result)
}
