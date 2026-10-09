import { NewGameEvent, eventLabel } from './diff'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const SOURCE_TITLES: Record<NewGameEvent['source'], string> = {
  bga: 'BGA',
  eighteenxx: '18xx.games',
  rally: 'Rally the Troops',
  yucata: 'Yucata',
  'yucata-blog': 'Yucata blog',
}

export function newGamesEmail(events: NewGameEvent[]): { subject: string; text: string; html: string } {
  const groups = (Object.keys(SOURCE_TITLES) as NewGameEvent['source'][])
    .map(source => ({ source, events: events.filter(e => e.source === source) }))
    .filter(g => g.events.length > 0)

  const subject = '🆕 ' + groups.map(g => `${SOURCE_TITLES[g.source]}: ${g.events.length}`).join(', ')
  const text = groups.map(g => `${SOURCE_TITLES[g.source]}\n`
    + g.events.map(e => `- ${e.name} (${eventLabel(e)}) ${e.url}`).join('\n')).join('\n\n')
  const html = groups.map(g => `<h3 style="margin:16px 0 6px;font:600 14px sans-serif">${esc(SOURCE_TITLES[g.source])}</h3>`
    + `<ul style="margin:0;padding-left:18px;font:14px sans-serif">${g.events.map(e =>
      `<li style="margin:3px 0"><a href="${esc(e.url)}">${esc(e.name)}</a> <span style="color:#888">${esc(eventLabel(e))}</span></li>`).join('')}</ul>`).join('')
  return { subject, text, html }
}
