import { getEvents, getSeenAt, setSeenAt } from '@/lib/newGames/store'

export const dynamic = 'force-dynamic'

// GET: events found since the popup was last dismissed (newest first)
export async function GET() {
  try {
    const [events, seenAt] = await Promise.all([getEvents(), getSeenAt()])
    return Response.json({ events: seenAt ? events.filter(e => e.at > seenAt) : events, seenAt })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// POST { seenUpTo }: dismiss everything found up to that time. The client sends
// the newest event time it showed, so events found meanwhile still pop up later.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const seenUpTo = typeof body?.seenUpTo === 'string' && !Number.isNaN(Date.parse(body.seenUpTo)) ? body.seenUpTo : new Date().toISOString()
    const current = await getSeenAt()
    if (!current || seenUpTo > current) await setSeenAt(seenUpTo)
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
