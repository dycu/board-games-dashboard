// How much to trust an estimate built from N finished games — shared by the
// Active tab's progress bars (components/ProgressBar.tsx) and the Pace
// page's finish-timeline chart (components/pace/charts.tsx), so both
// describe confidence the same way instead of each inventing its own cutoff.
// Breakpoints are picked from how this account's own sample counts actually
// cluster (roughly a third each under 3, 3-9, and 10+), not a round number.
export type SampleTier = 'thin' | 'moderate' | 'solid'

export function sampleTier(sampleCount: number): SampleTier {
  if (sampleCount < 3) return 'thin'
  if (sampleCount < 10) return 'moderate'
  return 'solid'
}

export function sampleConfidenceWord(sampleCount: number): string {
  const tier = sampleTier(sampleCount)
  return tier === 'thin' ? 'thin sample' : tier === 'moderate' ? 'moderate sample' : 'solid sample'
}
