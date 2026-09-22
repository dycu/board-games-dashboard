import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FilterToolbar from '@/components/FilterToolbar'
import { DEFAULT_PREFS } from '@/lib/types'

describe('FilterToolbar', () => {
  it('renders sort and filter controls', () => {
    render(<FilterToolbar prefs={DEFAULT_PREFS} onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: /sort/i })).toBeInTheDocument()
  })

  it('calls onChange with updated sort when changed', async () => {
    const onChange = jest.fn()
    render(<FilterToolbar prefs={DEFAULT_PREFS} onChange={onChange} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /sort/i }), 'most-recent')
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sort: 'most-recent' }))
  })

  it('calls onChange with updated turnStatus filter', async () => {
    const onChange = jest.fn()
    render(<FilterToolbar prefs={DEFAULT_PREFS} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /my turn/i }))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ filter: expect.objectContaining({ turnStatus: 'my-turn' }) })
    )
  })
})
