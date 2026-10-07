import { parseEighteenxxCatalog, titleFromModule } from '../eighteenxx'

// Shaped like 18xx.games' /assets/main.js (Opal-compiled Ruby)
const meta = (mod: string, consts: string) => `
Opal.modules["engine/game/${mod}/meta"] = function(Opal) {
  ${consts}
};
Opal.modules["engine/game/${mod}/entities"] = function(Opal) { $const_set($nesting[0], 'GAME_TITLE', "not a meta"); };
`
const bundle = [
  meta('g_1830', `$const_set($nesting[0], 'GAME_SUBTITLE', "Railways & Robber Barons");`),
  meta('g_18_chesapeake', ''),
  meta('g_1817_na', `$const_set($nesting[0], 'GAME_TITLE', "1817NA");`),
  meta('g_1822_africa', `$const_set($nesting[0], 'GAME_TITLE', "1822Africa");\n  $const_set($nesting[0], 'DEV_STAGE', "beta");`),
  meta('g_1807', `$const_set($nesting[0], 'DEV_STAGE', "prealpha");`),
].join('')

describe('titleFromModule', () => {
  it.each([
    ['g_1830', '1830'],
    ['g_18_chesapeake', '18Chesapeake'],
    ['g_18_royal_gorge', '18RoyalGorge'],
  ])('%s -> %s', (mod, title) => expect(titleFromModule(mod)).toBe(title))
})

describe('parseEighteenxxCatalog', () => {
  const entries = parseEighteenxxCatalog(bundle)

  it('lists every title that is not prealpha', () => {
    expect(entries.map(e => e.name)).toEqual(['1817NA', '1822Africa', '1830', '18Chesapeake'])
  })

  it('links to the new game page', () => {
    expect(entries[0].url).toBe('https://18xx.games/new_game')
  })

  it('throws when the bundle has no titles', () => {
    expect(() => parseEighteenxxCatalog('nothing here')).toThrow()
  })
})
