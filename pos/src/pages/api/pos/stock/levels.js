import { withAuth } from '@/lib/session'
import { branchLevels } from '@/lib/stock'

// GET — what this branch has now, with today's received / sold / adjusted.
export default withAuth(async (req, res) => {
  return res.status(200).json({ items: await branchLevels(req.user.branch_id) })
}, { roles: ['cashier', 'server'] })
