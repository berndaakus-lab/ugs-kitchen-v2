import { rpc } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'

// POST { current_pin, new_pin } — any signed-in user changes their own PIN.
export default withAuth(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const current = String(req.body?.current_pin || '')
  const next = String(req.body?.new_pin || '')
  if (!/^[0-9]{4,6}$/.test(next)) return res.status(400).json({ message: 'New PIN must be 4–6 digits.' })
  if (current === next) return res.status(400).json({ message: 'New PIN must be different from the current one.' })

  const result = await rpc('pos_change_pin', { p_pos_staff: req.user.sid, p_current: current, p_new: next })
  if (result === 'locked') return res.status(423).json({ message: 'Too many wrong PINs. Try again in 10 minutes.' })
  if (result !== 'ok') return res.status(403).json({ message: 'Current PIN is incorrect.' })
  return res.status(200).json({ ok: true })
})
