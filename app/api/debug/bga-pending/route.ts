import { NextResponse } from 'next/server'
import { withBgaSession, bgaApiHeaders } from '@/lib/connectors/bga'

export const dynamic = 'force-dynamic'

// Temporary: BGA's own homepage lists "tables waiting for players" —
// grab it with the authenticated session to see what ajax call it makes,
// since tableinfos.html?status=play isn't returning a brand-new lobby.
export async function GET() {
  const username = process.env.BGA_USERNAME!
  const password = process.env.BGA_PASSWORD!
  const html = await withBgaSession(username, password, async s => {
    const res = await fetch('https://boardgamearena.com/account', { headers: bgaApiHeaders(s, 'https://boardgamearena.com/') })
    return res.text()
  })
  // Pull out anything that looks like an ajax URL reference, so we don't
  // ship the whole page.
  const urls = [...new Set(html.match(/[a-zA-Z0-9_/]+\.html/g) ?? [])]
  const mentionsNemesis = /nemesis/i.test(html)
  return NextResponse.json({ length: html.length, urls, mentionsNemesis })
}
