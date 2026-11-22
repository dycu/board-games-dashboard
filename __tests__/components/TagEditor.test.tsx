import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TagEditor from '@/components/TagEditor'

describe('TagEditor', () => {
  it('shows each current tag with a remove button', () => {
    render(<TagEditor tags={['live', 'heavy']} suggestions={[]} onSave={() => {}} />)
    expect(screen.getByRole('button', { name: 'live ✕' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'heavy ✕' })).toBeInTheDocument()
  })

  it('removes a tag when its chip is clicked', async () => {
    const onSave = jest.fn()
    render(<TagEditor tags={['live', 'heavy']} suggestions={[]} onSave={onSave} />)
    await userEvent.click(screen.getByRole('button', { name: 'live ✕' }))
    expect(onSave).toHaveBeenCalledWith(['heavy'])
  })

  it('offers every existing tag not already applied as its own clickable chip', () => {
    render(<TagEditor tags={['live']} suggestions={['live', 'heavy', 'short']} onSave={() => {}} />)
    expect(screen.getByRole('button', { name: '+ heavy' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ short' })).toBeInTheDocument()
    // Already applied — offered as a remove chip, not also as a suggestion to add
    expect(screen.queryByRole('button', { name: '+ live' })).toBeNull()
  })

  it('adds an existing tag immediately when its suggestion chip is clicked', async () => {
    const onSave = jest.fn()
    render(<TagEditor tags={[]} suggestions={['heavy']} onSave={onSave} />)
    await userEvent.click(screen.getByRole('button', { name: '+ heavy' }))
    expect(onSave).toHaveBeenCalledWith(['heavy'])
  })

  it('adds a newly typed tag on Enter', async () => {
    const onSave = jest.fn()
    render(<TagEditor tags={[]} suggestions={[]} onSave={onSave} />)
    await userEvent.type(screen.getByLabelText('Add a new tag'), 'two-player{Enter}')
    expect(onSave).toHaveBeenCalledWith(['two-player'])
  })

  it('adds a newly typed tag on blur too', async () => {
    const onSave = jest.fn()
    render(<>
      <TagEditor tags={[]} suggestions={[]} onSave={onSave} />
      <button>elsewhere</button>
    </>)
    await userEvent.type(screen.getByLabelText('Add a new tag'), 'two-player')
    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }))
    expect(onSave).toHaveBeenCalledWith(['two-player'])
  })

  it('does not add a duplicate of a tag already applied', async () => {
    const onSave = jest.fn()
    render(<TagEditor tags={['live']} suggestions={[]} onSave={onSave} />)
    await userEvent.type(screen.getByLabelText('Add a new tag'), 'live{Enter}')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('ignores blank input', async () => {
    const onSave = jest.fn()
    render(<>
      <TagEditor tags={[]} suggestions={[]} onSave={onSave} />
      <button>elsewhere</button>
    </>)
    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }))
    expect(onSave).not.toHaveBeenCalled()
  })
})
