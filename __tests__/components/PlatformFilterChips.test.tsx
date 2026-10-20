import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PlatformFilterChips from '@/components/PlatformFilterChips'
import { Platform } from '@/lib/types'

const PLATFORMS: Platform[] = ['bga', 'yucata', 'rally']

describe('PlatformFilterChips', () => {
  it('renders nothing when there is only one (or no) platform to filter by', () => {
    const { container } = render(
      <PlatformFilterChips platforms={['bga']} selected={['bga']} onChange={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('"All" selects every platform at once', async () => {
    const onChange = jest.fn()
    render(<PlatformFilterChips platforms={PLATFORMS} selected={['bga']} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /^All/ }))
    expect(onChange).toHaveBeenCalledWith(PLATFORMS)
  })

  it('shows "All" as active once every platform is selected', () => {
    render(<PlatformFilterChips platforms={PLATFORMS} selected={PLATFORMS} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /^All/ })).toHaveClass('bg-[#1a1a1a]')
  })

  it('building an arbitrary subset: toggling one platform on adds just that one', async () => {
    const onChange = jest.fn()
    render(<PlatformFilterChips platforms={PLATFORMS} selected={['bga']} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /Yucata/ }))
    expect(onChange).toHaveBeenCalledWith(['bga', 'yucata'])
  })

  it('dropping one platform out of a fully-selected set leaves the rest selected', async () => {
    const onChange = jest.fn()
    render(<PlatformFilterChips platforms={PLATFORMS} selected={PLATFORMS} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /Yucata/ }))
    expect(onChange).toHaveBeenCalledWith(['bga', 'rally'])
  })

  it('shows per-platform and "All" counts when given', () => {
    render(
      <PlatformFilterChips
        platforms={PLATFORMS}
        selected={PLATFORMS}
        onChange={() => {}}
        counts={{ bga: 5, yucata: 2 }}
        allCount={10}
      />,
    )
    expect(screen.getByRole('button', { name: 'All (10)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /BGA \(5\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Yucata \(2\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Rally$/ })).toBeInTheDocument() // no count given — none shown
  })

  it('only shows the open-platform-site link when openLinks is set', () => {
    render(<PlatformFilterChips platforms={PLATFORMS} selected={PLATFORMS} onChange={() => {}} openLinks />)
    expect(screen.getAllByRole('link', { name: /^Open / })).toHaveLength(PLATFORMS.length)
  })

  it('has no open-platform-site links by default', () => {
    render(<PlatformFilterChips platforms={PLATFORMS} selected={PLATFORMS} onChange={() => {}} />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
