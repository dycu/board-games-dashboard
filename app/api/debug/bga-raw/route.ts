import { withBgaSession, fetchBgaTables, bgaApiHeaders } from '@/lib/connectors/bga'

// Temporary: inspect the raw BGA tableinfos response (which has an `avatar`
// field per player, but just a hash/code, not a URL) and the player profile
// page's HTML (to find the real image URL the site builds from that code)
// before building the player-avatars feature. Delete after use.
export async function GET() {
  const username = process.env.BGA_USERNAME ?? ''
  const password = process.env.BGA_PASSWORD ?? ''
  const result = await withBgaSession(username, password, async session => {
    const tables = await fetchBgaTables(session)
    const firstPlayerId = Object.keys((tables[0]?.players as Record<string, unknown>) ?? {})[0]
    let profileHtmlSnippet = ''
    if (firstPlayerId) {
      const res = await fetch(`https://boardgamearena.com/player?id=${firstPlayerId}`, {
        headers: bgaApiHeaders(session, 'https://boardgamearena.com/gameinprogress'),
      })
      const html = await res.text()
      const matches = html.match(/[^"'\s]*avatar[^"'\s]*/gi) ?? []
      profileHtmlSnippet = [...new Set(matches)].slice(0, 30).join('\n')
    }
    return { tables: tables.slice(0, 2), firstPlayerId, profileHtmlSnippet }
  })
  return Response.json(result)
}
