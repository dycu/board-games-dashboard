import { NextRequest, NextResponse } from 'next/server'
import { getPrefs, savePrefs } from '@/lib/prefs'

export async function GET() {
  const prefs = await getPrefs()
  return NextResponse.json(prefs)
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  try {
    await savePrefs(body as Parameters<typeof savePrefs>[0])
    const updated = await getPrefs()
    return NextResponse.json(updated)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
