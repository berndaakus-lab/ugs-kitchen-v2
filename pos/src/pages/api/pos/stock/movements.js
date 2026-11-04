import { db, staffNames } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'
import { branchLocation } from '@/lib/stock'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET ?stock_item_id= — the last 100 stock changes at this branch (managers).
export default withAuth(async (req, res) => {
  const loc = await branchLocation(req.user.branch_id)
  let q = db.from('inv_movements')
    .select('id, qty, kind, source_type, source_id, staff_id, note, at, inv_stock_items(name, unit)')
    .eq('location_id', loc).order('at', { ascending: false }).limit(100)
  if (UUID.test(req.query.stock_item_id || '')) q = q.eq('stock_item_id', req.query.stock_item_id)
  const { data, error } = await q
  if (error) throw error
  const names = await staffNames(data.map(m => m.staff_id))
  return res.status(200).json({
    movements: data.map(({ inv_stock_items, staff_id, ...m }) => ({
      ...m, qty: Number(m.qty), name: inv_stock_items?.name, unit: inv_stock_items?.unit, by: names[staff_id] || null,
    })),
  })
}, { roles: ['manager'] })
