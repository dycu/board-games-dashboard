import { renderHook, act } from '@testing-library/react'
import { useAchievementUnlocks } from '../useAchievementUnlocks'
import { Achievement } from '@/lib/achievements/store'
import { FinishedGame } from '@/lib/types'

const goal: Achievement = { id: 'a1', platform: null, gameType: 'Wingspan', metric: 'played', target: 1, createdAt: '2026-01-01T00:00:00.000Z' }
const fg = (id: string): FinishedGame => ({ id, platform: 'bga', gameName: 'Wingspan', completedAt: new Date(), completedAgo: '', gameUrl: '' })

it('does nothing while achievements or games have not loaded yet', () => {
  const markAchieved = jest.fn()
  const { result } = renderHook(() => useAchievementUnlocks(null, [fg('1')], markAchieved))
  expect(result.current.celebrating).toEqual([])
  expect(markAchieved).not.toHaveBeenCalled()
})

it('celebrates a goal that just crossed its target and persists it', () => {
  const markAchieved = jest.fn()
  const { result, rerender } = renderHook(
    ({ games }) => useAchievementUnlocks([goal], games, markAchieved),
    { initialProps: { games: [] as FinishedGame[] } },
  )
  expect(result.current.celebrating).toEqual([])

  rerender({ games: [fg('1')] })
  expect(result.current.celebrating).toEqual([goal])
  expect(markAchieved).toHaveBeenCalledWith(['a1'])
})

it('does not celebrate the same goal twice even if the achievements list has not caught up yet', () => {
  const markAchieved = jest.fn()
  const { result, rerender } = renderHook(
    ({ games }) => useAchievementUnlocks([goal], games, markAchieved),
    { initialProps: { games: [fg('1')] } },
  )
  expect(result.current.celebrating).toEqual([goal])
  expect(markAchieved).toHaveBeenCalledTimes(1)

  // Same unmarked goal still comes back from a second finished-games
  // refresh before the server round trip updates achievedAt — must not
  // be queued to celebrate again.
  rerender({ games: [fg('1'), fg('2')] })
  expect(result.current.celebrating).toEqual([goal])
  expect(markAchieved).toHaveBeenCalledTimes(1)
})

it('dismiss removes a goal from the celebrating list', () => {
  const markAchieved = jest.fn()
  const { result, rerender } = renderHook(
    ({ games }) => useAchievementUnlocks([goal], games, markAchieved),
    { initialProps: { games: [fg('1')] } },
  )
  expect(result.current.celebrating).toEqual([goal])
  act(() => result.current.dismiss('a1'))
  rerender({ games: [fg('1')] })
  expect(result.current.celebrating).toEqual([])
})
