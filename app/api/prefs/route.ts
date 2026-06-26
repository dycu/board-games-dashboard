import { NextRequest, NextResponse } from 'next/server'
import { getPrefs, savePrefs } from '@/lib/prefs'

export async function GET() {
  const prefs = await getPrefs()
  return NextResponse.json(prefs)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  await savePrefs(body)
  const updated = await getPrefs()
  return NextResponse.json(updated)
}
