import { withYucataSession } from '@/lib/connectors/yucata'

// TEMPORARY — confirmed the datatables POST itself is what hangs (not
// login, not the lobby-page scrape). Now checking whether a smaller
// `length` than the connector's usual 300 avoids the hang. Remove once
// diagnosed.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BASE = 'https://www.yucata.de'

export async function GET(request: Request) {
  const username = process.env.YUCATA_USERNAME
  const password = process.env.YUCATA_PASSWORD
  if (!username || !password) return Response.json({ error: 'no credentials configured' }, { status: 500 })
  const length = Number(new URL(request.url).searchParams.get('length') ?? '300')

  const startedAt = Date.now()
  try {
    const result = await withYucataSession(username, password, async jar => {
      const cookieHeader = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
      const headers = { Cookie: cookieHeader, 'User-Agent': 'Mozilla/5.0', Referer: `${BASE}/en/Overview` }

      const overviewStarted = Date.now()
      const overviewRes = await fetch(`${BASE}/en/Overview`, { headers: { ...headers, Accept: 'text/html' } })
      const overviewHtml = await overviewRes.text()
      const overviewMs = Date.now() - overviewStarted
      const userId = overviewHtml.match(/var\s+UserID\s*=\s*['"]?(\d+)/)?.[1]
      if (!userId) throw new Error('no user id')

      const tableStarted = Date.now()
      const res = await fetch(`${BASE}/api/datatables/${userId}/ranking-details`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json' },
        body: JSON.stringify({ draw: 1, start: 0, length, oppId: -1, gameType: -1, fromDate: '', toDate: '' }),
      })
      const tableMs = Date.now() - tableStarted
      const data = res.ok ? await res.json() : null
      return { overviewMs, tableMs, tableStatus: res.status, recordsTotal: data?.recordsTotal, rows: data?.data?.length }
    })
    return Response.json({ ok: true, length, totalMs: Date.now() - startedAt, ...result })
  } catch (e) {
    return Response.json({
      ok: false,
      length,
      totalMs: Date.now() - startedAt,
      error: e instanceof Error ? e.message : String(e),
    })
  }
}
