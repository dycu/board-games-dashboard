import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function get(url: string): Promise<{ status: number; text: string; cookies: string }> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' },
      signal: AbortSignal.timeout(8000),
    })
    return { status: r.status, text: await r.text(), cookies: r.headers.get('set-cookie') ?? '' }
  } catch (e: any) {
    return { status: 0, text: e.message, cookies: '' }
  }
}

export async function GET() {
  const username = process.env.CHOOCHOO_USERNAME
  const password = process.env.CHOOCHOO_PASSWORD
  if (!username || !password) {
    return NextResponse.json({ error: 'CHOOCHOO_USERNAME / CHOOCHOO_PASSWORD not set' }, { status: 500 })
  }

  // Fetch main page and extract all script/link src values
  const main = await get('https://www.choochoo.games')
  const scriptSrcs = [...(main.text.matchAll(/src="([^"]+)"/gi))].map(m => m[1])
  const linkHrefs = [...(main.text.matchAll(/href="([^"]+\.(?:js|css)[^"]*)"/))]
    .map(m => m[1]).filter(h => !h.includes('googleapis'))

  // Try the JS bundle path pattern based on CSS path
  const cssPath = main.text.match(/href="(\/dist\/[^"]+\.css[^"]*)"/)?.[1] ?? ''
  const jsBundleUrl = cssPath ? `https://www.choochoo.games${cssPath.replace(/\.css/, '.js').split('?')[0]}` : null

  const bundleResult = jsBundleUrl ? await get(jsBundleUrl) : { status: 0, text: '', cookies: '' }

  // Search for API calls in the bundle
  const apiPatterns = bundleResult.text
    ? [
        ...(bundleResult.text.matchAll(/https?:\/\/[a-z0-9.-]+\/[a-z/.-]{2,50}/gi)),
        ...(bundleResult.text.matchAll(/["'`](\/api\/[a-z/_-]{2,40})["'`]/gi)),
        ...(bundleResult.text.matchAll(/["'`](https?:\/\/api[^"'`\s]{3,60})["'`]/gi)),
      ].map(m => m[0]).filter((v, i, a) => a.indexOf(v) === i).slice(0, 20)
    : []

  // Also try fetching with different script src patterns
  const fullHtml = main.text.slice(0, 5000)

  return NextResponse.json({
    mainStatus: main.status,
    scriptSrcs: scriptSrcs.slice(0, 10),
    linkHrefs: linkHrefs.slice(0, 5),
    cssPath,
    jsBundleUrl,
    bundleStatus: bundleResult.status,
    bundleSize: bundleResult.text.length,
    apiPatterns,
    htmlPreview: fullHtml,
  })
}
