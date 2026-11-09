import { db, openShiftFor } from '@/lib/supabaseAdmin'
import { withAuth, can } from '@/lib/session'

// POST { opening_float? }
// Someone who sells opens a cash shift (float, counted at the end). Everyone
// else whose role runs on shift opens a duty shift (clock in / clock out).
export default withAuth(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const existing = await openShiftFor(req.user.sid)
  if (existing) return res.status(200).json({ shift: existing })

  const cash = can(req.user, 'sell')
  if (!cash && !req.user.runsShift) return res.status(400).json({ message: 'Your role does not run on shifts.' })

  let row
  if (cash) {
    const float = Number(req.body?.opening_float ?? 0)
    if (!(float >= 0)) return res.status(400).json({ message: 'Enter the opening cash float.' })
    row = { kind: 'cash', branch_id: req.user.branch_id, staff_id: req.user.sid, opening_float: float }
  } else {
    // Kitchen-only people clock in at the kitchen, not at a branch.
    const atBranch = req.user.scopes.includes('branch') || req.user.scopeAll
    row = { kind: 'duty', branch_id: atBranch ? req.user.branch_id : null, staff_id: req.user.sid, opening_float: 0 }
  }

  const { data: shift, error } = await db.from('pos_shifts').insert(row).select().single()
  if (error) throw error
  return res.status(200).json({ shift })
}, {})
