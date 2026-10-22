import { renderHook, act } from '@testing-library/react'
import { useNoteConfirmedOpen } from '../useNoteConfirmedOpen'
import { Game } from '@/lib/types'

const game: Game = {
  id: 'bga:1',
  platform: 'bga',
  gameName: 'Wingspan',
  myTurn: true,
  lastMoveAt: new Date(),
  lastMoveAgo: '1h ago',
  urgent: false,
  gameUrl: 'https://boardgamearena.com/table/1',
  platformUrl: 'https://boardgamearena.com',
  players: [],
}

function mouseEvent(button = 0) {
  return { button, preventDefault: jest.fn() } as unknown as React.MouseEvent
}

describe('useNoteConfirmedOpen', () => {
  beforeEach(() => { jest.spyOn(window, 'open').mockImplementation(() => null) })
  afterEach(() => jest.restoreAllMocks())

  it('opens immediately on a plain click when there is no note', () => {
    const onOpen = jest.fn()
    const { result } = renderHook(() => useNoteConfirmedOpen(game, '_self', undefined, onOpen))
    const e = mouseEvent()
    act(() => result.current.onClick(e))
    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(result.current.pendingTarget).toBeNull()
  })

  it('opens immediately on a middle click when there is no note', () => {
    const onOpen = jest.fn()
    const { result } = renderHook(() => useNoteConfirmedOpen(game, '_self', undefined, onOpen))
    const e = mouseEvent(1)
    act(() => result.current.onAuxClick(e))
    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('does not intercept a non-middle aux click (e.g. a back/forward mouse button)', () => {
    const onOpen = jest.fn()
    const { result } = renderHook(() => useNoteConfirmedOpen(game, '_self', 'go for trains', onOpen))
    const e = mouseEvent(3)
    act(() => result.current.onAuxClick(e))
    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('holds off opening a plain click when there is a note, until confirmed', () => {
    const onOpen = jest.fn()
    const { result } = renderHook(() => useNoteConfirmedOpen(game, '_self', 'go for trains', onOpen))
    const e = mouseEvent()
    act(() => result.current.onClick(e))
    expect(e.preventDefault).toHaveBeenCalled()
    expect(onOpen).not.toHaveBeenCalled()
    expect(result.current.pendingTarget).toBe('_self')

    act(() => result.current.confirm())
    expect(window.open).toHaveBeenCalledWith(game.gameUrl, '_self', 'noopener,noreferrer')
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(result.current.pendingTarget).toBeNull()
  })

  it('opens a new tab on confirm after a middle click, regardless of the link\'s own target', () => {
    const onOpen = jest.fn()
    const { result } = renderHook(() => useNoteConfirmedOpen(game, '_self', 'go for trains', onOpen))
    act(() => result.current.onAuxClick(mouseEvent(1)))
    expect(result.current.pendingTarget).toBe('_blank')
    act(() => result.current.confirm())
    expect(window.open).toHaveBeenCalledWith(game.gameUrl, '_blank', 'noopener,noreferrer')
  })

  it('cancels without opening or calling onOpen', () => {
    const onOpen = jest.fn()
    const { result } = renderHook(() => useNoteConfirmedOpen(game, '_self', 'go for trains', onOpen))
    act(() => result.current.onClick(mouseEvent()))
    act(() => result.current.cancel())
    expect(window.open).not.toHaveBeenCalled()
    expect(onOpen).not.toHaveBeenCalled()
    expect(result.current.pendingTarget).toBeNull()
  })

  it('falls through to onOpen without a game to open (e.g. the "Next" shortcut with nothing pending)', () => {
    const onOpen = jest.fn()
    const { result } = renderHook(() => useNoteConfirmedOpen(undefined, '_blank', 'go for trains', onOpen))
    act(() => result.current.onClick(mouseEvent()))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(result.current.pendingTarget).toBeNull()
  })
})
