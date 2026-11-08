// POST /api/customer/code { phone, mode: 'signin' | 'signup', name? }
// Sends a 6-digit sign-in code by SMS. The customer proves they own the
// number before they can see its orders or account.
import { db, cleanPhone, validPhone } from '../../../lib/webSession'
import { sendCode } from '../../../lib/customerAuth'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const phone = cleanPhone(req.body?.phone)
  const mode  = req.body?.mode === 'signup' ? 'signup' : 'signin'
  const name  = String(req.body?.name || '').trim().slice(0, 80)
  if (!validPhone(phone)) return res.status(400).json({ message: 'Enter a valid 10-digit Ghana phone number.' })
  if (mode === 'signup' && !name) return res.status(400).json({ message: 'Please enter your name.' })

  const { data: existing } = await db.from('customers').select('id').eq('phone', phone).maybeSingle()
  if (mode === 'signin' && !existing) return res.status(404).json({ message: 'No account found for this number.' })
  if (mode === 'signup' && existing) return res.status(409).json({ message: 'An account with this number already exists. Please sign in.' })

  const r = await sendCode({
    key: 'signin:' + phone, phone, name: mode === 'signup' ? name : null,
    message: code => `Your UGs Kitchen sign-in code is ${code}. It expires in 10 minutes. Don't share it with anyone.`,
  })
  if (r.error) return res.status(429).json({ message: r.error })
  return res.status(200).json({ ok: true })
}
