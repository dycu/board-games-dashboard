import { NextResponse } from 'next/server'
import { fetchAllPlatforms } from '@/lib/connectors'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  try {
    const result = await fetchAllPlatforms()
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
