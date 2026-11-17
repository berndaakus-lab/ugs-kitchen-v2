import { db } from '@/lib/supabaseAdmin'
import { withAuth, can } from '@/lib/session'
import { UNITS, ITEM_KINDS } from '@/lib/stock'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const count = (rows, key) => (rows || []).reduce((m, r) => { m[r[key]] = (m[r[key]] || 0) + 1; return m }, {})

// Stock items: add, change, archive or delete.
// GET → items with where each is used, units and types
// POST { action: 'save', item: {id?, name, kind, unit, batch_label, batch_yield, low_level, unit_cost?, is_active} }
//      New: Stock items / Purchases / Recipes people (so the warehouse can add
//      an item while buying). Change: Stock items people only.
// POST { action: 'delete', id }   Stock items people only. Deleted when it was
//      never used; otherwise archived so past sales and stock keep their name.
export default withAuth(async (req, res) => {
  const u = req.user
  const showCost = can(u, 'food_cost', 'purchases')

  if (req.method === 'GET') {
    const [items, links, recipeOut, recipeIn, balances] = await Promise.all([
      db.from('inv_stock_items').select('*').order('name'),
      db.from('inv_menu_usage').select('stock_item_id'),
      db.from('inv_recipes').select('output_item'),
      db.from('inv_recipe_lines').select('input_item'),
      db.from('inv_balances').select('stock_item_id, on_hand'),
    ])
    for (const r of [items, links, recipeOut, recipeIn, balances]) if (r.error) throw r.error
    const dishes = count(links.data, 'stock_item_id')
    const recipes = count([...recipeOut.data.map(r => ({ id: r.output_item })), ...recipeIn.data.map(r => ({ id: r.input_item }))], 'id')
    const held = {}
    for (const b of balances.data) held[b.stock_item_id] = (held[b.stock_item_id] || 0) + Number(b.on_hand)
    return res.status(200).json({
      units: UNITS,
      kinds: ITEM_KINDS,
      show_cost: showCost,
      can_edit: can(u, 'stock_setup'),
      can_add: can(u, 'stock_setup', 'purchases', 'recipes'),
      items: items.data.map(({ unit_cost, ...i }) => ({
        ...i,
        ...(showCost ? { unit_cost: Number(unit_cost) } : {}),
        used_in_dishes: dishes[i.id] || 0,
        used_in_recipes: recipes[i.id] || 0,
        in_stock: Math.round((held[i.id] || 0) * 100) / 100,
      })),
    })
  }

  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })
  const { action } = req.body || {}

  if (action === 'save') {
    const it = req.body.item || {}
    const isNew = !UUID.test(it.id || '')
    if (isNew ? !can(u, 'stock_setup', 'purchases', 'recipes') : !can(u, 'stock_setup')) {
      return res.status(403).json({ message: 'Ask a manager to change stock items.' })
    }
    const name = String(it.name || '').trim().slice(0, 60)
    if (!name) return res.status(400).json({ message: 'Give the item a name.' })
    if (!UNITS.includes(it.unit)) return res.status(400).json({ message: 'Choose what it is counted in.' })
    const batchYield = it.batch_yield === '' || it.batch_yield == null ? null : Number(it.batch_yield)
    if (batchYield !== null && !(batchYield > 0)) return res.status(400).json({ message: 'Bag / batch size must be more than 0.' })
    const row = {
      name, unit: it.unit,
      kind: ITEM_KINDS.includes(it.kind) ? it.kind : 'cooked',
      batch_label: String(it.batch_label || '').trim() || null,
      batch_yield: batchYield,
      low_level: Math.max(0, Number(it.low_level ?? 5) || 0),
      is_active: it.is_active !== false,
    }
    if (it.unit_cost !== undefined && it.unit_cost !== '' && showCost) {
      const c = Number(it.unit_cost)
      if (!(c >= 0)) return res.status(400).json({ message: 'Cost must be 0 or more.' })
      row.unit_cost = c
    }
    const q = isNew
      ? db.from('inv_stock_items').insert(row).select().single()
      : db.from('inv_stock_items').update(row).eq('id', it.id).select().single()
    const { data, error } = await q
    if (error?.code === '23505') return res.status(409).json({ message: `There is already a stock item called "${name}".` })
    if (error) throw error
    await db.from('pos_audit_log').insert({ actor_id: u.sid, action: isNew ? 'item_add' : 'item_update', meta: { id: data.id, name } })
    const { unit_cost, ...pub } = data
    return res.status(200).json({ item: showCost ? { ...pub, unit_cost: Number(unit_cost) } : pub })
  }

  if (action === 'delete') {
    if (!can(u, 'stock_setup')) return res.status(403).json({ message: 'Ask a manager to remove stock items.' })
    const id = req.body.id
    if (!UUID.test(id || '')) return res.status(400).json({ message: 'Item not found.' })
    const { data: item } = await db.from('inv_stock_items').select('id, name').eq('id', id).maybeSingle()
    if (!item) return res.status(404).json({ message: 'Item not found.' })
    const used = await Promise.all([
      db.from('inv_movements').select('id', { count: 'exact', head: true }).eq('stock_item_id', id),
      db.from('inv_menu_usage').select('menu_item_id', { count: 'exact', head: true }).eq('stock_item_id', id),
      db.from('inv_recipe_lines').select('recipe_id', { count: 'exact', head: true }).eq('input_item', id),
      db.from('inv_recipes').select('id', { count: 'exact', head: true }).eq('output_item', id),
      db.from('inv_purchase_lines').select('purchase_id', { count: 'exact', head: true }).eq('stock_item_id', id),
      db.from('inv_dispatch_lines').select('id', { count: 'exact', head: true }).eq('stock_item_id', id),
    ])
    const [moves, dishes, inRecipes, outRecipes, purchases, deliveries] = used.map(r => r.count || 0)
    if (moves + dishes + inRecipes + outRecipes + purchases + deliveries === 0) {
      const { error } = await db.from('inv_stock_items').delete().eq('id', id)
      if (error) throw error
      await db.from('pos_audit_log').insert({ actor_id: u.sid, action: 'item_delete', meta: { id, name: item.name } })
      return res.status(200).json({ removed: 'deleted' })
    }
    const { error } = await db.from('inv_stock_items').update({ is_active: false }).eq('id', id)
    if (error) throw error
    await db.from('pos_audit_log').insert({ actor_id: u.sid, action: 'item_archive', meta: { id, name: item.name } })
    const why = [dishes && `used by ${dishes} dish${dishes === 1 ? '' : 'es'}`, (inRecipes + outRecipes) && `in ${inRecipes + outRecipes} recipe${inRecipes + outRecipes === 1 ? '' : 's'}`, (moves || purchases || deliveries) && 'has stock history']
      .filter(Boolean).join(', ')
    return res.status(200).json({ removed: 'archived', why })
  }

  return res.status(400).json({ message: 'Unknown action.' })
}, { perms: ['stock_setup', 'purchases', 'recipes'] })
