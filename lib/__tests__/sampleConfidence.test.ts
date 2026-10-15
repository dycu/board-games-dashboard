import { sampleTier, sampleConfidenceWord } from '../sampleConfidence'

describe('sampleTier', () => {
  it.each([
    [0, 'thin'], [1, 'thin'], [2, 'thin'],
    [3, 'moderate'], [5, 'moderate'], [9, 'moderate'],
    [10, 'solid'], [20, 'solid'], [100, 'solid'],
  ])('%i samples -> %s', (count, tier) => {
    expect(sampleTier(count)).toBe(tier)
  })
})

describe('sampleConfidenceWord', () => {
  it('describes each tier in words', () => {
    expect(sampleConfidenceWord(1)).toBe('thin sample')
    expect(sampleConfidenceWord(5)).toBe('moderate sample')
    expect(sampleConfidenceWord(15)).toBe('solid sample')
  })
})
