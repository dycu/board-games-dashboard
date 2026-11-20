import { useRef } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAnchoredPopover } from '../useAnchoredPopover'

function Harness({ onClose }: { onClose: () => void }) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const { panelRef, pos } = useAnchoredPopover(anchorRef, onClose)
  return (
    <div>
      <button ref={anchorRef}>trigger</button>
      {pos && <div ref={panelRef} data-testid="panel">panel</div>}
    </div>
  )
}

describe('useAnchoredPopover', () => {
  it('renders nothing until the anchor has been measured, then shows the panel', () => {
    render(<Harness onClose={() => {}} />)
    expect(screen.getByTestId('panel')).toBeInTheDocument()
  })

  it('closes on Escape', () => {
    const onClose = jest.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on a click outside the panel and the trigger, not on a click inside either', async () => {
    const onClose = jest.fn()
    render(<Harness onClose={onClose} />)
    await userEvent.click(screen.getByTestId('panel'))
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByText('trigger'))
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on scroll instead of tracking the trigger to a new position', () => {
    const onClose = jest.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.scroll(window)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
