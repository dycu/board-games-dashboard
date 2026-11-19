import { NextRequest, NextResponse } from 'next/server'
import { Platform } from '@/lib/types'
import { getOpponents, setTags } from '@/lib/opponents/store'

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
  let body: { platform?: unknown; name?: unknown; tags?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { platform, name, tags } = body
  if (typeof platform !== 'string' || !PLATFORMS.includes(platform as Platform)
    || typeof name !== 'string' || !name
    || !Array.isArray(tags) || !tags.every(t => typeof t === 'string')) {
    return NextResponse.json({ error: 'platform, name and tags (string[]) are required' }, { status: 400 })
  }
  try {
    await setTags(platform as Platform, name, tags)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
