import { NextRequest, NextResponse } from 'next/server'
import { getNotes, setNote } from '@/lib/notes/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json({ notes: await getNotes() })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  let body: { id?: unknown; text?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (typeof body.id !== 'string' || !/^[a-z0-9]+:.+/.test(body.id) || typeof body.text !== 'string') {
    return NextResponse.json({ error: 'id and text are required' }, { status: 400 })
  }
  try {
    await setNote(body.id, body.text)
    return NextResponse.json({ notes: await getNotes() })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
