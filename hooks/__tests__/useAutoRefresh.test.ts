import { renderHook, act } from '@testing-library/react'
import { useAutoRefresh } from '../useAutoRefresh'

describe('useAutoRefresh', () => {
  beforeEach(() => { jest.useFakeTimers() })
  afterEach(() => { jest.useRealTimers() })

  it('starts with default 60s interval and countdown', () => {
    const onRefresh = jest.fn()
    const { result } = renderHook(() => useAutoRefresh(onRefresh, false))
    expect(result.current.intervalSeconds).toBe(60)
    expect(result.current.countdown).toBe(60)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('sets countdown to intervalSeconds immediately on activation', () => {
    const { result } = renderHook(() => useAutoRefresh(jest.fn(), false))
    act(() => { result.current.setIntervalSeconds(30) })
    expect(result.current.countdown).toBe(30)
  })

  it('counts down each second', () => {
    const { result } = renderHook(() => useAutoRefresh(jest.fn(), false))
    act(() => { result.current.setIntervalSeconds(30) })
    act(() => { jest.advanceTimersByTime(5000) })
    expect(result.current.countdown).toBe(25)
  })

  it('calls onRefresh when countdown reaches 0 and resets to intervalSeconds', () => {
    const onRefresh = jest.fn()
    const { result } = renderHook(() => useAutoRefresh(onRefresh, false))
    act(() => { result.current.setIntervalSeconds(30) })
    act(() => { jest.advanceTimersByTime(30000) })
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(result.current.countdown).toBe(30)
  })

  it('pauses countdown while isRefreshing is true', () => {
    const onRefresh = jest.fn()
    const { result, rerender } = renderHook(
      ({ r }: { r: boolean }) => useAutoRefresh(onRefresh, r),
      { initialProps: { r: false } },
    )
    act(() => { result.current.setIntervalSeconds(30) })
    act(() => { jest.advanceTimersByTime(10000) })
    expect(result.current.countdown).toBe(20)

    rerender({ r: true })
    act(() => { jest.advanceTimersByTime(15000) })
    expect(result.current.countdown).toBe(20) // paused — no decrement
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('resets countdown to full interval when refresh completes', () => {
    const onRefresh = jest.fn()
    const { result, rerender } = renderHook(
      ({ r }: { r: boolean }) => useAutoRefresh(onRefresh, r),
      { initialProps: { r: false } },
    )
    act(() => { result.current.setIntervalSeconds(30) })
    act(() => { jest.advanceTimersByTime(10000) })
    expect(result.current.countdown).toBe(20)

    rerender({ r: true })
    rerender({ r: false }) // refresh done
    expect(result.current.countdown).toBe(30)
  })

  it('resets countdown when interval changes mid-flight', () => {
    const { result } = renderHook(() => useAutoRefresh(jest.fn(), false))
    act(() => { result.current.setIntervalSeconds(30) })
    act(() => { jest.advanceTimersByTime(10000) })
    expect(result.current.countdown).toBe(20)

    act(() => { result.current.setIntervalSeconds(60) })
    expect(result.current.countdown).toBe(60)
  })

  it('stops countdown and clears it when switched to Off', () => {
    const onRefresh = jest.fn()
    const { result } = renderHook(() => useAutoRefresh(onRefresh, false))
    act(() => { result.current.setIntervalSeconds(30) })
    act(() => { jest.advanceTimersByTime(10000) })
    act(() => { result.current.setIntervalSeconds(0) })
    expect(result.current.countdown).toBe(0)

    act(() => { jest.advanceTimersByTime(30000) })
    expect(onRefresh).not.toHaveBeenCalled()
  })
})
