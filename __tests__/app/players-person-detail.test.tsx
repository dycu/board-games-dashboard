import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import { PersonDetail } from '@/app/players/page'
import { FinishedGame } from '@/lib/types'
import { BacklogItem } from '@/lib/backlog/list'

function game(title: string, overrides: Partial<FinishedGame> = {}): FinishedGame {
  return {
    id: `bga:${Math.random()}`,
    platform: 'bga',
    gameName: title,
    completedAt: new Date('2026-06-01T00:00:00Z'),
    completedAgo: '1 day ago',
    gameUrl: 'https://example.com',
    ...overrides,
  }
}

const baseProps = {
  platform: 'bga' as const,
  name: 'alice',
  person: undefined,
  activeGames: [],
  allTags: [],
  onSaveTags: () => {},
  onSetHidden: () => {},
  onBack: () => {},
}

function mockBacklog(items: BacklogItem[]) {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ items }) })) as unknown as typeof fetch
}

describe('PersonDetail', () => {
  it('shows the title played most often together, when played more than once', async () => {
    mockBacklog([])
    render(<PersonDetail {...baseProps} games={[game('Brass: Lancashire'), game('Brass: Lancashire'), game('Nevsky')]} />)
    expect(await screen.findByText(/Most played together/)).toBeInTheDocument()
    expect(screen.getAllByText('Brass: Lancashire').length).toBeGreaterThan(0)
    expect(screen.getByText(/\(2×\)/)).toBeInTheDocument()
  })

  it('says nothing about "most played" when every title was only played once', () => {
    mockBacklog([])
    render(<PersonDetail {...baseProps} games={[game('Brass: Lancashire'), game('Nevsky')]} />)
    expect(screen.queryByText(/Most played together/)).toBeNull()
  })

  it('lists a shared title that is also in the backlog, with the same badge used on Active', async () => {
    mockBacklog([
      { id: 'bga:brasslancashire', platform: 'bga', gameName: 'Brass: Lancashire', playUrl: 'https://x', addedAt: '2026-01-01', lists: ['favorite', 'gm'] },
    ])
    render(<PersonDetail {...baseProps} games={[game('Brass: Lancashire'), game('Nevsky')]} />)
    const heading = await screen.findByText('Also in your backlog')
    const section = heading.closest('div')!
    expect(within(section).getByText('Brass: Lancashire')).toBeInTheDocument()
    const badge = within(section).getByTitle('In your backlog: Favorite, GM')
    expect(badge).toHaveTextContent('Favorite +1')
    expect(within(section).queryByText('Nevsky')).toBeNull()
  })

  it('shows no "Also in your backlog" section when nothing played together is tracked there', async () => {
    mockBacklog([])
    render(<PersonDetail {...baseProps} games={[game('Nevsky')]} />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(screen.queryByText('Also in your backlog')).toBeNull()
  })

  it('uses gameType over gameName for both features, same as the finished-games table does', async () => {
    mockBacklog([
      { id: 'bga:customtitle', platform: 'bga', gameName: 'Custom Title', playUrl: 'https://x', addedAt: '2026-01-01', lists: ['play'] },
    ])
    render(<PersonDetail {...baseProps} games={[
      game('Table 42', { gameType: 'Custom Title' }),
      game('Table 43', { gameType: 'Custom Title' }),
    ]} />)
    expect(await screen.findByText(/Most played together/)).toBeInTheDocument()
    expect(screen.getAllByText('Custom Title').length).toBeGreaterThan(0)
  })

  it('copies the player\'s name to the clipboard so it can be pasted into an invite on the platform', async () => {
    mockBacklog([])
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<PersonDetail {...baseProps} games={[]} />)
    const copyButton = await screen.findByRole('button', { name: /Copy name/ })
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    fireEvent.click(copyButton)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('alice'))
    expect(await screen.findByText('Copied!')).toBeInTheDocument()
  })
})
