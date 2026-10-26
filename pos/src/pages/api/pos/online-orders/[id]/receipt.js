import { db } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'
import { getOrder } from '@/lib/onlineOrders'

// POST — print a receipt for a paid online order (read-only; the order is not
// changed). Every print is logged, like walk-in reprints.
export default withAuth(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })
  if (!/^\d+$/.test(String(req.query.id))) return res.status(404).json({ message: 'Order not found.' })

  const order = await getOrder(req.query.id, req.user.branch_id)
  if (!order) return res.status(404).json({ message: 'Order not found at this branch, or not paid.' })

  await db.from('pos_audit_log').insert({
    actor_id: req.user.sid,
    action:   'online_receipt',
    meta:     { order_id: order.id, order_no: order.order_no },
  })
  return res.status(200).json({ order, printed_by: req.user.name })
}, { roles: ['server', 'cashier'] })
