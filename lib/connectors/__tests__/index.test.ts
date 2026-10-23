/**
 * @jest-environment node
 */
import { makeConnectors, makeFinishedConnectors, hasCreds } from '../index'

jest.mock('../bga')
jest.mock('../eighteenxx')
jest.mock('../obg')
jest.mock('../yucata')
jest.mock('../hansa')
jest.mock('../rally')
jest.mock('../oldkingscrown')
jest.mock('../boardgamers')
jest.mock('../boardtogether')

const ALL = ['bga', 'eighteenxx', 'obg', 'yucata', 'choochoo', 'hansa', 'rally', 'oldkingscrown', 'boardgamers', 'boardtogether']

describe('makeConnectors', () => {
  it('has a fetcher for all 10 platforms', () => {
    expect(Object.keys(makeConnectors()).sort()).toEqual([...ALL].sort())
  })

  it('sends choochoo to its Node.js proxy route', () => {
    expect(() => makeConnectors().choochoo()).toThrow('/api/choochoo')
    expect(() => makeFinishedConnectors().choochoo!()).toThrow('/api/choochoo-finished')
  })
})

describe('hasCreds', () => {
  afterEach(() => {
    delete process.env.RALLY_USERNAME
    delete process.env.RALLY_PASSWORD
    delete process.env.HANSA_USER_ID
    delete process.env.BOARDGAMERS_USERNAME
    delete process.env.BOARDGAMERS_PASSWORD
    delete process.env.BOARDTOGETHER_USERNAME
    delete process.env.BOARDTOGETHER_PASSWORD
  })

  it('needs both username and password', () => {
    process.env.RALLY_USERNAME = 'u'
    expect(hasCreds('rally')).toBe(false)
    process.env.RALLY_PASSWORD = 'p'
    expect(hasCreds('rally')).toBe(true)
  })

  it('needs both username and password for boardgamers too (the generic prefix convention)', () => {
    process.env.BOARDGAMERS_USERNAME = 'u'
    expect(hasCreds('boardgamers')).toBe(false)
    process.env.BOARDGAMERS_PASSWORD = 'p'
    expect(hasCreds('boardgamers')).toBe(true)
  })

  it('needs both username and password for boardtogether too', () => {
    process.env.BOARDTOGETHER_USERNAME = 'u'
    expect(hasCreds('boardtogether')).toBe(false)
    process.env.BOARDTOGETHER_PASSWORD = 'p'
    expect(hasCreds('boardtogether')).toBe(true)
  })

  it('needs only a user id for Hansa and nothing for The Old King\'s Crown', () => {
    expect(hasCreds('hansa')).toBe(false)
    process.env.HANSA_USER_ID = 'id'
    expect(hasCreds('hansa')).toBe(true)
    expect(hasCreds('oldkingscrown')).toBe(true)
  })
})
