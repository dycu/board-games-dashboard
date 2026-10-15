import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GameCard, { GameRow, GameItemProps } from '@/components/GameCard'
import { Game } from '@/lib/types'

const NOW = Date.parse('2026-06-26T10:00:00Z')

const game: Game = {
  id: 'bga:1',
  platform: 'bga',
  gameName: 'Wingspan',
  myTurn: true,
  lastMoveAt: new Date('2026-06-24T10:00:00Z'),
  lastMoveAgo: '2 days ago',
  urgent: true,
  gameUrl: 'https://boardgamearena.com/table/1',
  platformUrl: 'https://boardgamearena.com',
  players: ['alice', 'bob'],
}

const props = (over: Partial<GameItemProps> = {}): GameItemProps =>
  ({ game, pinned: false, onTogglePin: () => {}, sunk: false, onToggleSink: () => {}, watched: false, onToggleWatch: () => {}, onOpen: () => {}, opponentSlowDays: 5, deadlineSoonHours: 24, now: NOW, showProgress: true, ...over })

describe('GameCard', () => {
  it('shows game name, platform badge and time', () => {
    render(<GameCard {...props()} />)
    expect(screen.getByText('Wingspan')).toBeInTheDocument()
    expect(screen.getByText('BGA')).toBeInTheDocument()
    expect(screen.getByText(/2 days ago/)).toBeInTheDocument()
  })

  it('has no "Your turn" label — the section heading says it', () => {
    render(<GameCard {...props()} />)
    expect(screen.queryByText('Your turn')).toBeNull()
  })

  it('shows the time left when the deadline is under a day away', () => {
    render(<GameCard {...props({ game: { ...game, deadlineAt: '2026-06-26T15:00:00Z' } })} />)
    expect(screen.getByText(/5h left/)).toBeInTheDocument()
  })

  it('does not show a deadline days away', () => {
    render(<GameCard {...props({ game: { ...game, deadlineAt: '2026-06-30T10:00:00Z' } })} />)
    expect(screen.queryByText(/left/)).toBeNull()
  })

  it('honors a configured deadlineSoonHours threshold instead of the 24h default', () => {
    // 5h away: shows by default, but not once the threshold is lowered below it
    const deadlineAt = '2026-06-26T15:00:00Z'
    render(<GameCard {...props({ game: { ...game, deadlineAt }, deadlineSoonHours: 4 })} />)
    expect(screen.queryByText(/left/)).toBeNull()
  })

  it('flags a deadline that a raised threshold now covers', () => {
    // 2 days (48h) away: hidden by default, but shown once the threshold covers it
    const deadlineAt = '2026-06-28T10:00:00Z'
    render(<GameCard {...props({ game: { ...game, deadlineAt }, deadlineSoonHours: 72 })} />)
    expect(screen.getByText(/left/)).toBeInTheDocument()
  })

  it('calls onTogglePin when pin icon clicked', async () => {
    const onTogglePin = jest.fn()
    render(<GameCard {...props({ onTogglePin })} />)
    await userEvent.click(screen.getByRole('button', { name: /pin/i }))
    expect(onTogglePin).toHaveBeenCalledWith('bga:1')
  })

  it('calls onToggleSink when the sink icon is clicked, and shows a different glyph than the pin', async () => {
    const onToggleSink = jest.fn()
    render(<GameCard {...props({ onToggleSink })} />)
    const sinkButton = screen.getByRole('button', { name: /sink game/i })
    expect(sinkButton).toHaveTextContent('▽')
    await userEvent.click(sinkButton)
    expect(onToggleSink).toHaveBeenCalledWith('bga:1')
  })

  it('shows the filled sink glyph once a game is sunk, and a distinct label to un-sink it', () => {
    render(<GameCard {...props({ sunk: true })} />)
    const sinkButton = screen.getByRole('button', { name: /unsink/i })
    expect(sinkButton).toHaveTextContent('▼')
  })

  it('makes the whole card a link to the game, and calls onOpen so the dashboard can hide it', async () => {
    const onOpen = jest.fn()
    render(<GameCard {...props({ onOpen })} />)
    const link = screen.getByRole('link', { name: 'Open Wingspan' })
    expect(link).toHaveAttribute('href', game.gameUrl)
    link.addEventListener('click', e => e.preventDefault()) // jsdom can't navigate
    await userEvent.click(link)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('shows a note and saves an edited one', async () => {
    const onSaveNote = jest.fn()
    render(<GameCard {...props({ note: 'build mines', onSaveNote })} />)
    await userEvent.click(screen.getByText(/build mines/))
    const input = screen.getByRole('textbox', { name: /note for wingspan/i })
    await userEvent.clear(input)
    await userEvent.type(input, 'go for trains{Enter}')
    expect(onSaveNote).toHaveBeenCalledWith('bga:1', 'go for trains')
  })
})

describe('GameRow', () => {
  const waiting: Game = { ...game, myTurn: false, currentPlayer: 'alice', lastMoveAt: new Date('2026-06-15T10:00:00Z'), lastMoveAgo: '11 days ago' }

  it('shows who is up and marks a slow opponent', () => {
    render(<GameRow {...props({ game: waiting })} />)
    expect(screen.getByText(/waiting for alice/)).toBeInTheDocument()
    expect(screen.getByText(/⏱ 11 days ago/)).toBeInTheDocument()
  })

  it('adds a note from the pencil button', async () => {
    const onSaveNote = jest.fn()
    render(<GameRow {...props({ game: waiting, onSaveNote })} />)
    await userEvent.click(screen.getByRole('button', { name: /add a note/i }))
    await userEvent.type(screen.getByRole('textbox'), 'ask alice{Enter}')
    expect(onSaveNote).toHaveBeenCalledWith('bga:1', 'ask alice')
  })
})

describe('note deletion', () => {
  it('deletes a note with the small ✕ button', async () => {
    const onSaveNote = jest.fn()
    render(<GameCard {...props({ note: 'build mines', onSaveNote })} />)
    await userEvent.click(screen.getByRole('button', { name: /delete the note/i }))
    expect(onSaveNote).toHaveBeenCalledWith('bga:1', '')
  })
})

describe('progress bar', () => {
  const withProgress = { ...game, progress: { percent: 42, turnsSoFar: 21, estimatedTotalTurns: 50, sampleCount: 3, samples: [45, 50, 55], sameSizeOnly: false } }

  it('shows the percent when progress data is available', () => {
    render(<GameCard {...props({ game: withProgress })} />)
    expect(screen.getByText('42%')).toBeInTheDocument()
  })

  it('does not render anything when there is no progress estimate', () => {
    render(<GameCard {...props()} />)
    expect(screen.queryByText(/%/)).toBeNull()
  })

  it('stays hidden when the setting is switched off, even with data available', () => {
    render(<GameCard {...props({ game: withProgress, showProgress: false })} />)
    expect(screen.queryByText('42%')).toBeNull()
  })

  it('reveals the breakdown on hover', async () => {
    render(<GameCard {...props({ game: withProgress })} />)
    const bar = screen.getByLabelText(/turn 21 of an estimated 50/i)
    await userEvent.hover(bar)
    expect(screen.getByRole('tooltip')).toHaveTextContent('3 finished games')
  })

  it('renders the compact form on a row', () => {
    render(<GameRow {...props({ game: { ...withProgress, myTurn: false } })} />)
    expect(screen.getByText('42%')).toBeInTheDocument()
  })

  it('says "Move" instead of "Turn" for 18xx, since that\'s an action-log count, not a turn', async () => {
    const eighteenxxGame = { ...withProgress, platform: 'eighteenxx' as const }
    render(<GameCard {...props({ game: eighteenxxGame })} />)
    const bar = screen.getByLabelText(/move 21 of an estimated 50/i)
    await userEvent.hover(bar)
    expect(screen.getByRole('tooltip')).toHaveTextContent(/^Move 21/)
  })

  it('says the total is exact, not estimated, for a platform that reports it directly (choochoo)', async () => {
    const exactProgress = { percent: 83, turnsSoFar: 5, estimatedTotalTurns: 6, sampleCount: 0, samples: [], sameSizeOnly: false, exact: true }
    const choochooGame = { ...game, platform: 'choochoo' as const, progress: exactProgress }
    render(<GameCard {...props({ game: choochooGame })} />)
    const bar = screen.getByLabelText(/turn 5 of 6/i)
    await userEvent.hover(bar)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Turn 5 of 6 (reported by the game itself)')
  })

  it('clearly labels a time-based estimate as such, and does not say "turn"/"move"', async () => {
    const timeBasedProgress = { percent: 33, turnsSoFar: 86400, estimatedTotalTurns: 3 * 86400, sampleCount: 2, samples: [2 * 86400, 4 * 86400], sameSizeOnly: false, timeBased: true }
    const bgaGame = { ...game, progress: timeBasedProgress }
    render(<GameCard {...props({ game: bgaGame })} />)
    const bar = screen.getByLabelText(/time-based estimate/i)
    await userEvent.hover(bar)
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent(/Time-based estimate.*1 day in.*typically takes about 3 days/i)
    expect(tooltip).not.toHaveTextContent(/turn \d/i)
  })

  it('fades a time-based bar to tell it apart from a real turn/move count', () => {
    const timeBasedProgress = { percent: 33, turnsSoFar: 86400, estimatedTotalTurns: 3 * 86400, sampleCount: 2, samples: [2 * 86400, 4 * 86400], sameSizeOnly: false, timeBased: true }
    const bgaGame = { ...game, progress: timeBasedProgress }
    render(<GameCard {...props({ game: bgaGame })} />)
    const bar = screen.getByLabelText(/time-based estimate/i)
    expect(bar.firstElementChild).toHaveClass('opacity-60')
  })

  it('is a real button, not a span, so a long press wins over the card-link underneath it', () => {
    render(<GameCard {...props({ game: withProgress })} />)
    expect(screen.getByLabelText(/turn 21 of an estimated 50/i).tagName).toBe('BUTTON')
  })

  it('does not open the game when the bar itself is clicked', async () => {
    const onOpen = jest.fn()
    render(<GameCard {...props({ game: withProgress, onOpen })} />)
    await userEvent.click(screen.getByLabelText(/turn 21 of an estimated 50/i))
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('shows a quiet warning instead of a bar when the last read failed', () => {
    const errored = { ...game, progressError: 'timed out waiting for the game state' }
    render(<GameCard {...props({ game: errored })} />)
    expect(screen.getByText('⚠')).toBeInTheDocument()
    expect(screen.queryByText(/%/)).toBeNull()
  })

  it('reveals the failure reason on hover', async () => {
    const errored = { ...game, progressError: 'timed out waiting for the game state' }
    render(<GameCard {...props({ game: errored })} />)
    await userEvent.hover(screen.getByText('⚠'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('timed out waiting for the game state')
  })

  it('shows nothing at all when there is neither an estimate nor an error (the common case)', () => {
    render(<GameCard {...props()} />)
    expect(screen.queryByText('⚠')).toBeNull()
    expect(screen.queryByText(/%/)).toBeNull()
  })
})

describe('history link', () => {
  it('links a card and a row to the game history page, with the BGA game id', () => {
    const withKey = { ...game, gameKey: '1248' }
    const { unmount } = render(<GameCard {...props({ game: withKey })} />)
    expect(screen.getByRole('link', { name: /your history of wingspan/i })).toHaveAttribute('href', '/history/game?platform=bga&name=Wingspan&key=1248')
    unmount()
    render(<GameRow {...props({ game: { ...withKey, myTurn: false } })} />)
    expect(screen.getByRole('link', { name: /your history of wingspan/i })).toBeInTheDocument()
  })
})
