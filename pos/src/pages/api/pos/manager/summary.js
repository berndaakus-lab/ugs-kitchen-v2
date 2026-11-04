import { db, today } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'
import { daySummary } from '@/lib/reports'
import { branchLevels, branchLocation, dispatches } from '@/lib/stock'

// GET ?date=YYYY-MM-DD&scope=branch|all  (scope=all = every branch, admin only)
// For one branch today it also returns `stock`: each tracked item's received /
// sold / adjusted today and what's left, plus short deliveries to flag.
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

  let stock = null
  if (branchId && date === today()) {
    const [items, recent] = await Promise.all([
      branchLevels(branchId),
      dispatches({ toLocation: await branchLocation(branchId), sinceDays: 2, status: ['received_short'] }),
    ])
    stock = {
      items: items.filter(i => i.on_hand !== 0 || Object.values(i.today).some(v => v !== 0)),
      short_deliveries: recent.map(d => ({
        id: d.id, sent_at: d.sent_at, received_at: d.received_at, received_by: d.received_by, sent_by: d.sent_by,
        lines: d.lines.filter(l => l.qty_received < l.qty_sent),
      })),
    }
  }
  return res.status(200).json({ summary, shifts: shifts || [], stock })
}, { roles: ['manager'] })
