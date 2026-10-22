import { rpc, loadSale } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'
import { broadcast } from '@/lib/broadcast'

// POST { manager_pin, reason } — always needs a manager's PIN, even when a
// manager is logged in, so every void has a deliberate approval.
export default withAuth(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { manager_pin, reason } = req.body || {}
  if (!String(reason || '').trim()) return res.status(400).json({ message: 'Enter a reason for the void.' })

  const managerId = await rpc('pos_verify_manager_pin', {
    p_branch: req.user.branch_id,
    p_pin:    String(manager_pin || ''),
  })
  if (!managerId) return res.status(403).json({ message: 'Manager PIN is incorrect.' })

  await rpc('pos_void', {
    p_sale:         req.query.id,
    p_branch:       req.user.branch_id,
    p_manager:      managerId,
    p_requested_by: req.user.sid,
    p_reason:       String(reason).trim(),
  })

  const sale = await loadSale(req.query.id)
  await broadcast(req.user.branch_id, 'sale_voided', { id: sale.id, ticket_no: sale.ticket_no })
  return res.status(200).json({ sale })
}, { roles: ['cashier'] })
