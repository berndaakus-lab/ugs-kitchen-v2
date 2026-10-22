import { db, openShiftFor } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'

// POST { opening_float }
export default withAuth(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const existing = await openShiftFor(req.user.sid)
  if (existing) return res.status(200).json({ shift: existing })

  const float = Number(req.body?.opening_float ?? 0)
  if (!(float >= 0)) return res.status(400).json({ message: 'Enter the opening cash float.' })

  const { data: shift, error } = await db
    .from('pos_shifts')
    .insert({ branch_id: req.user.branch_id, staff_id: req.user.sid, opening_float: float })
    .select()
    .single()
  if (error) throw error

  return res.status(200).json({ shift })
}, { roles: ['cashier'] })
