import { NextResponse } from 'next/server'
import { fetchFinishedBGA } from '@/lib/connectors/bga'
import { fetchFinishedEighteenXX } from '@/lib/connectors/eighteenxx'
import { fetchFinishedRally } from '@/lib/connectors/rally'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function env(key: string) { return process.env[key] ?? '' }

async function probe(name: string, fn: () => Promise<any[]>) {
  const start = Date.now()
  try {
    const games = await fn()
    return { name, ok: true, count: games.length, sample: games.slice(0, 2), ms: Date.now() - start }
  } catch (e: any) {
    return { name, ok: false, error: e.message, ms: Date.now() - start }
  }
}

export async function GET(request: Request) {
  const origin = new URL(request.url).origin

  const results = await Promise.all([
    probe('bga', () => fetchFinishedBGA(env('BGA_USERNAME'), env('BGA_PASSWORD'))),
    probe('eighteenxx', () => fetchFinishedEighteenXX(env('EIGHTEENXX_USERNAME'), env('EIGHTEENXX_PASSWORD'))),
    probe('rally', () => fetchFinishedRally(env('RALLY_USERNAME'), env('RALLY_PASSWORD'))),
  ])

  // choochoo uses a Node.js proxy route — call it via the same origin
  const choochooStart = Date.now()
  try {
    const res = await fetch(`${origin}/api/choochoo-finished`)
    const json = await res.json() as any
    results.push({
      name: 'choochoo',
      ok: !json.error,
      count: json.games?.length ?? 0,
      sample: (json.games ?? []).slice(0, 2),
      ms: Date.now() - choochooStart,
      ...(json.error ? { error: json.error } : {}),
    } as any)
  } catch (e: any) {
    results.push({ name: 'choochoo', ok: false, error: e.message, ms: Date.now() - choochooStart } as any)
  }

  return NextResponse.json({ results })
}
