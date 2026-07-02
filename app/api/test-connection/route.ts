import { NextRequest, NextResponse } from 'next/server'
import { Platform } from '@/lib/types'
import { makeConnectors } from '@/lib/connectors'
import { getPrefs } from '@/lib/prefs'

// Edge runtime lets OBG bypass Cloudflare (same reason the games route uses edge)
export const runtime = 'edge'

// Choochoo needs rejectUnauthorized:false for SSL, so it must go through the
// Node.js proxy route — same pattern as the games route
const PROXY_PATH: Partial<Record<Platform, string>> = {
  choochoo: '/api/choochoo',
}

export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get('platform') as Platform | null
  const prefs = await getPrefs()
  const connectors = makeConnectors(prefs.bgaSortCapDays ?? 3, prefs.eighteenxxSessionCookie)

  if (!platform || !(platform in connectors)) {
    return NextResponse.json({ ok: false, error: 'Invalid platform' }, { status: 400 })
  }
  try {
    const proxyPath = PROXY_PATH[platform]
    if (proxyPath) {
      const origin = new URL(req.url).origin
      const res = await fetch(`${origin}${proxyPath}`)
      const data = await res.json() as { error: string | null }
      if (data.error) return NextResponse.json({ ok: false, error: data.error })
      return NextResponse.json({ ok: true })
    }
    await connectors[platform]()
    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message })
  }
}
