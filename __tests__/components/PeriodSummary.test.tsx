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
    await userEvent.click(screen.getByRole('button', { name: '30d' }))
    expect(screen.getByText('Navegador')).toBeInTheDocument()
    expect(screen.getByText('finished').previousSibling).toHaveTextContent('3')
  })

  it('says so when nothing finished', () => {
    render(<PeriodSummary games={[fg('old', 60)]} />)
    expect(screen.getByText(/No games finished in this period/)).toBeInTheDocument()
  })

  it('shows everything, including games far outside any other preset, under "All time"', async () => {
    const veryOld = fg('ancient', 900, { gameName: 'Acquire', platform: 'yucata', result: 'won' })
    render(<PeriodSummary games={[...games, veryOld]} />)
    await userEvent.click(screen.getByRole('button', { name: 'All time' }))
    expect(screen.getByText('Acquire')).toBeInTheDocument()
    expect(screen.getByText('finished').previousSibling).toHaveTextContent('4')
  })

  it('lists every game in the period without a "show more" toggle to hide any of them', async () => {
    const many = Array.from({ length: 10 }, (_, i) => fg(`g${i}`, 2, { gameName: `Game ${i}` }))
    render(<PeriodSummary games={many} />)
    for (const g of many) expect(screen.getByText(g.gameName)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /show (all|fewer)/i })).toBeNull()
  })

  const multiGames = [
    fg('c1', 0, { gameName: 'Catan', result: 'won' }),
    fg('c2', 0, { gameName: 'Catan', result: 'won' }),
    fg('c3', 0, { gameName: 'Catan', result: 'lost' }),
    fg('b1', 0, { gameName: 'Brass', result: 'lost' }),
    fg('b2', 0, { gameName: 'Brass', result: 'lost' }),
    fg('d1', 0, { gameName: 'Dune', result: 'won', elo: 1500 }),
  ]

  it('filters the per-game table by name, without affecting the period totals', async () => {
    render(<PeriodSummary games={multiGames} />)
    expect(screen.getByText('Catan')).toBeInTheDocument()
    expect(screen.getByText('Brass')).toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText(/Filter 3 games/), 'dun')

    expect(screen.getByText('Dune')).toBeInTheDocument()
    expect(screen.queryByText('Catan')).toBeNull()
    expect(screen.queryByText('Brass')).toBeNull()
    expect(screen.getByText('finished').previousSibling).toHaveTextContent('6') // unaffected by the table filter
  })

  it('says so when the filter matches nothing', async () => {
    render(<PeriodSummary games={multiGames} />)
    await userEvent.type(screen.getByPlaceholderText(/Filter 3 games/), 'zzz')
    expect(screen.getByText(/No games match/)).toBeInTheDocument()
  })

  it('sorts by best record, name, and ELO', async () => {
    render(<PeriodSummary games={multiGames} />)
    const rowNames = () => screen.getAllByRole('row').slice(1).map(r => r.textContent)
    const sortSelect = screen.getByLabelText('Sort by')

    // default: most played — Catan (3), Brass (2), Dune (1)
    expect(rowNames().map(t => t?.match(/Catan|Brass|Dune/)?.[0])).toEqual(['Catan', 'Brass', 'Dune'])

    await userEvent.selectOptions(sortSelect, 'Best record')
    expect(rowNames().map(t => t?.match(/Catan|Brass|Dune/)?.[0])).toEqual(['Dune', 'Catan', 'Brass'])

    await userEvent.selectOptions(sortSelect, 'Name')
    expect(rowNames().map(t => t?.match(/Catan|Brass|Dune/)?.[0])).toEqual(['Brass', 'Catan', 'Dune'])

    await userEvent.selectOptions(sortSelect, 'ELO')
    expect(rowNames().map(t => t?.match(/Catan|Brass|Dune/)?.[0])).toEqual(['Dune', 'Catan', 'Brass'])
  })
})
