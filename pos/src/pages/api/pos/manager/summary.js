import { db, today } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'
import { daySummary } from '@/lib/reports'

// GET ?date=YYYY-MM-DD&scope=branch|all  (scope=all = every branch, admin only)
export default withAuth(async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : today()
  const branchId = req.query.scope === 'all' && req.user.role === 'admin' ? null : req.user.branch_id

  let shiftsQ = db.from('pos_shifts')
    .select('id, staff_id, opened_at, closed_at, opening_float, expected_cash, counted_cash, variance')
    .gte('opened_at', `${date}T00:00:00Z`)
    .lte('opened_at', `${date}T23:59:59Z`)
    .order('opened_at')
  if (branchId) shiftsQ = shiftsQ.eq('branch_id', branchId)

  const [summary, { data: shifts }] = await Promise.all([daySummary(branchId, date), shiftsQ])
  return res.status(200).json({ summary, shifts: shifts || [] })
}, { roles: ['manager'] })
