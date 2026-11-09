// POST /api/admin/login { username, pin } → signs in staff with their POS
// username and PIN (one login for both apps), or the owner's break-glass login.
// The owner's PIN lives only on the server (ADMIN_PIN; NEXT_PUBLIC_ADMIN_PIN is
// still read for older setups).
import crypto from 'crypto'
import { db, setStaffSession, staffUser, can } from '../../../lib/webSession'

const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

// Anything that opens a page on the website's staff side.
const WEB_PERMS = ['online_orders', 'online_orders_manage', 'delivery', 'menu', 'promos', 'reviews', 'branches', 'reports', 'export']

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const username = String(req.body?.username || '').trim().toLowerCase()
  const pin      = String(req.body?.pin || '')
  if (!username || !pin) return res.status(400).json({ message: 'Enter your username and PIN.' })

  const ownerUser = (process.env.ADMIN_USERNAME || process.env.NEXT_PUBLIC_ADMIN_USERNAME || 'admin').toLowerCase()
  const ownerPin  = process.env.ADMIN_PIN || process.env.NEXT_PUBLIC_ADMIN_PIN

  if (username === ownerUser && ownerPin) {
    if (!same(pin, ownerPin)) {
      await new Promise(r => setTimeout(r, 800))   // slow down guessing
      return res.status(401).json({ message: 'Wrong PIN. Try again.' })
    }
    await setStaffSession(res, { owner: true })
    return res.status(200).json({ user: await staffUser({ owner: true }) })
  }

  // Same check as the POS login: locks the account after 5 wrong PINs.
  const { data, error } = await db.rpc('pos_verify_pin', { p_username: username, p_pin: pin })
  if (error) {
    console.error('[admin/login]', error.message)
    return res.status(500).json({ message: 'Sign-in is unavailable. Please try again.' })
  }
  const match = Array.isArray(data) ? data[0] : data
  if (match?.locked) return res.status(423).json({ message: 'Too many wrong PINs. Try again in 10 minutes.' })
  if (!match?.pos_staff_id) {
    await new Promise(r => setTimeout(r, 600))
    return res.status(401).json({ message: 'Wrong username or PIN.' })
  }

  const user = await staffUser({ sid: match.pos_staff_id })
  if (!user) return res.status(401).json({ message: 'Account is disabled. Contact admin.' })
  if (!can(user, ...WEB_PERMS)) return res.status(403).json({ message: 'Your role has no access to the website admin.' })

  await setStaffSession(res, { sid: match.pos_staff_id })
  return res.status(200).json({ user })
}
