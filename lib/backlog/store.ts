import { kv } from '@vercel/kv'
import { BacklogItem } from './list'

const KEY = 'backlog:v1'

export async function getBacklog(): Promise<BacklogItem[]> {
  return (await kv.get<BacklogItem[]>(KEY)) ?? []
}

export async function updateBacklog(fn: (list: BacklogItem[]) => BacklogItem[]): Promise<BacklogItem[]> {
  const next = fn(await getBacklog())
  await kv.set(KEY, next)
  return next
}
