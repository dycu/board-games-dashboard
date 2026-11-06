/**
 * @jest-environment node
 */
jest.mock('@vercel/kv', () => ({ kv: { hgetall: jest.fn(), hset: jest.fn(), hdel: jest.fn() } }))

import { kv } from '@vercel/kv'
import { NextRequest } from 'next/server'
import { GET, PUT } from '../route'

const mockGetAll = kv.hgetall as jest.Mock
const mockSet = kv.hset as jest.Mock
const mockDel = kv.hdel as jest.Mock

const put = (body: unknown) => PUT(new NextRequest('http://x/api/table-labels', { method: 'PUT', body: JSON.stringify(body) }))

beforeEach(() => { mockGetAll.mockReset().mockResolvedValue({ 'bga:1': 'Group A' }); mockSet.mockReset(); mockDel.mockReset() })

it('lists table labels', async () => {
  expect(await (await GET()).json()).toEqual({ labels: { 'bga:1': 'Group A' } })
})

it('saves a trimmed label', async () => {
  const res = await put({ id: 'bga:1', text: '  with Janek  ' })
  expect(res.status).toBe(200)
  expect(mockSet).toHaveBeenCalledWith('table-labels:v1', { 'bga:1': 'with Janek' })
})

it('deletes the label when the text is empty', async () => {
  await put({ id: 'bga:1', text: '   ' })
  expect(mockDel).toHaveBeenCalledWith('table-labels:v1', 'bga:1')
})

it('rejects a malformed id', async () => {
  expect((await put({ id: 'nope', text: 'x' })).status).toBe(400)
})
