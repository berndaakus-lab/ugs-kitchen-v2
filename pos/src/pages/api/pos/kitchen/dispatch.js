import { db, rpc } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'
import { broadcast } from '@/lib/broadcast'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST { branch_id, lines: [{stock_item_id, qty}], note? } — send food to a branch.
// The branch's stock only goes up when the branch confirms what arrived.
export default withAuth(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })
  const { branch_id, note } = req.body || {}
  const { data: branch } = await db.from('branches').select('id').eq('id', branch_id).eq('is_active', true).maybeSingle()
  if (!branch) return res.status(400).json({ message: 'Choose a branch.' })
  const lines = (req.body?.lines || [])
    .filter(l => UUID.test(l.stock_item_id || '') && Number(l.qty) > 0)
    .map(l => ({ stock_item_id: l.stock_item_id, qty: Math.round(Number(l.qty) * 100) / 100 }))

  const id = await rpc('inv_send_dispatch', { p_to_branch: branch_id, p_lines: lines, p_staff: req.user.sid, p_note: note || null })
  await broadcast(branch_id, 'delivery_sent', { id })
  return res.status(200).json({ id })
}, { roles: ['kitchen'] })
