// GET /api/test-sms?to=0244XXXXXX
// Temporary debug endpoint — remove before going live
// Sends a test SMS and returns the full Nkomo response so we can see errors

export default async function handler(req, res) {
  const to      = req.query.to
  const apiKey  = process.env.NKOMO_API_KEY
  const sender  = process.env.NKOMO_SENDER_ID || 'UGsKitchen'

  // Show env var status without exposing the actual key
  const envCheck = {
    NKOMO_API_KEY:    apiKey  ? `set (${apiKey.slice(0,6)}...)` : 'MISSING ❌',
    NKOMO_SENDER_ID:  sender,
    OWNER_PHONE:      process.env.OWNER_PHONE || 'MISSING ❌',
    to:               to      || 'MISSING — add ?to=0244XXXXXX to the URL',
  }

  if (!apiKey) return res.status(200).json({ envCheck, error: 'NKOMO_API_KEY not set in Vercel env vars' })
  if (!to)     return res.status(200).json({ envCheck, error: 'Add ?to=0244XXXXXX to the URL' })

  // Convert to international format
  const clean = to.replace(/\D/g, '')
  const intl  = clean.startsWith('233') ? clean : '233' + clean.slice(1)

  const body = {
    sender:     sender,
    message:    'UGs Kitchen test SMS - if you see this it is working!',
    recipients: [intl],
  }

  let raw, status
  try {
    const r = await fetch('https://app.nkomosms.com/api/v3/sms/send', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body:    JSON.stringify(body),
    })
    status = r.status
    raw    = await r.text()
  } catch (err) {
    return res.status(200).json({ envCheck, request: body, error: err.message })
  }

  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = raw }

  return res.status(200).json({ envCheck, request: body, httpStatus: status, response: parsed })
}
