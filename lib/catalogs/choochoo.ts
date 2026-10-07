import { CatalogEntry } from './types'

const BASE = 'https://www.choochoo.games'

// Map stages in the site's code: 1 = development (hidden from normal users),
// 5 = deprecated (hidden from everyone)
const HIDDEN_STAGES = new Set([1, 5])

// The client bundle is versioned (/dist/index.min.js?v=<hash>)
export function bundlePath(html: string): string | null {
  return html.match(/src="(\/dist\/index\.min\.js[^"]*)"/)?.[1] ?? null
}

function unescapeJs(s: string): string {
  return s
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\(.)/g, '$1')
}

// The site has no maps API; each map is a class in the minified bundle:
//   this.key=<"literal" | variable | e.key>;this.name="…";…this.minPlayers=…;…this.stage=N
// A variable key is defined as `NAME="key"` nearby; `e.key` refers to a
// `static{this.key="…"}` block in the same class.
export function parseChoochooCatalog(js: string): CatalogEntry[] {
  const entries = new Map<string, CatalogEntry>()
  for (const m of js.matchAll(/this\.key=([\w$.]+|"[^"]+");this\.name="((?:[^"\\]|\\.)*)";/g)) {
    const rawKey = m[1]
    const after = js.slice(m.index, m.index + 3000)
    // Field order varies between maps; minPlayers is what makes it a map
    if (!/^[^}]*?this\.minPlayers=/.test(after.slice(0, 600))) continue
    let key: string | undefined
    if (rawKey.startsWith('"')) key = rawKey.slice(1, -1)
    else if (rawKey.endsWith('.key')) key = after.match(/static\{this\.key="([^"]+)"\}/)?.[1]
    else {
      const escaped = rawKey.replace(/\$/g, '\\$')
      key = js.match(new RegExp(`(?:^|[\\s,;(])${escaped}="([^"]+)"`))?.[1]
    }
    if (!key) continue
    const stage = Number(after.match(/this\.stage=(\d+)/)?.[1])
    if (HIDDEN_STAGES.has(stage)) continue
    entries.set(key, { name: unescapeJs(m[2]), url: `${BASE}/app/games/create?map=${encodeURIComponent(key)}` })
  }
  if (entries.size === 0) throw new Error('choochoo: no maps found in the site bundle')
  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export async function fetchChoochooCatalog(): Promise<CatalogEntry[]> {
  const index = await fetch(`${BASE}/`)
  if (!index.ok) throw new Error(`choochoo index fetch failed: HTTP ${index.status}`)
  const path = bundlePath(await index.text())
  if (!path) throw new Error('choochoo: script bundle not found on the index page')
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`choochoo bundle fetch failed: HTTP ${res.status}`)
  return parseChoochooCatalog(await res.text())
}
