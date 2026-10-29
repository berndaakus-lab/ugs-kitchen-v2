import { db } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'

// Read-only view of the online app's menu for this branch, plus the branch's
// working hours (set in the online admin) so the till knows when it's closed.
export default withAuth(async (req, res) => {
  const branchId = req.user.branch_id

  const [{ data: categories, error: e1 }, { data: items, error: e2 }, { data: branch }] = await Promise.all([
    db.from('categories').select('id, name, sort_order').eq('branch_id', branchId).order('sort_order'),
    db.from('menu_items')
      .select('id, category_id, name, price, image, sort_order')
      .eq('branch_id', branchId)
      .eq('is_available', true)
      .order('sort_order'),
    db.from('branches').select('business_hours').eq('id', branchId).maybeSingle(),
  ])
  if (e1 || e2) throw e1 || e2

  return res.status(200).json({ categories, items, business_hours: branch?.business_hours || null })
}, { roles: ['cashier'] })
