// BGA table URLs are /{gameserver}/{slug}?table=ID or /{slug}?table=ID; game panels are /gamepanel?game={slug}
export function bgaSlugFromTableUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.searchParams.has('game')) return u.searchParams.get('game')
    if (!u.searchParams.has('table')) return null
    return u.pathname.split('/').filter(Boolean).pop() ?? null
  } catch {
    return null
  }
}

// The game's own page on BGA (where a table is started), from any BGA game URL
export function bgaGamePanelUrl(url: string): string | null {
  const slug = bgaSlugFromTableUrl(url)
  return slug ? `https://boardgamearena.com/gamepanel?game=${encodeURIComponent(slug)}` : null
}
