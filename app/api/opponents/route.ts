import { NextRequest, NextResponse } from 'next/server'
import { Platform } from '@/lib/types'
import { getOpponents, setTags, setHidden } from '@/lib/opponents/store'

export const dynamic = 'force-dynamic'

const PLATFORMS: Platform[] = ['bga', 'eighteenxx', 'obg', 'yucata', 'choochoo', 'hansa', 'rally', 'oldkingscrown', 'boardgamers', 'boardtogether']

export async function GET() {
  try {
    const entries = await Promise.all(PLATFORMS.map(p => getOpponents(p)))
    const byPlatform = Object.fromEntries(PLATFORMS.map((p, i) => [p, entries[i]]))
    return NextResponse.json({ byPlatform })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  let body: { platform?: unknown; name?: unknown; tags?: unknown; hidden?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { platform, name, tags, hidden } = body
  if (typeof platform !== 'string' || !PLATFORMS.includes(platform as Platform) || typeof name !== 'string' || !name) {
    return NextResponse.json({ error: 'platform and name are required' }, { status: 400 })
  }
  const hasTags = tags !== undefined
  const hasHidden = hidden !== undefined
  if (!hasTags && !hasHidden) {
    return NextResponse.json({ error: 'tags (string[]) or hidden (boolean) is required' }, { status: 400 })
  }
  if (hasTags && (!Array.isArray(tags) || !tags.every(t => typeof t === 'string'))) {
    return NextResponse.json({ error: 'tags must be a string[]' }, { status: 400 })
  }
  if (hasHidden && typeof hidden !== 'boolean') {
    return NextResponse.json({ error: 'hidden must be a boolean' }, { status: 400 })
  }
  try {
    if (hasTags) await setTags(platform as Platform, name, tags as string[])
    if (hasHidden) await setHidden(platform as Platform, name, hidden as boolean)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
