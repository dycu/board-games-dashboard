// Temporary: check whether BGG's XML API is reachable from production at
// all (it 401s plainly from this sandbox) before building the game-
// thumbnails feature on it. Delete after use.
export async function GET() {
  const res = await fetch('https://boardgamegeek.com/xmlapi2/search?type=boardgame&query=Terraforming%20Mars')
  const text = await res.text()
  return Response.json({ status: res.status, body: text.slice(0, 2000) })
}
