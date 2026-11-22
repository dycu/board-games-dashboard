import { render, waitFor } from '@testing-library/react'
import ThemeSync from '@/components/ThemeSync'

describe('ThemeSync', () => {
  it('applies the fetched theme to the document on mount', async () => {
    document.documentElement.removeAttribute('data-theme')
    global.fetch = jest.fn(async () => ({ json: async () => ({ theme: 'dark' }) })) as unknown as typeof fetch

    render(<ThemeSync />)
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'))
  })

  it('clears a stale data-theme when the fetched prefs have no override', async () => {
    document.documentElement.setAttribute('data-theme', 'dark')
    global.fetch = jest.fn(async () => ({ json: async () => ({}) })) as unknown as typeof fetch

    render(<ThemeSync />)
    await waitFor(() => expect(document.documentElement.hasAttribute('data-theme')).toBe(false))
  })

  it('renders nothing', () => {
    global.fetch = jest.fn(async () => ({ json: async () => ({}) })) as unknown as typeof fetch
    const { container } = render(<ThemeSync />)
    expect(container).toBeEmptyDOMElement()
  })
})
