// POST /api/admin/login { username, pin } → signs in the owner or a staff member.
// The owner's PIN lives only on the server (ADMIN_PIN). NEXT_PUBLIC_ADMIN_PIN
// is still accepted so the switch-over needs no new env var, but it should be
// renamed to ADMIN_PIN (and changed: the old one was visible in the browser).
import crypto from 'crypto'
import { db, setStaffSession } from '../../../lib/webSession'

const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const username = String(req.body?.username || '').trim().toLowerCase()
  const pin      = String(req.body?.pin || '')
  if (!username || !pin) return res.status(400).json({ message: 'Enter your username and PIN.' })

  const ownerUser = (process.env.ADMIN_USERNAME || process.env.NEXT_PUBLIC_ADMIN_USERNAME || 'admin').toLowerCase()
  const ownerPin  = process.env.ADMIN_PIN || process.env.NEXT_PUBLIC_ADMIN_PIN

  if (username === ownerUser) {
    if (!ownerPin || !same(pin, ownerPin)) {
      await new Promise(r => setTimeout(r, 800))   // slow down guessing
      return res.status(401).json({ message: 'Wrong PIN. Try again.' })
    }
    const user = { id: null, name: 'Admin', role: 'admin', branch_id: null }
    await setStaffSession(res, user)
    return res.status(200).json({ user })
  }

  const { data, error } = await db.rpc('web_staff_login', { p_username: username, p_pin: pin })
  let row = Array.isArray(data) ? data[0] : data

  // Before migrations/web_001_lockdown.sql has been run the function doesn't
  // exist yet and PINs are still plain text: check them here instead.
  if (error) {
    const { data: s } = await db.from('staff').select('id, name, pin, role, is_active, branch_id').eq('username', username).maybeSingle()
    row = !s ? { ok: false, reason: 'not_found' }
      : !s.is_active ? { ok: false, reason: 'disabled' }
      : same(s.pin, pin) ? { ok: true, ...s } : { ok: false, reason: 'wrong_pin' }
  }

  if (!row?.ok) {
    const message = {
      not_found: 'Account not found.',
      disabled:  'Account is disabled. Contact admin.',
      locked:    'Too many wrong PINs. Try again in 10 minutes.',
    }[row?.reason] || 'Wrong PIN. Try again.'
    return res.status(401).json({ message })
  }

  const user = { id: row.id, name: row.name, role: row.role, branch_id: row.branch_id ?? null }
  await setStaffSession(res, user)
  return res.status(200).json({ user })
}
