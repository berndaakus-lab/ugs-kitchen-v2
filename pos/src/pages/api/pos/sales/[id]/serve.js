import { rpc, loadSale } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'
import { broadcast } from '@/lib/broadcast'

// POST { items?: [{item_id, qty}] }  — omit items to serve everything remaining.
export default withAuth(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const items = Array.isArray(req.body?.items)
    ? req.body.items.filter(i => Number(i.qty) > 0).map(i => ({ item_id: i.item_id, qty: Number(i.qty) }))
    : null

  const status = await rpc('pos_serve', {
    p_sale:   req.query.id,
    p_staff:  req.user.sid,
    p_branch: req.user.branch_id,
    p_items:  items,
  })

  const sale = await loadSale(req.query.id)
  await broadcast(req.user.branch_id, 'sale_served', { id: sale.id, ticket_no: sale.ticket_no, status })
  return res.status(200).json({ sale })
}, { roles: ['server'] })
