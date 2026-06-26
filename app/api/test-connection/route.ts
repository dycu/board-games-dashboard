import { NextRequest, NextResponse } from 'next/server'
import { Platform } from '@/lib/types'
import { connectors } from '@/lib/connectors'

export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get('platform') as Platform | null
  if (!platform || !(platform in connectors)) {
    return NextResponse.json({ ok: false, error: 'Invalid platform' }, { status: 400 })
  }
  try {
    await connectors[platform]()
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  }
}
