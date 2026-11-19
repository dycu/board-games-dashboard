import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { Platform } from '@/lib/types'
import { getAchievements, putAchievements, Achievement } from '@/lib/achievements/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json({ achievements: await getAchievements() })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  let body: { platform?: unknown; gameType?: unknown; metric?: unknown; target?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { platform, gameType, metric, target } = body
  if ((platform !== null && typeof platform !== 'string')
    || typeof gameType !== 'string' || !gameType.trim()
    || (metric !== 'played' && metric !== 'won')
    || typeof target !== 'number' || !Number.isFinite(target) || target < 1) {
    return NextResponse.json({ error: 'platform (string or null), gameType, metric ("played"|"won") and a positive target are required' }, { status: 400 })
  }
  try {
    const achievement: Achievement = {
      id: randomUUID(),
      platform: platform as Platform | null,
      gameType: gameType.trim(),
      metric,
      target: Math.floor(target),
      createdAt: new Date().toISOString(),
    }
    const current = await getAchievements()
    await putAchievements([...current, achievement])
    return NextResponse.json({ achievement })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// Marks any of the given ids as achieved now — used by the client once it
// notices (from the finished-games list it already has) that a goal's
// target was reached. Silently skips ids that don't exist or are already
// marked, so a duplicate call from two pages checking at once is harmless.
export async function PATCH(req: NextRequest) {
  let body: { ids?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { ids } = body
  if (!Array.isArray(ids) || !ids.every(i => typeof i === 'string')) {
    return NextResponse.json({ error: 'ids (string[]) is required' }, { status: 400 })
  }
  try {
    const current = await getAchievements()
    const now = new Date().toISOString()
    const updated = current.map(a => ids.includes(a.id) && !a.achievedAt ? { ...a, achievedAt: now } : a)
    await putAchievements(updated)
    return NextResponse.json({ achievements: updated })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  let body: { id?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (typeof body.id !== 'string') {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }
  try {
    const current = await getAchievements()
    await putAchievements(current.filter(a => a.id !== body.id))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
