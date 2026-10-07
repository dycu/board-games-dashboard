import { parseChoochooCatalog, bundlePath } from '../choochoo'

// Shaped like choochoo.games' /dist/index.min.js (esbuild-minified)
const bundle = [
  'var J$="rust-belt",B2=class{constructor(){this.key=J$;this.name="Rust Belt";this.designer="John Bohrer";this.minPlayers=3;this.stage=4}};',
  'var Tp=class e{constructor(){this.key=e.key;this.name="Sweden Recycling";this.designer="Chad Krizen";this.minPlayers=2;this.stage=4}static{this.key="SwedenRecycling"}getOverrides(){return[]}};',
  'X=class{constructor(){this.key="montreal-metro";this.name="Montr\\xE9al M\\xE9tro";this.designer="A";this.minPlayers=2;this.stage=4}};',
  'Y=class{constructor(){this.key="chicago-l";this.name="Chicago L";this.designer="B";this.minPlayers=2;this.stage=1}};',
  'Z=class{constructor(){this.key="old-map";this.name="Old Map";this.designer="C";this.minPlayers=2;this.stage=5}};',
  'W=class{constructor(){this.key="pittsburgh";this.name="Pittsburgh";this.designer="D";this.minPlayers=2;this.stage=3}};',
  'M2=class{constructor(){this.key="poland";this.name="Poland";this.minPlayers=3;this.stage=4;this.designer="John Bohrer"}};',
  'Q=class{constructor(){this.key="x";this.name="Not a map"}};',
].join('')

describe('parseChoochooCatalog', () => {
  const entries = parseChoochooCatalog(bundle)

  it('lists released maps, sorted, skipping development (1) and deprecated (5) ones', () => {
    expect(entries.map(e => e.name)).toEqual(['Montréal Métro', 'Pittsburgh', 'Poland', 'Rust Belt', 'Sweden Recycling'])
  })

  it('links to game creation with the map selected', () => {
    expect(entries.find(e => e.name === 'Rust Belt')?.url).toBe('https://www.choochoo.games/app/games/create?map=rust-belt')
    expect(entries.find(e => e.name === 'Sweden Recycling')?.url).toBe('https://www.choochoo.games/app/games/create?map=SwedenRecycling')
  })

  it('throws when the bundle has no maps', () => {
    expect(() => parseChoochooCatalog('nothing here')).toThrow()
  })
})

describe('bundlePath', () => {
  it('finds the versioned bundle in the index page', () => {
    expect(bundlePath('<script src="/dist/index.min.js?v=05ae5"></script>')).toBe('/dist/index.min.js?v=05ae5')
  })
})
