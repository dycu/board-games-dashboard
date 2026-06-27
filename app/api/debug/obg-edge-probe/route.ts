export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function GET() {
  const username = process.env.OBG_USERNAME
  const password = process.env.OBG_PASSWORD
  const log: string[] = []

  const BROWSER = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Ch-Ua': '"Google Chrome";v="125", "Chromium";v="125"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Upgrade-Insecure-Requests': '1',
  }

  // Basic connectivity check
  for (const url of [
    'https://www.onlineboardgamers.com',
    'https://www.onlineboardgamers.com/login',
    'https://www.onlineboardgamers.com/api/games',
  ]) {
    try {
      const r = await fetch(url, { headers: BROWSER, redirect: 'manual' })
      const body = await r.text()
      const isCF = body.includes('Just a moment') || body.includes('Checking your browser')
      log.push(`GET ${url}: HTTP ${r.status} CF=${isCF} len=${body.length} body=${body.slice(0, 100)}`)
    } catch (e: any) {
      log.push(`GET ${url}: error=${e.message}`)
    }
  }

  // Try login if we got past CF on homepage
  if (username && password && !log[0]?.includes('CF=true')) {
    try {
      const r = await fetch('https://www.onlineboardgamers.com/login', {
        method: 'POST',
        headers: { ...BROWSER, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: username, password }),
        redirect: 'manual',
      })
      const body = await r.text()
      log.push(`POST login: HTTP ${r.status} cookie=${r.headers.get('set-cookie')?.slice(0, 60)} body=${body.slice(0, 150)}`)
    } catch (e: any) {
      log.push(`POST login: error=${e.message}`)
    }
  }

  return Response.json({ name: 'obg-edge', log })
}
