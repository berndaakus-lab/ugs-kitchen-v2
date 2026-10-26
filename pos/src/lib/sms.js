// Server-only Nkomo SMS sender (copied from the online app's src/lib/sms.js so
// the two apps stay independent). Uses the same NKOMO_API_KEY / NKOMO_SENDER_ID.

export function toInternational(phone) {
  const clean = String(phone).replace(/\D/g, '')
  if (clean.startsWith('233')) return clean
  if (clean.startsWith('0')) return '233' + clean.slice(1)
  return clean
}

export async function sendSMS({ to, message }) {
  const apiKey = process.env.NKOMO_API_KEY
  if (!apiKey) {
    console.warn('[pos sms] NKOMO_API_KEY not set — skipping SMS')
    return { ok: false, reason: 'no_api_key' }
  }
  try {
    const res = await fetch('https://app.nkomosms.com/api/v3/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        sender_id: process.env.NKOMO_SENDER_ID || 'UGsKitchen',
        message,
        recipient: toInternational(to),
      }),
      signal: AbortSignal.timeout(8000),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('[pos sms] Nkomo error:', res.status, body)
      return { ok: false, status: res.status, body }
    }
    return { ok: true, body }
  } catch (err) {
    console.error('[pos sms] network error:', err.message)
    return { ok: false, reason: err.message }
  }
}
