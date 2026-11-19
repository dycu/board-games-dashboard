/**
 * @jest-environment node
 */
jest.mock('@vercel/kv', () => ({ kv: { get: jest.fn(), hgetall: jest.fn() } }))

import { kv } from '@vercel/kv'
import { GET } from '../route'
import { DEFAULT_PREFS } from '@/lib/types'

const mockGet = kv.get as jest.Mock
const mockHgetall = kv.hgetall as jest.Mock

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue(null)
  mockHgetall.mockReset().mockResolvedValue(null)
})

it('bundles notes, labels, backlog, opponents, achievements and prefs into one snapshot', async () => {
  mockGet.mockImplementation(async (key: string) => {
    if (key === 'backlog:v1') return [{ platform: 'bga', gameName: 'Wingspan', gameUrl: 'https://x', list: 'favorite' }]
    if (key === 'achievements:v1') return [{ id: 'a1', platform: null, gameType: 'Wingspan', metric: 'played', target: 5, createdAt: '2026-01-01T00:00:00.000Z' }]
    if (key === 'user-prefs') return DEFAULT_PREFS
    return null
  })
  mockHgetall.mockImplementation(async (key: string) => {
    if (key === 'notes:v1') return { 'bga:1': 'ask alice' }
    if (key === 'table-labels:v1') return { 'bga:1': 'Game night' }
    if (key === 'opponents:v1:bga') return { Alice: { tags: ['fast'], responseSamples: [3600] } }
    return null
  })

  const json = await (await GET()).json()

  expect(json.notes).toEqual({ 'bga:1': 'ask alice' })
  expect(json.tableLabels).toEqual({ 'bga:1': 'Game night' })
  expect(json.backlog).toEqual([{ platform: 'bga', gameName: 'Wingspan', gameUrl: 'https://x', list: 'favorite' }])
  expect(json.opponents.bga).toEqual({ Alice: { tags: ['fast'], responseSamples: [3600] } })
  expect(json.opponents.yucata).toEqual({})
  expect(json.achievements).toEqual([{ id: 'a1', platform: null, gameType: 'Wingspan', metric: 'played', target: 5, createdAt: '2026-01-01T00:00:00.000Z' }])
  expect(json.prefs).toEqual(DEFAULT_PREFS)
  expect(json.exportedAt).toEqual(expect.any(String))
})

it('still returns an empty-but-valid snapshot when nothing is stored yet', async () => {
  const json = await (await GET()).json()
  expect(json.notes).toEqual({})
  expect(json.backlog).toEqual([])
  expect(json.achievements).toEqual([])
  expect(json.prefs).toEqual(DEFAULT_PREFS)
})

it('returns 500 on a KV failure', async () => {
  mockGet.mockRejectedValue(new Error('KV unavailable'))
  const res = await GET()
  expect(res.status).toBe(500)
})
