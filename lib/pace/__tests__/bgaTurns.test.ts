import { extractTurns, BgaPacket } from '../bgaTurns'

const ME = '100'
const OTHER = '200'

const active = (id: string, time: number, player: string, name = 'playerTurn'): BgaPacket => ({
  packet_id: id, time: String(time),
  data: [{ type: 'gameStateChange', args: { type: 'activeplayer', active_player: player, name } }],
})
const auto = (id: string, time: number, player: string): BgaPacket => ({
  packet_id: id, time: String(time),
  data: [{ type: 'gameStateChange', args: { type: 'game', active_player: player, name: 'nextPlayer' } }],
})
const multi = (id: string, time: number, players: string[]): BgaPacket => ({
  packet_id: id, time: String(time),
  data: [
    { type: 'gameStateChange', args: { type: 'multipleactiveplayer', name: 'chooseCards' } },
    { type: 'gameStateMultipleActiveUpdate', args: players },
  ],
})
const multiUpdate = (id: string, time: number, players: string[]): BgaPacket => ({
  packet_id: id, time: String(time),
  data: [{ type: 'gameStateMultipleActiveUpdate', args: players }],
})

describe('extractTurns', () => {
  it('records a turn from becoming active to the turn passing on', () => {
    const { turns, state } = extractTurns([active('1', 100, OTHER), active('2', 200, ME), active('3', 500, OTHER)], ME)
    expect(turns).toEqual([[200, 500]])
    expect(state.openStart).toBeNull()
  })

  it('merges consecutive actions of mine separated by automatic states', () => {
    const { turns } = extractTurns([active('1', 100, ME), auto('2', 150, ME), active('3', 160, ME), active('4', 300, OTHER)], ME)
    expect(turns).toEqual([[100, 300]])
  })

  it('handles simultaneous phases via gameStateMultipleActiveUpdate', () => {
    const { turns } = extractTurns([
      multi('1', 100, [ME, OTHER]),
      multiUpdate('2', 120, [ME]),        // other player done, I'm still active
      multiUpdate('3', 400, []),          // I'm done
      active('4', 410, OTHER),
    ], ME)
    expect(turns).toEqual([[100, 400]])
  })

  it('does not split a turn on the empty-then-filled set inside one multiactive packet', () => {
    const { turns } = extractTurns([multi('1', 100, [ME]), multi('2', 200, [ME, OTHER]), active('3', 300, OTHER)], ME)
    expect(turns).toEqual([[100, 300]])
  })

  it('leaves the current turn open and resumes incrementally', () => {
    const first = extractTurns([active('1', 100, OTHER), active('2', 200, ME)], ME)
    expect(first.turns).toEqual([])
    expect(first.state).toMatchObject({ openStart: 200, lastPacketId: 2, lastTime: 200 })

    // BGA returns overlap before `from`; already-processed packets are skipped
    const second = extractTurns([active('1', 100, OTHER), active('2', 200, ME), active('3', 900, OTHER)], ME, first.state)
    expect(second.turns).toEqual([[200, 900]])
  })

  it('closes my turn when the game ends', () => {
    const { turns } = extractTurns([active('1', 100, ME), active('2', 250, ME, 'gameEnd')], ME)
    expect(turns).toEqual([[100, 250]])
  })

  it('sorts packets by packet id', () => {
    const { turns } = extractTurns([active('3', 500, OTHER), active('2', 200, ME)], ME)
    expect(turns).toEqual([[200, 500]])
  })
})
