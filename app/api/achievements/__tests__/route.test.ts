/**
 * @jest-environment node
 */
jest.mock('@vercel/kv', () => ({ kv: { get: jest.fn(), set: jest.fn() } }))

import { kv } from '@vercel/kv'
import { NextRequest } from 'next/server'
import { GET, POST, PATCH, DELETE } from '../route'
import { Achievement } from '@/lib/achievements/store'

const mockGet = kv.get as jest.Mock
const mockSet = kv.set as jest.Mock

const post = (body: unknown) => POST(new NextRequest('http://x/api/achievements', { method: 'POST', body: JSON.stringify(body) }))
const patch = (body: unknown) => PATCH(new NextRequest('http://x/api/achievements', { method: 'PATCH', body: JSON.stringify(body) }))
const del = (body: unknown) => DELETE(new NextRequest('http://x/api/achievements', { method: 'DELETE', body: JSON.stringify(body) }))

const existing: Achievement = { id: 'a1', platform: null, gameType: 'Wingspan', metric: 'played', target: 5, createdAt: '2026-01-01T00:00:00.000Z' }

beforeEach(() => { mockGet.mockReset().mockResolvedValue([]); mockSet.mockReset() })

describe('GET', () => {
  it('lists every stored achievement', async () => {
    mockGet.mockResolvedValue([existing])
    const json = await (await GET()).json()
    expect(json.achievements).toEqual([existing])
  })
})

describe('POST', () => {
  it('creates a new goal with a generated id and createdAt', async () => {
    mockGet.mockResolvedValue([existing])
    const res = await post({ platform: 'bga', gameType: 'Terraforming Mars', metric: 'won', target: 3 })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.achievement).toMatchObject({ platform: 'bga', gameType: 'Terraforming Mars', metric: 'won', target: 3 })
    expect(json.achievement.id).toEqual(expect.any(String))
    expect(mockSet).toHaveBeenCalledWith('achievements:v1', [existing, json.achievement])
  })

  it('accepts a null platform (any)', async () => {
    const res = await post({ platform: null, gameType: 'Wingspan', metric: 'played', target: 10 })
    expect(res.status).toBe(200)
  })

  it('rejects a missing gameType', async () => {
    expect((await post({ platform: null, gameType: '', metric: 'played', target: 10 })).status).toBe(400)
  })

  it('rejects an invalid metric', async () => {
    expect((await post({ platform: null, gameType: 'Wingspan', metric: 'lost', target: 10 })).status).toBe(400)
  })

  it('rejects a target below 1', async () => {
    expect((await post({ platform: null, gameType: 'Wingspan', metric: 'played', target: 0 })).status).toBe(400)
  })
})

describe('PATCH', () => {
  it('marks the given ids achieved now, leaving others untouched', async () => {
    const other: Achievement = { ...existing, id: 'a2' }
    mockGet.mockResolvedValue([existing, other])
    const res = await patch({ ids: ['a1'] })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.achievements[0].achievedAt).toEqual(expect.any(String))
    expect(json.achievements[1].achievedAt).toBeUndefined()
  })

  it('does not overwrite an already-achieved date', async () => {
    const already: Achievement = { ...existing, achievedAt: '2026-01-05T00:00:00.000Z' }
    mockGet.mockResolvedValue([already])
    await patch({ ids: ['a1'] })
    expect(mockSet).toHaveBeenCalledWith('achievements:v1', [already])
  })

  it('rejects non-array ids', async () => {
    expect((await patch({ ids: 'a1' })).status).toBe(400)
  })
})

describe('DELETE', () => {
  it('removes the goal with the given id', async () => {
    mockGet.mockResolvedValue([existing])
    const res = await del({ id: 'a1' })
    expect(res.status).toBe(200)
    expect(mockSet).toHaveBeenCalledWith('achievements:v1', [])
  })

  it('rejects a missing id', async () => {
    expect((await del({})).status).toBe(400)
  })
})
