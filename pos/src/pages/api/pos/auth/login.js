import { db, rpc } from '@/lib/supabaseAdmin'
import { createSession, sendDbError } from '@/lib/session'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { username, pin } = req.body || {}
  if (!username || !/^[0-9]{4,6}$/.test(String(pin || ''))) {
    return res.status(400).json({ message: 'Enter your username and 4–6 digit PIN.' })
  }

  try {
    const rows = await rpc('pos_verify_pin', { p_username: username, p_pin: String(pin) })
    const match = rows?.[0]

    if (match?.locked) {
      return res.status(423).json({ message: 'Too many wrong PINs. Try again in 10 minutes or ask a manager.' })
    }
    if (!match?.pos_staff_id) {
      return res.status(401).json({ message: 'Wrong username or PIN.' })
    }

    // Admins aren't tied to a branch: start them on the first active one; they can switch.
    let q = db.from('branches').select('id, name')
    q = match.branch_id
      ? q.eq('id', match.branch_id)
      : q.eq('is_active', true).order('sort_order').limit(1)
    const { data: branch } = await q.maybeSingle()
    if (!branch) return res.status(409).json({ message: 'No active branch found. Create a branch in the online admin first.' })

    const user = {
      sid:         match.pos_staff_id,
      staff_id:    match.staff_id,
      name:        match.name,
      role:        match.pos_role,
      branch_id:   branch.id,
      branch_name: branch.name,
    }
    await createSession(res, user)
    return res.status(200).json({ user })
  } catch (err) {
    return sendDbError(res, err)
  }
}
