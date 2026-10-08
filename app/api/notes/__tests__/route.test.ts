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

const put = (body: unknown) => PUT(new NextRequest('http://x/api/notes', { method: 'PUT', body: JSON.stringify(body) }))

beforeEach(() => { mockGetAll.mockReset().mockResolvedValue({ 'bga:1': 'plan' }); mockSet.mockReset(); mockDel.mockReset() })

it('lists notes', async () => {
  expect(await (await GET()).json()).toEqual({ notes: { 'bga:1': 'plan' } })
})

it('saves a trimmed note', async () => {
  const res = await put({ id: 'bga:1', text: '  build mines  ' })
  expect(res.status).toBe(200)
  expect(mockSet).toHaveBeenCalledWith('notes:v1', { 'bga:1': 'build mines' })
})

it('deletes the note when the text is empty', async () => {
  await put({ id: 'bga:1', text: '   ' })
  expect(mockDel).toHaveBeenCalledWith('notes:v1', 'bga:1')
})

it('rejects a malformed id', async () => {
  expect((await put({ id: 'nope', text: 'x' })).status).toBe(400)
})
