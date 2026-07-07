import { NextRequest, NextResponse } from 'next/server'
import { CATALOG_PLATFORMS, getCatalog } from '@/lib/catalogs/cache'
import { matchCatalog } from '@/lib/catalogs/match'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (!q) {
    return NextResponse.json({ results: [], errors: [] })
  }

  const settled = await Promise.allSettled(
    CATALOG_PLATFORMS.map(async platform => {
      const catalog = await getCatalog(platform)
      return matchCatalog(q, catalog).map(({ name, url }) => ({ name, url }))
    })
  )

  const results: { platform: string; matches: { name: string; url: string }[] }[] = []
  const errors: { platform: string; error: string }[] = []

  settled.forEach((outcome, i) => {
    const platform = CATALOG_PLATFORMS[i]
    if (outcome.status === 'fulfilled') {
      results.push({ platform, matches: outcome.value })
    } else {
      results.push({ platform, matches: [] })
      errors.push({ platform, error: outcome.reason?.message ?? 'Unknown error' })
    }
  })

  return NextResponse.json({ results, errors })
}
