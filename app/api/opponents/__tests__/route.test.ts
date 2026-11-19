/**
 * @jest-environment node
 */
jest.mock('@vercel/kv', () => ({ kv: { hgetall: jest.fn(), hset: jest.fn(), hdel: jest.fn() } }))

import { kv } from '@vercel/kv'
import { NextRequest } from 'next/server'
import { GET, POST } from '../route'

const mockGetAll = kv.hgetall as jest.Mock
const mockSet = kv.hset as jest.Mock

const post = (body: unknown) => POST(new NextRequest('http://x/api/opponents', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => { mockGetAll.mockReset().mockResolvedValue(null); mockSet.mockReset() })

it('lists every platform, empty where nothing is stored for it', async () => {
  mockGetAll.mockImplementation(async (k: string) =>
    k === 'opponents:v1:obg' ? { Alice: { tags: ['fast'], responseSamples: [3600] } } : null)

  const json = await (await GET()).json()
  expect(json.byPlatform.obg).toEqual({ Alice: { tags: ['fast'], responseSamples: [3600] } })
  expect(json.byPlatform.bga).toEqual({})
})

it('saves tags for a platform + name', async () => {
  mockGetAll.mockResolvedValue({ Alice: { tags: [], responseSamples: [3600] } })
  const res = await post({ platform: 'obg', name: 'Alice', tags: ['fast', 'reliable'] })
  expect(res.status).toBe(200)
  expect(mockSet).toHaveBeenCalledWith('opponents:v1:obg', { Alice: { tags: ['fast', 'reliable'], responseSamples: [3600] } })
})

it('rejects an unknown platform', async () => {
  expect((await post({ platform: 'nope', name: 'Alice', tags: [] })).status).toBe(400)
})

it('rejects a missing name', async () => {
  expect((await post({ platform: 'obg', name: '', tags: [] })).status).toBe(400)
})

it('rejects non-string tags', async () => {
  expect((await post({ platform: 'obg', name: 'Alice', tags: [1] })).status).toBe(400)
})

it('saves hidden for a platform + name, leaving tags untouched', async () => {
  mockGetAll.mockResolvedValue({ Alice: { tags: ['fast'], responseSamples: [3600] } })
  const res = await post({ platform: 'obg', name: 'Alice', hidden: true })
  expect(res.status).toBe(200)
  expect(mockSet).toHaveBeenCalledWith('opponents:v1:obg', { Alice: { tags: ['fast'], responseSamples: [3600], hidden: true } })
})

it('rejects a non-boolean hidden', async () => {
  expect((await post({ platform: 'obg', name: 'Alice', hidden: 'yes' })).status).toBe(400)
})

it('rejects a body with neither tags nor hidden', async () => {
  expect((await post({ platform: 'obg', name: 'Alice' })).status).toBe(400)
})
