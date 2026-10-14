import { estimateEighteenxxProgress } from '../progress'
import { EighteenxxSamples } from '../store'

describe('estimateEighteenxxProgress', () => {
  it('estimates from the median of finished games of the same title', () => {
    const samples: EighteenxxSamples = {
      '1846': [{ turn: 10, playerCount: 4 }, { turn: 12, playerCount: 4 }, { turn: 14, playerCount: 4 }],
    }
    expect(estimateEighteenxxProgress(samples, '1846', 6, 4)).toEqual({
      percent: 50, turnsSoFar: 6, estimatedTotalTurns: 12, sampleCount: 3, samples: [10, 12, 14], sameSizeOnly: true,
    })
  })

  it('returns undefined when turn is not a positive number', () => {
    const samples: EighteenxxSamples = { '1846': [{ turn: 10, playerCount: 4 }] }
    expect(estimateEighteenxxProgress(samples, '1846', 0, 4)).toBeUndefined()
    expect(estimateEighteenxxProgress(samples, '1846', undefined, 4)).toBeUndefined()
    expect(estimateEighteenxxProgress(samples, '1846', 'Draft Round', 4)).toBeUndefined()
  })

  it('returns undefined when there are no finished samples of this title', () => {
    expect(estimateEighteenxxProgress({}, '1846', 5, 4)).toBeUndefined()
  })

  it('ignores samples of a different title', () => {
    const samples: EighteenxxSamples = { '18USA': [{ turn: 10, playerCount: 4 }] }
    expect(estimateEighteenxxProgress(samples, '1846', 5, 4)).toBeUndefined()
  })

  it('prefers samples with the same player count, falling back when none match', () => {
    const samples: EighteenxxSamples = {
      '1846': [{ turn: 20, playerCount: 2 }, { turn: 8, playerCount: 4 }],
    }
    expect(estimateEighteenxxProgress(samples, '1846', 4, 4)).toMatchObject({ sampleCount: 1, samples: [8], sameSizeOnly: true })
    expect(estimateEighteenxxProgress(samples, '1846', 4, 7)).toMatchObject({ sampleCount: 2, sameSizeOnly: false })
  })

  it('clamps percent at 100', () => {
    const samples: EighteenxxSamples = { '1846': [{ turn: 10, playerCount: 4 }] }
    expect(estimateEighteenxxProgress(samples, '1846', 50, 4)?.percent).toBe(100)
  })
})
