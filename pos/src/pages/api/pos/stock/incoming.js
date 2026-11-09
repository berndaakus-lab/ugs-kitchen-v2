import { withAuth } from '@/lib/session'
import { branchLocation, dispatches } from '@/lib/stock'

// GET — deliveries from the kitchen to this branch: waiting to be confirmed,
// plus the last 2 days of confirmed ones.
export default withAuth(async (req, res) => {
  const loc = await branchLocation(req.user.branch_id)
  const all = await dispatches({ toLocation: loc, sinceDays: 7 })
  const recentCut = Date.now() - 2 * 864e5
  return res.status(200).json({
    pending: all.filter(d => d.status === 'sent'),
    recent:  all.filter(d => d.status !== 'sent' && new Date(d.received_at).getTime() >= recentCut),
  })
}, { perms: ['stock_receive'] })
