// POST /api/send-sms
// Client-facing endpoint so the API key never leaves the server.
// Body: { to: "0244XXXXXX", message: "..." }

import { sendSMS } from '../../lib/sms'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { to, message } = req.body ?? {}

  if (!to || !message) {
    return res.status(400).json({ message: 'Missing to or message' })
  }

  const result = await sendSMS({ to, message })
  return res.status(result.ok ? 200 : 500).json(result)
}
