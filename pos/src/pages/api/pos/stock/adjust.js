import { rpc } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'
import { broadcast } from '@/lib/broadcast'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST { stock_item_id, qty, kind: 'waste'|'manual', note } — managers only.
// Waste always takes stock off; manual can be + or −. A reason is required.
export default withAuth(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })
  const { stock_item_id, qty, kind, note } = req.body || {}
  if (!UUID.test(stock_item_id || '')) return res.status(400).json({ message: 'Choose an item.' })
  if (!['waste', 'manual'].includes(kind)) return res.status(400).json({ message: 'Choose waste or correction.' })
  if (!Number(qty)) return res.status(400).json({ message: 'Enter a quantity.' })
  if (!String(note || '').trim()) return res.status(400).json({ message: 'Give a reason.' })

  await rpc('inv_adjust', {
    p_branch: req.user.branch_id, p_item: stock_item_id, p_qty: Number(qty), p_kind: kind,
    p_staff: req.user.sid, p_note: String(note).trim(),
  })
  await broadcast(req.user.branch_id, 'stock_changed', {})
  return res.status(200).json({ ok: true })
}, { roles: ['manager'] })
