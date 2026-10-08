import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PeriodSummary from '@/components/PeriodSummary'
import { FinishedGame } from '@/lib/types'

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000)

const fg = (id: string, d: number, over: Partial<FinishedGame> = {}): FinishedGame => ({
  id, platform: 'bga', gameName: 'Next Station', completedAt: daysAgo(d), completedAgo: '', gameUrl: '', ...over,
})

beforeEach(() => {
  global.fetch = jest.fn(async () => ({ json: async () => ({ recent: { turns: 12, medianHours: 3.5, turnsPerDay: 1.7 } }) })) as unknown as typeof fetch
})

describe('PeriodSummary', () => {
  const games = [
    fg('1', 1, { result: 'won', elo: 1340, eloDelta: 30 }),
    fg('2', 3, { result: 'lost', elo: 1310, eloDelta: -10 }),
    fg('3', 20, { gameName: 'Navegador', platform: 'yucata', result: 'won' }),
  ]

  it('summarizes the last 7 days by default, with BGA pace', async () => {
    render(<PeriodSummary games={games} />)
    expect(screen.getByText('finished').previousSibling).toHaveTextContent('2')
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('+20')).toBeInTheDocument()
    expect(screen.queryByText('Navegador')).toBeNull()
    expect(await screen.findByText(/BGA pace: 12 moves, median 3.5h to answer, 1.7 moves\/day/)).toBeInTheDocument()
  })

  it('widens to 30 days', async () => {
    render(<PeriodSummary games={games} />)
    await userEvent.click(screen.getByRole('button', { name: '30 days' }))
    expect(screen.getByText('Navegador')).toBeInTheDocument()
    expect(screen.getByText('finished').previousSibling).toHaveTextContent('3')
  })

  it('says so when nothing finished', () => {
    render(<PeriodSummary games={[fg('old', 60)]} />)
    expect(screen.getByText(/No games finished in this period/)).toBeInTheDocument()
  })
})
