export const runtime = 'edge'

const API_BASE = 'https://hansa-teutonica-digital.onrender.com'

export async function GET() {
  const url = new URL(`${API_BASE}/games`)
  url.searchParams.set('limit', '5')
  url.searchParams.set('mode', 'all')
  url.searchParams.set('status', 'playing')
  const res = await fetch(url.toString())
  const text = await res.text()
  return new Response(text, { headers: { 'Content-Type': 'application/json' } })
}
