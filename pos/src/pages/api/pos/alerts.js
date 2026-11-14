import { db, rpc } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'

// GET — open low-stock alerts for the places this person works at:
// all-branch people see every place; others their branch and their kitchen/warehouse.
export default withAuth(async (req, res) => {
  const u = req.user
  let q = db.from('inv_alerts')
    .select('id, location_id, level, on_hand, created_at, inv_locations(name, kind), inv_stock_items(name, unit)')
    .is('cleared_at', null).order('created_at', { ascending: false }).limit(200)
  if (!u.scopeAll) {
    const mine = [u.locationId].filter(Boolean)
    if ((u.scopes || []).includes('branch') && u.branch_id) mine.push(await rpc('inv_branch_location', { p_branch: u.branch_id }))
    if (!mine.length) return res.status(200).json({ alerts: [] })
    q = q.in('location_id', mine)
  }
  const { data, error } = await q
  if (error) return res.status(200).json({ alerts: [] })   // before pos_010 has run
  return res.status(200).json({
    alerts: data.map(a => ({
      id: a.id, place: a.inv_locations?.name, kind: a.inv_locations?.kind, item: a.inv_stock_items?.name,
      unit: a.inv_stock_items?.unit, on_hand: Number(a.on_hand), level: Number(a.level), since: a.created_at,
    })),
  })
})
