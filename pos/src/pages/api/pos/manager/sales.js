import { db, today } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'

// GET ?date=YYYY-MM-DD&channel=all|walk_in|online&scope=branch|all
// Every sale for the day — walk-in and online — from sales_unified.
// scope=all (admin only) covers every branch.
export default withAuth(async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : today()
  const channel = ['walk_in', 'online'].includes(req.query.channel) ? req.query.channel : null
  const allBranches = req.query.scope === 'all' && req.user.role === 'admin'

  let q = db
    .from('sales_unified')
    .select('*')
    .eq('business_date', date)
    .order('sold_at', { ascending: false })
  if (!allBranches) q = q.eq('branch_id', req.user.branch_id)
  if (channel) q = q.eq('channel', channel)

  const { data, error } = await q
  if (error) throw error

  let sales = data
  if (allBranches) {
    const { data: branches } = await db.from('branches').select('id, name')
    const names = Object.fromEntries((branches || []).map(b => [b.id, b.name]))
    sales = data.map(s => ({ ...s, branch_name: names[s.branch_id] || '' }))
  }
  return res.status(200).json({ sales })
}, { roles: ['manager'] })
