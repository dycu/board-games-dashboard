import { withBgaSession, bgaApiHeaders, BgaSession } from '@/lib/connectors/bga'
import { getTables } from '@/lib/pace/store'

export const runtime = 'edge'

const BASE = 'https://boardgamearena.com'

async function getJson(url: string, session: BgaSession): Promise<any> {
  const res = await fetch(url, { headers: bgaApiHeaders(session) })
  const text = await res.text()
  const json = JSON.parse(text)
  return json.data
}

async function fetchFinishedPage(session: BgaSession, page: number): Promise<any[]> {
  const data = await getJson(
    `${BASE}/gamestats/gamestats/getGames.html?player=${session.myId}&opponent_id=0&finished=1&page=${page}&updateStats=0`,
    session,
  )
  return data?.tables ?? []
}

export async function GET() {
  const username = process.env.BGA_USERNAME ?? ''
  const password = process.env.BGA_PASSWORD ?? ''

  const paxRows: any[] = []
  let totalRowsSeen = 0
  let oldestStart = Infinity
  let pagesRead = 0
  const deadline = Date.now() + 20000
  await withBgaSession(username, password, async session => {
    for (let page = 1; page <= 200 && Date.now() < deadline; page++) {
      const rows = await fetchFinishedPage(session, page)
      if (rows.length === 0) break
      pagesRead = page
      totalRowsSeen += rows.length
      for (const r of rows) {
        oldestStart = Math.min(oldestStart, Number(r.start))
        if (r.game_name === 'paxrenaissance') {
          paxRows.push({ id: r.table_id, start: Number(r.start), end: Number(r.end), cancelled: r.cancelled })
        }
      }
    }
  })

  const tables = await getTables()
  const trackedIds = new Set(Object.values(tables).filter(t => t.game === 'paxrenaissance').map(t => t.id))

  return new Response(JSON.stringify({
    pagesRead,
    totalRowsSeen,
    oldestStartDate: new Date(oldestStart * 1000).toISOString(),
    daysBack: Math.round((Date.now() / 1000 - oldestStart) / 86400),
    paxRowsFoundOnBga: paxRows.length,
    trackedInKv: trackedIds.size,
    missingFromKv: paxRows.filter(r => !trackedIds.has(String(r.id))),
    allPaxRows: paxRows,
  }, null, 2), { headers: { 'Content-Type': 'application/json' } })
}
