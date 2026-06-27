import { Game } from '../types'

// onlineboardgamers.com is protected by Cloudflare's bot challenge on all paths
// including all API endpoints — inaccessible from Vercel server-side functions.
export async function fetchOBG(_username: string, _password: string): Promise<Game[]> {
  throw new Error('OBG is blocked by Cloudflare bot protection (not accessible from server-side)')
}
