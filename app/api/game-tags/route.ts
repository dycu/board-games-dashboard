import { NextRequest, NextResponse } from 'next/server'
import { Platform, PLATFORM_LABELS } from '@/lib/types'
import { getGameTags, setGameTags } from '@/lib/gameTags/store'

export const dynamic = 'force-dynamic'

const PLATFORMS = Object.keys(PLATFORM_LABELS) as Platform[]

export async function GET() {
  try {
    const entries = await Promise.all(PLATFORMS.map(p => getGameTags(p)))
    const byPlatform = Object.fromEntries(PLATFORMS.map((p, i) => [p, entries[i]]))
    return NextResponse.json({ byPlatform })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  let body: { platform?: unknown; gameName?: unknown; tags?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { platform, gameName, tags } = body
  if (typeof platform !== 'string' || !PLATFORMS.includes(platform as Platform) || typeof gameName !== 'string' || !gameName) {
    return NextResponse.json({ error: 'platform and gameName are required' }, { status: 400 })
  }
  if (!Array.isArray(tags) || !tags.every(t => typeof t === 'string')) {
    return NextResponse.json({ error: 'tags must be a string[]' }, { status: 400 })
  }
  try {
    await setGameTags(platform as Platform, gameName, tags as string[])
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
