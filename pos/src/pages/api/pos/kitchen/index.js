import { db } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'
import { branchLevels, dispatches } from '@/lib/stock'

// GET — everything the central kitchen needs on one screen: branches, stock
// items (with batch conversions), the last 7 days of deliveries and what each
// branch has left / sold today (to plan cooking).
export default withAuth(async (req, res) => {
  const [{ data: branches, error: e1 }, { data: items, error: e2 }, recent] = await Promise.all([
    db.from('branches').select('id, name').eq('is_active', true).order('sort_order'),
    db.from('inv_stock_items').select('*').eq('is_active', true).order('name'),
    dispatches({ sinceDays: 7 }),
  ])
  if (e1 || e2) throw e1 || e2

  const levels = {}
  for (const b of branches) {
    levels[b.id] = (await branchLevels(b.id)).map(i => ({
      stock_item_id: i.id, on_hand: i.on_hand, status: i.status, sold_today: i.today.sold,
    }))
  }
  return res.status(200).json({ branches, items, dispatches: recent, levels })
}, { perms: ['stock_send'] })
