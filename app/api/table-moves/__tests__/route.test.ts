/**
 * @jest-environment node
 */
jest.mock('@vercel/kv', () => ({ kv: { hget: jest.fn() } }))

import { kv } from '@vercel/kv'
import { NextRequest } from 'next/server'
import { GET } from '../route'

const mockGet = kv.hget as jest.Mock

beforeEach(() => { mockGet.mockReset() })

const get = (id: string) => GET(new NextRequest(`http://x/api/table-moves?id=${encodeURIComponent(id)}`))

it("returns one table's own per-day, per-player move history", async () => {
  mockGet.mockResolvedValue({ '2026-11-19': { me: 5, opponents: 2 } })
  const res = await get('bga:12345')
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ days: { '2026-11-19': { me: 5, opponents: 2 } } })
  expect(mockGet).toHaveBeenCalledWith('pptrack-days:v1:bga', 'bga:12345')
})

it('returns an empty history for a table never tracked', async () => {
  mockGet.mockResolvedValue(null)
  expect(await (await get('bga:99')).json()).toEqual({ days: {} })
})

it('rejects a missing or malformed id', async () => {
  expect((await get('')).status).toBe(400)
  expect((await get('not-a-platform:1')).status).toBe(400)
  expect((await get('bga')).status).toBe(400)
})
