import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NoticeToasts from '@/components/NoticeToasts'
import { reportNotice, dismissNotice, subscribeNotices } from '@/lib/notify'

afterEach(() => {
  const unsubscribe = subscribeNotices(current => current.forEach(n => dismissNotice(n.id)))
  unsubscribe()
})

describe('NoticeToasts', () => {
  it('renders nothing when there is nothing to show', () => {
    const { container } = render(<NoticeToasts />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a reported error notice', () => {
    render(<NoticeToasts />)
    act(() => { reportNotice('error', 'Something failed') })
    expect(screen.getByText('Something failed')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('shows a reported info notice', () => {
    render(<NoticeToasts />)
    act(() => { reportNotice('info', 'Something happened') })
    expect(screen.getByText('Something happened')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('dismisses a notice via its own close button', async () => {
    render(<NoticeToasts />)
    act(() => { reportNotice('error', 'Something failed') })
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(screen.queryByText('Something failed')).toBeNull()
  })

  it('auto-dismisses an info notice after a while, but not an error', () => {
    jest.useFakeTimers()
    render(<NoticeToasts />)
    act(() => {
      reportNotice('info', 'will fade')
      reportNotice('error', 'stays put')
    })
    act(() => { jest.advanceTimersByTime(8_000) })
    expect(screen.queryByText('will fade')).toBeNull()
    expect(screen.getByText('stays put')).toBeInTheDocument()
    jest.useRealTimers()
  })

  it('shows a notice\'s links as clickable, each opening in the tab its platform calls for', () => {
    render(<NoticeToasts />)
    act(() => {
      reportNotice('info', '✅ 2 games finished:', [
        { label: 'Navegador', url: 'https://boardgamearena.com/table?id=1', external: false },
        { label: 'Brass', url: 'https://yucata.de/game/1', external: true },
      ])
    })
    expect(screen.getByRole('link', { name: 'Navegador' })).toHaveAttribute('target', '_self')
    expect(screen.getByRole('link', { name: 'Brass' })).toHaveAttribute('target', '_blank')
  })

  it('does not restart an already-waiting notice\'s timer when a new one arrives', () => {
    jest.useFakeTimers()
    render(<NoticeToasts />)
    act(() => { reportNotice('info', 'first') })
    act(() => { jest.advanceTimersByTime(6_000) })
    act(() => { reportNotice('info', 'second') })
    act(() => { jest.advanceTimersByTime(2_000) })
    expect(screen.queryByText('first')).toBeNull()
    expect(screen.getByText('second')).toBeInTheDocument()
    jest.useRealTimers()
  })
})
