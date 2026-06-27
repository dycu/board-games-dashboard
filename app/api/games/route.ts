import { NextResponse } from 'next/server'
import { fetchAllPlatforms } from '@/lib/connectors'
import { getPrefs } from '@/lib/prefs'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const prefs = await getPrefs()
    const result = await fetchAllPlatforms(prefs.disabledPlatforms ?? [])
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
