import { db, rpc } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'
import { UNITS } from '@/lib/stock'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Managers set up what is tracked:
// GET  → all stock items, and this branch's dishes with what each uses
// POST { action: 'save_item', item: {id?, name, unit, batch_label, batch_yield, low_level, is_active} }
// POST { action: 'set_links', menu_item_id, links: [{stock_item_id, qty}] }   ([] = untracked)
// POST { action: 'auto_link' }   link each unlinked dish 1:1 to a stock item of the same name
export default withAuth(async (req, res) => {
  const branchId = req.user.branch_id

  if (req.method === 'GET') {
    const [{ data: items, error: e1 }, { data: menu, error: e2 }] = await Promise.all([
      db.from('inv_stock_items').select('*').order('name'),
      db.from('menu_items').select('id, name, price, category_id, is_available, inv_menu_usage(stock_item_id, qty)')
        .eq('branch_id', branchId).order('sort_order'),
    ])
    if (e1 || e2) throw e1 || e2
    return res.status(200).json({
      units: UNITS,
      items,
      dishes: menu.map(({ inv_menu_usage, ...m }) => ({
        ...m, links: inv_menu_usage.map(u => ({ stock_item_id: u.stock_item_id, qty: Number(u.qty) })),
      })),
    })
  }

  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })
  const { action } = req.body || {}

  if (action === 'save_item') {
    const it = req.body.item || {}
    const name = String(it.name || '').trim()
    if (!name) return res.status(400).json({ message: 'Give the item a name.' })
    if (!UNITS.includes(it.unit)) return res.status(400).json({ message: 'Choose a unit.' })
    const batchYield = it.batch_yield === '' || it.batch_yield == null ? null : Number(it.batch_yield)
    if (batchYield !== null && !(batchYield > 0)) return res.status(400).json({ message: 'Batch yield must be more than 0.' })
    const row = {
      name, unit: it.unit,
      batch_label: String(it.batch_label || '').trim() || null,
      batch_yield: batchYield,
      low_level:   Math.max(0, Number(it.low_level ?? 5) || 0),
      is_active:   it.is_active !== false,
    }
    const q = UUID.test(it.id || '')
      ? db.from('inv_stock_items').update(row).eq('id', it.id).select().single()
      : db.from('inv_stock_items').insert(row).select().single()
    const { data, error } = await q
    if (error?.code === '23505') return res.status(409).json({ message: `There is already a stock item called "${name}".` })
    if (error) throw error
    return res.status(200).json({ item: data })
  }

  if (action === 'set_links') {
    const { menu_item_id } = req.body
    const links = (req.body.links || []).filter(l => UUID.test(l.stock_item_id || '') && Number(l.qty) > 0)
    const { data: dish } = await db.from('menu_items').select('id').eq('id', menu_item_id).eq('branch_id', branchId).maybeSingle()
    if (!dish) return res.status(404).json({ message: 'Dish not found at this branch.' })
    const { error: e1 } = await db.from('inv_menu_usage').delete().eq('menu_item_id', menu_item_id)
    if (e1) throw e1
    if (links.length) {
      const { error: e2 } = await db.from('inv_menu_usage')
        .insert(links.map(l => ({ menu_item_id, stock_item_id: l.stock_item_id, qty: Number(l.qty) })))
      if (e2) throw e2
    }
    return res.status(200).json({ ok: true })
  }

  if (action === 'auto_link') {
    const linked = await rpc('inv_auto_link', { p_branch: branchId })
    return res.status(200).json({ linked })
  }

  return res.status(400).json({ message: 'Unknown action.' })
}, { roles: ['manager'] })
