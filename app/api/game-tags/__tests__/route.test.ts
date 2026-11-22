/**
 * @jest-environment node
 */
jest.mock('@vercel/kv', () => ({ kv: { hgetall: jest.fn(), hset: jest.fn(), hdel: jest.fn() } }))

import { kv } from '@vercel/kv'
import { NextRequest } from 'next/server'
import { GET, POST } from '../route'

const mockGetAll = kv.hgetall as jest.Mock
const mockSet = kv.hset as jest.Mock
const mockDel = kv.hdel as jest.Mock

const post = (body: unknown) => POST(new NextRequest('http://x/api/game-tags', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => { mockGetAll.mockReset().mockResolvedValue(null); mockSet.mockReset(); mockDel.mockReset() })

it('lists every platform, empty where nothing is stored for it', async () => {
  mockGetAll.mockImplementation(async (k: string) =>
    k === 'gametags:v1:bga' ? { 'gaia project': { tags: ['heavy'] } } : null)

  const json = await (await GET()).json()
  expect(json.byPlatform.bga).toEqual({ 'gaia project': { tags: ['heavy'] } })
  expect(json.byPlatform.yucata).toEqual({})
})

it('saves tags for a platform + game, keyed by the lowercased title', async () => {
  const res = await post({ platform: 'bga', gameName: 'Gaia Project', tags: ['live', 'heavy'] })
  expect(res.status).toBe(200)
  expect(mockSet).toHaveBeenCalledWith('gametags:v1:bga', { 'gaia project': { tags: ['live', 'heavy'] } })
})

it('deletes the entry instead of storing an empty tag list', async () => {
  mockGetAll.mockResolvedValue({ 'gaia project': { tags: ['live'] } })
  const res = await post({ platform: 'bga', gameName: 'Gaia Project', tags: [] })
  expect(res.status).toBe(200)
  expect(mockDel).toHaveBeenCalledWith('gametags:v1:bga', 'gaia project')
  expect(mockSet).not.toHaveBeenCalled()
})

it('rejects an unknown platform', async () => {
  expect((await post({ platform: 'nope', gameName: 'Gaia Project', tags: [] })).status).toBe(400)
})

it('rejects a missing gameName', async () => {
  expect((await post({ platform: 'bga', gameName: '', tags: [] })).status).toBe(400)
})

it('rejects non-string tags', async () => {
  expect((await post({ platform: 'bga', gameName: 'Gaia Project', tags: [1] })).status).toBe(400)
})

it('rejects a non-array tags', async () => {
  expect((await post({ platform: 'bga', gameName: 'Gaia Project', tags: 'live' })).status).toBe(400)
})
