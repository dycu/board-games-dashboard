import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import InviteAgainButton from '@/components/InviteAgainButton'

let mockByPlatform: Record<string, Record<string, { tags: string[]; responseSamples: number[]; hidden?: boolean }>> | null = null

jest.mock('@/components/OpponentsProvider', () => ({
  useOpponentsContext: () => ({ byPlatform: mockByPlatform }),
}))

function setFinishedGamesCache(games: { platform: string; opponents: { name: string }[] }[]) {
  localStorage.setItem('finished-games-cache', JSON.stringify({
    games: games.map((g, i) => ({ id: `g${i}`, gameName: 'Test Game', completedAt: '2026-01-01T00:00:00.000Z', completedAgo: '1 day ago', gameUrl: 'https://x', ...g })),
    errors: [],
    fetchedAt: '2026-01-01T00:00:00.000Z',
  }))
}

const writeText = jest.fn().mockResolvedValue(undefined)

beforeEach(() => {
  mockByPlatform = null
  localStorage.clear()
  writeText.mockClear()
  Object.assign(navigator, { clipboard: { writeText } })
})

describe('InviteAgainButton', () => {
  it('renders nothing (not even the button) when there is no opponent history for this platform', () => {
    const { container } = render(<InviteAgainButton platform="bga" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('opens a modal listing past opponents for this platform only, with their tags and games-together count', () => {
    setFinishedGamesCache([
      { platform: 'bga', opponents: [{ name: 'alice' }] },
      { platform: 'bga', opponents: [{ name: 'alice' }] },
      { platform: 'yucata', opponents: [{ name: 'bob' }] },
    ])
    mockByPlatform = { bga: { alice: { tags: ['friend'], responseSamples: [] } } }
    render(<InviteAgainButton platform="bga" />)

    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Invite/ }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('friend')).toBeInTheDocument()
    expect(screen.getByText('2×')).toBeInTheDocument()
    expect(screen.queryByText('bob')).toBeNull()
  })

  it('excludes opponents hidden from the roster', () => {
    setFinishedGamesCache([{ platform: 'bga', opponents: [{ name: 'alice' }] }])
    mockByPlatform = { bga: { alice: { tags: [], responseSamples: [], hidden: true } } }
    const { container } = render(<InviteAgainButton platform="bga" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('closes on Escape and on a backdrop click', () => {
    setFinishedGamesCache([{ platform: 'bga', opponents: [{ name: 'alice' }] }])
    mockByPlatform = { bga: { alice: { tags: [], responseSamples: [] } } }
    render(<InviteAgainButton platform="bga" />)

    fireEvent.click(screen.getByRole('button', { name: /Invite/ }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Invite/ }))
    fireEvent.click(screen.getByRole('dialog').parentElement!)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('copies a single nickname to the clipboard when its name is clicked', async () => {
    setFinishedGamesCache([{ platform: 'bga', opponents: [{ name: 'alice' }] }])
    mockByPlatform = { bga: { alice: { tags: [], responseSamples: [] } } }
    render(<InviteAgainButton platform="bga" />)
    fireEvent.click(screen.getByRole('button', { name: /Invite/ }))
    fireEvent.click(screen.getByRole('button', { name: 'alice' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('alice'))
    expect(await screen.findByText('Copied!')).toBeInTheDocument()
  })

  it('copies several selected nicknames at once, comma-separated', async () => {
    setFinishedGamesCache([
      { platform: 'bga', opponents: [{ name: 'alice' }] },
      { platform: 'bga', opponents: [{ name: 'bob' }] },
    ])
    mockByPlatform = { bga: { alice: { tags: [], responseSamples: [] }, bob: { tags: [], responseSamples: [] } } }
    render(<InviteAgainButton platform="bga" />)
    fireEvent.click(screen.getByRole('button', { name: /Invite/ }))

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select alice' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select bob' }))
    fireEvent.click(screen.getByRole('button', { name: /Copy 2/ }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('alice, bob'))
  })
})
