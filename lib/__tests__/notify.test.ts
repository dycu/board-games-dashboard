import { reportNotice, dismissNotice, subscribeNotices, Notice } from '../notify'

// The store is a plain module-level singleton, not reset between tests —
// drain it after each so one test's notices can't leak into the next.
afterEach(() => {
  const unsubscribe = subscribeNotices(current => current.forEach(n => dismissNotice(n.id)))
  unsubscribe()
})

describe('notify', () => {
  it('delivers a reported notice to a subscriber, including ones already there when it subscribes', () => {
    reportNotice('info', 'first')
    const seen: Notice[][] = []
    const unsubscribe = subscribeNotices(notices => seen.push(notices))
    expect(seen[0]).toHaveLength(1)
    expect(seen[0][0].message).toBe('first')
    unsubscribe()
  })

  it('notifies subscribers again when a new notice is reported', () => {
    const seen: Notice[][] = []
    const unsubscribe = subscribeNotices(notices => seen.push(notices))
    reportNotice('error', 'oops')
    expect(seen.at(-1)).toHaveLength(1)
    expect(seen.at(-1)?.[0]).toMatchObject({ kind: 'error', message: 'oops' })
    unsubscribe()
  })

  it('removes a notice by id on dismiss, leaving the others', () => {
    const idA = reportNotice('info', 'a')
    const idB = reportNotice('info', 'b')
    dismissNotice(idA)
    const seen: Notice[][] = []
    const unsubscribe = subscribeNotices(notices => seen.push(notices))
    expect(seen[0].map(n => n.id)).toEqual([idB])
    unsubscribe()
  })

  it('stops notifying once unsubscribed', () => {
    const seen: Notice[][] = []
    const unsubscribe = subscribeNotices(notices => seen.push(notices))
    unsubscribe()
    const before = seen.length
    reportNotice('info', 'after unsubscribe')
    expect(seen).toHaveLength(before)
  })

  it('gives each reported notice its own id', () => {
    const idA = reportNotice('info', 'a')
    const idB = reportNotice('info', 'b')
    expect(idA).not.toBe(idB)
  })
})
