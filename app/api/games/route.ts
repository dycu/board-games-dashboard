import { NextResponse } from 'next/server'
import { fetchAllPlatforms } from '@/lib/connectors'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  const result = await fetchAllPlatforms()
  return NextResponse.json(result)
}
