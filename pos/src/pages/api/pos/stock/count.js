import { db, rpc } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'
import { broadcast } from '@/lib/broadcast'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST { lines: [{stock_item_id, counted}], note? } — closing count. Each
// counted item is set to what's actually there (leftovers carry over to
// tomorrow); the difference is recorded as a variance and returned.
export default withAuth(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })
  const lines = (req.body?.lines || [])
    .filter(l => UUID.test(l.stock_item_id || '') && l.counted !== '' && l.counted != null)
    .map(l => ({ stock_item_id: l.stock_item_id, counted: Number(l.counted) }))
  if (!lines.length) return res.status(400).json({ message: 'Enter at least one count.' })
  if (lines.some(l => !(l.counted >= 0))) return res.status(400).json({ message: 'Counts must be 0 or more.' })

  const countId = await rpc('inv_apply_count', {
    p_branch: req.user.branch_id, p_lines: lines, p_staff: req.user.sid, p_note: req.body?.note || null,
  })
  const { data: result } = await db
    .from('inv_count_lines')
    .select('stock_item_id, expected, counted, variance, inv_stock_items(name, unit)')
    .eq('count_id', countId)
  await broadcast(req.user.branch_id, 'stock_changed', {})
  return res.status(200).json({
    count_id: countId,
    lines: (result || []).map(l => ({
      name: l.inv_stock_items?.name, unit: l.inv_stock_items?.unit,
      expected: Number(l.expected), counted: Number(l.counted), variance: Number(l.variance),
    })),
  })
}, { roles: ['cashier', 'server'] })
