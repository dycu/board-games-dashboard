/**
 * @jest-environment node
 */
jest.mock('@vercel/kv', () => ({ kv: { hgetall: jest.fn() } }))

import { kv } from '@vercel/kv'
import { GET } from '../route'

const mockGetAll = kv.hgetall as jest.Mock

beforeEach(() => mockGetAll.mockReset())

it('returns the stored daily totals', async () => {
  mockGetAll.mockResolvedValue({ '2026-11-18': 110, '2026-11-17': 64 })
  const json = await (await GET()).json()
  expect(json.history).toEqual({ '2026-11-18': 110, '2026-11-17': 64 })
})

it('returns an empty object when nothing is stored yet', async () => {
  mockGetAll.mockResolvedValue(null)
  const json = await (await GET()).json()
  expect(json.history).toEqual({})
})

it('returns 500 on a KV failure', async () => {
  mockGetAll.mockRejectedValue(new Error('KV unavailable'))
  const res = await GET()
  expect(res.status).toBe(500)
})
