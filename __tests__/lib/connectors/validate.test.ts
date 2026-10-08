import { checkGames } from '@/lib/connectors/validate'

const game = (id: string, gameName = 'Ark Nova', gameUrl = `https://x/${id}`) => ({ id, gameName, gameUrl })

describe('checkGames', () => {
  it('accepts normal games and an empty list', () => {
    expect(() => checkGames('obg', [game('1'), game('2', 'Unknown')])).not.toThrow()
    expect(() => checkGames('obg', [])).not.toThrow()
  })

  it('rejects a list where every game is unnamed', () => {
    expect(() => checkGames('obg', [game('1', 'Unknown'), game('2', '')])).toThrow('no name')
  })

  it('rejects games without a link', () => {
    expect(() => checkGames('rally', [game('1'), game('2', 'A', '')])).toThrow('no link')
  })

  it('rejects duplicate ids', () => {
    expect(() => checkGames('bga', [game('1'), game('1')])).toThrow('duplicate')
  })
})
