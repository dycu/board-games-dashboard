import { NextRequest, NextResponse } from 'next/server'
import { Platform, PLATFORM_LABELS } from '@/lib/types'
import { addItem, removeItem, reorderItems, backlogId, moveToList, BACKLOG_LISTS, BacklogList } from '@/lib/backlog/list'
import { getBacklog, updateBacklog } from '@/lib/backlog/store'
import { resolvePlayUrl } from '@/lib/backlog/playUrl'
import { getCatalog } from '@/lib/catalogs/cache'

export const dynamic = 'force-dynamic'

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET() {
  try {
    return NextResponse.json({ items: await getBacklog() })
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500)
  }
}

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return fail('Invalid JSON')
  }

  try {
    if (body?.op === 'add') {
      const platform = body.platform as Platform
      const gameName = typeof body.gameName === 'string' ? body.gameName.trim() : ''
      if (!(platform in PLATFORM_LABELS) || !gameName) return fail('platform and gameName are required')
      const playUrl = await resolvePlayUrl({ platform, gameName, playUrl: body.playUrl, gameUrl: body.gameUrl }, getCatalog)
      const list: BacklogList = BACKLOG_LISTS.includes(body.list) ? body.list : 'play'
      const item = { id: backlogId(platform, gameName), platform, gameName, playUrl, addedAt: new Date().toISOString(), list }
      return NextResponse.json({ items: await updateBacklog(list => addItem(list, item)) })
    }
    if (body?.op === 'remove' && typeof body.id === 'string') {
      return NextResponse.json({ items: await updateBacklog(list => removeItem(list, body.id)) })
    }
    if (body?.op === 'move' && typeof body.id === 'string' && BACKLOG_LISTS.includes(body.list)) {
      return NextResponse.json({ items: await updateBacklog(list => moveToList(list, body.id, body.list)) })
    }
    if (body?.op === 'order' && Array.isArray(body.ids)) {
      return NextResponse.json({ items: await updateBacklog(list => reorderItems(list, body.ids)) })
    }
    return fail('Unknown op')
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500)
  }
}
