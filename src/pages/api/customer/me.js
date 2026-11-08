// GET  /api/customer/me  → the signed-in customer, or 401
// POST /api/customer/me  { action: 'logout' }               → sign out
//                        { action: 'profile', name, contact_phone, avatar_url }
//                        { action: 'password', password }
import { db, readCustomer, clearCustomerSession, publicCustomer, CUSTOMER_FIELDS, cleanPhone, validPhone } from '../../../lib/webSession'

export default async function handler(req, res) {
  if (req.method === 'POST' && req.body?.action === 'logout') {
    clearCustomerSession(res)
    return res.status(200).json({ ok: true })
  }

  const session = await readCustomer(req)
  if (!session) return res.status(401).json({ message: 'Not signed in.' })
  const { data: customer } = await db.from('customers').select(CUSTOMER_FIELDS).eq('id', session.id).maybeSingle()
  if (!customer) {
    clearCustomerSession(res)
    return res.status(401).json({ message: 'Not signed in.' })
  }

  if (req.method === 'GET') return res.status(200).json({ customer: publicCustomer(customer) })
  if (req.method !== 'POST') return res.status(405).end()

  const { action } = req.body || {}
  if (action === 'profile') {
    const updates = {}
    if (req.body.name !== undefined) {
      const name = String(req.body.name || '').trim().slice(0, 80)
      if (!name) return res.status(400).json({ message: 'Name cannot be empty' })
      updates.name = name
    }
    if (req.body.contact_phone !== undefined) {
      const p = req.body.contact_phone ? cleanPhone(req.body.contact_phone) : null
      if (p && !validPhone(p)) return res.status(400).json({ message: 'Enter a valid 10-digit phone number.' })
      updates.contact_phone = p
    }
    if (req.body.avatar_url !== undefined) {
      // Only pictures uploaded to our own avatar store.
      const url = String(req.body.avatar_url || '')
      const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/customer-avatars/`
      if (url && !url.startsWith(base)) return res.status(400).json({ message: 'Invalid picture.' })
      updates.avatar_url = url || null
    }
    const { data, error } = await db.from('customers').update(updates).eq('id', customer.id).select(CUSTOMER_FIELDS).single()
    if (error) return res.status(500).json({ message: 'Could not update profile.' })
    return res.status(200).json({ customer: publicCustomer(data) })
  }

  if (action === 'password') {
    const password = String(req.body.password || '').trim()
    if (password.length < 4) return res.status(400).json({ message: 'Password must be at least 4 characters.' })
    // Stored as a bcrypt hash by the database (trigger in web_001_lockdown.sql).
    const { error } = await db.from('customers').update({ password }).eq('id', customer.id)
    if (error) return res.status(500).json({ message: 'Could not update password.' })
    return res.status(200).json({ ok: true })
  }

  return res.status(400).json({ message: 'Unknown action.' })
}
