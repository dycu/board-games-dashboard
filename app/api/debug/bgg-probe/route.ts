// Temporary: check whether BGG's XML API — and even a plain game page,
// not the gated API — is reachable from production at all (both 401/403
// from the sandbox) before building the game-thumbnails feature on it.
// Delete after use.
export async function GET() {
  const [api, page] = await Promise.all([
    fetch('https://boardgamegeek.com/xmlapi2/search?type=boardgame&query=Terraforming%20Mars').then(async res => ({ status: res.status, body: (await res.text()).slice(0, 500) })),
    fetch('https://boardgamegeek.com/boardgame/224517/brass-birmingham').then(async res => ({ status: res.status, body: (await res.text()).slice(0, 500) })),
  ])
  return Response.json({ api, page })
}
