// Alert emails go through Resend (resend.com): a single HTTPS call, no SMTP.
// Without a verified domain Resend only delivers to the account's own address,
// which is all a personal dashboard needs.
export async function sendAlertEmail(subject: string, text: string): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.ALERT_EMAIL
  if (!apiKey || !to) return { sent: false, reason: 'RESEND_API_KEY or ALERT_EMAIL not set' }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.ALERT_FROM || 'Board Games Dashboard <onboarding@resend.dev>',
      to: [to],
      subject,
      text,
    }),
  })
  if (!res.ok) return { sent: false, reason: `Resend HTTP ${res.status}: ${(await res.text()).slice(0, 300)}` }
  return { sent: true }
}
