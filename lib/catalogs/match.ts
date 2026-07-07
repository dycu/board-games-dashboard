import { CatalogEntry } from './types'

export interface MatchResult extends CatalogEntry {
  score: number
}

const MATCH_THRESHOLD = 0.6
const MAX_RESULTS = 3

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  let prev = new Array(n + 1)
  let curr = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j

  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

function score(normalizedQuery: string, normalizedCandidate: string): number {
  if (!normalizedQuery || !normalizedCandidate) return 0
  if (normalizedCandidate.includes(normalizedQuery) || normalizedQuery.includes(normalizedCandidate)) {
    const shorter = Math.min(normalizedQuery.length, normalizedCandidate.length)
    const longer = Math.max(normalizedQuery.length, normalizedCandidate.length)
    return 0.9 + 0.1 * (shorter / longer)
  }
  const distance = levenshtein(normalizedQuery, normalizedCandidate)
  const maxLen = Math.max(normalizedQuery.length, normalizedCandidate.length)
  return maxLen === 0 ? 0 : 1 - distance / maxLen
}

export function matchCatalog(query: string, catalog: CatalogEntry[]): MatchResult[] {
  const normalizedQuery = normalize(query)
  return catalog
    .map(entry => ({ ...entry, score: score(normalizedQuery, normalize(entry.name)) }))
    .filter(entry => entry.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
}
