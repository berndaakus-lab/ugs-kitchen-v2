import { db } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'

// GET — food cost per dish at the current branch, and every item's cost.
export default withAuth(async (req, res) => {
  const [{ data: dishes, error: e1 }, { data: items, error: e2 }] = await Promise.all([
    db.from('inv_dish_cost').select('*').eq('branch_id', req.user.branch_id).order('name'),
    db.from('inv_stock_items').select('id, name, unit, kind, unit_cost').eq('is_active', true).order('kind').order('name'),
  ])
  if (e1 || e2) throw e1 || e2
  return res.status(200).json({
    dishes: dishes.map(d => ({ ...d, price: Number(d.price), cost: Number(d.cost), cost_pct: d.cost_pct == null ? null : Number(d.cost_pct) })),
    items: items.map(i => ({ ...i, unit_cost: Number(i.unit_cost) })),
  })
}, { perms: ['food_cost'] })
