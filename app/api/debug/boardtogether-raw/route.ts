import { kv } from '@vercel/kv'

// Temporary: inspect the raw boardtogether.games game JSON for an avatar/
// image field not captured by the typed BoardtogetherPlayer interface.
// Delete after use.
const API = 'https://boardtogether.games/api/v1'

export async function GET() {
  const username = process.env.BOARDTOGETHER_USERNAME ?? ''
  const password = process.env.BOARDTOGETHER_PASSWORD ?? ''
  const cached = await kv.get<{ cookie: string; userId: string }>('boardtogether-session').catch(() => null)
  let session = cached
  if (!session) {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
    const json = await res.json() as { payload?: { user?: { id?: string } } }
    session = { cookie, userId: json.payload?.user?.id ?? '' }
  }
  const res = await fetch(`${API}/games/mine`, { headers: { Cookie: session.cookie } })
  const json = await res.json()
  return Response.json({ json })
}
