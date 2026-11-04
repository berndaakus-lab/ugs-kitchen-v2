import { rpc } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'
import { broadcast } from '@/lib/broadcast'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST { dispatch_id, lines: [{line_id, qty_received}] } — confirm what arrived.
// Any staff member on duty may confirm; a line left out counts as "as sent".
export default withAuth(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })
  const { dispatch_id, lines = [] } = req.body || {}
  if (!UUID.test(dispatch_id || '')) return res.status(400).json({ message: 'Missing delivery.' })
  const clean = lines
    .filter(l => UUID.test(l.line_id || '') && l.qty_received !== '' && l.qty_received != null)
    .map(l => ({ line_id: l.line_id, qty_received: Number(l.qty_received) }))
  if (clean.some(l => !(l.qty_received >= 0))) return res.status(400).json({ message: 'Quantities must be 0 or more.' })

  const status = await rpc('inv_receive_dispatch', {
    p_dispatch: dispatch_id, p_branch: req.user.branch_id, p_lines: clean, p_staff: req.user.sid,
  })
  await broadcast(req.user.branch_id, 'stock_changed', {})
  return res.status(200).json({ status })
}, { roles: ['cashier', 'server'] })
