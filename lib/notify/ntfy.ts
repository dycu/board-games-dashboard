// A push notification via ntfy.sh — no account or API key, just a topic
// string both the server and the phone's ntfy app agree on. The JSON publish
// form (rather than headers) sidesteps any header-encoding issues with
// non-ASCII game names.
export async function sendNtfy(topic: string, title: string, message: string, click?: string): Promise<{ sent: boolean; reason?: string }> {
  if (!topic) return { sent: false, reason: 'no ntfy topic configured' }
  try {
    const res = await fetch('https://ntfy.sh/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, title, message, priority: 4, ...(click && { click }) }),
    })
    if (!res.ok) return { sent: false, reason: `ntfy HTTP ${res.status}` }
    return { sent: true }
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : String(e) }
  }
}
