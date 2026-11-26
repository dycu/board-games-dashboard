import { formatDepartedMessage } from '../useGamesData'
import { DepartedGame } from '../useGamesData'

const departed = (id: string, gameName: string, platform: DepartedGame['platform'] = 'bga'): DepartedGame => ({
  id, gameName, platform, gameUrl: `https://example.com/${id}`,
})

describe('formatDepartedMessage', () => {
  it('names a single finished game, as a clickable link', () => {
    const result = formatDepartedMessage([departed('bga:1', 'Navegador')])
    expect(result.message).toBe('✅ Finished:')
    expect(result.links).toEqual([{ label: 'Navegador', url: 'https://example.com/bga:1', external: false }])
  })

  it('names a few finished games, still one toast', () => {
    const result = formatDepartedMessage([departed('bga:1', 'Navegador'), departed('yucata:2', 'Brass', 'yucata')])
    expect(result.message).toBe('✅ 2 games finished:')
    expect(result.links).toEqual([
      { label: 'Navegador', url: 'https://example.com/bga:1', external: false },
      { label: 'Brass', url: 'https://example.com/yucata:2', external: true },
    ])
  })

  it('opens a non-BGA game in a new tab, BGA in the same one — same rule as GameLink', () => {
    const result = formatDepartedMessage([departed('yucata:1', 'Brass', 'yucata')])
    expect(result.links?.[0].external).toBe(true)
  })

  it('switches to just a count once there are too many to list', () => {
    const result = formatDepartedMessage([
      departed('bga:1', 'A'), departed('bga:2', 'B'), departed('bga:3', 'C'), departed('bga:4', 'D'),
    ])
    expect(result.message).toBe('✅ 4 games finished')
    expect(result.links).toBeUndefined()
  })
})
