import { withAuth } from '@/lib/session'
import { recentOrders, matchOrders } from '@/lib/onlineOrders'
import { today } from '@/lib/supabaseAdmin'

// GET ?q=  — paid online orders at this branch (read-only).
//   no q → today's; q = "#00A1B2" / phone → matches from the last 2 days
export default withAuth(async (req, res) => {
  const orders = await recentOrders(req.user.branch_id)
  return res.status(200).json({ orders: matchOrders(orders, req.query.q, today()) })
}, { roles: ['server', 'cashier'] })
