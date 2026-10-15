import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FinishTimelineChart, type ActiveGameEta } from '@/components/pace/charts'

const eta = (over: Partial<ActiveGameEta> = {}): ActiveGameEta => ({
  id: 'bga:1', platform: 'bga', game: 'thecrew', percent: 50, sampleCount: 10, etaSeconds: 2 * 86400, ...over,
})

describe('FinishTimelineChart', () => {
  it('says so when no active game has an estimate yet', () => {
    render(<FinishTimelineChart games={[]} names={{}} />)
    expect(screen.getByText(/No active games with an estimate yet/)).toBeInTheDocument()
  })

  it('leaves out games with no eta, rather than placing them on the timeline', () => {
    const { container } = render(
      <FinishTimelineChart games={[eta({ id: 'bga:1', etaSeconds: undefined }), eta({ id: 'bga:2' })]} names={{}} />,
    )
    expect(screen.queryByText(/No active games/)).toBeNull()
    expect(container.querySelectorAll('svg > g[opacity]')).toHaveLength(1)
  })

  it('draws a dotted bar for a time-based estimate and a solid one for a turn-based one', () => {
    const { container } = render(
      <FinishTimelineChart
        games={[eta({ id: 'bga:1', timeBased: true }), eta({ id: 'bga:2', timeBased: undefined })]}
        names={{}}
      />,
    )
    const lines = container.querySelectorAll('g > line')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toHaveAttribute('stroke-dasharray', '1 9')
    expect(lines[1]).not.toHaveAttribute('stroke-dasharray')
  })

  it('fades a row in proportion to its sample size, not as one on/off flag', () => {
    const { container } = render(
      <FinishTimelineChart
        games={[
          eta({ id: 'bga:1', sampleCount: 1 }),
          eta({ id: 'bga:2', sampleCount: 5 }),
          eta({ id: 'bga:3', sampleCount: 20 }),
        ]}
        names={{}}
      />,
    )
    const rows = container.querySelectorAll('svg > g[opacity]')
    expect(rows).toHaveLength(3)
    const opacities = Array.from(rows).map(r => Number(r.getAttribute('opacity')))
    expect(opacities[0]).toBeLessThan(opacities[1])
    expect(opacities[1]).toBeLessThan(opacities[2])
    expect(opacities[2]).toBe(1)
  })

  it('explains what dotted and faint mean in the hover tooltip', async () => {
    render(<FinishTimelineChart games={[eta({ id: 'bga:1', timeBased: true, sampleCount: 2 })]} names={{ thecrew: 'The Crew' }} />)
    const row = screen.getByText('The Crew').closest('g')!
    const hitArea = row.querySelector('rect')!
    await userEvent.hover(hitArea)
    const tooltip = await screen.findByText(/Dotted = time-based/)
    expect(tooltip.textContent).toMatch(/Fainter = fewer finished games/)
    expect(screen.getByText(/thin sample \(2\)/)).toBeInTheDocument()
  })
})
