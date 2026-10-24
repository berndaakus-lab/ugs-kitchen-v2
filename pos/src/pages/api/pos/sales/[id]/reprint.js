import { db, loadSale } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'

// POST { kind: 'ticket' | 'receipt' } — logged, because a duplicate food ticket
// could be used to collect food twice.
export default withAuth(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const kind = req.body?.kind === 'receipt' ? 'receipt' : 'ticket'
  const sale = await loadSale(req.query.id)
  if (sale.branch_id !== req.user.branch_id) return res.status(404).json({ message: 'Ticket not found.' })
  if (kind === 'ticket' && !['paid', 'partially_served'].includes(sale.status)) {
    return res.status(409).json({ message: 'Food tickets can only be reprinted before the food is fully served.' })
  }

  await db.from('pos_audit_log').insert({
    actor_id: req.user.sid,
    action:   `reprint_${kind}`,
    sale_id:  sale.id,
  })
  return res.status(200).json({ sale })
})
