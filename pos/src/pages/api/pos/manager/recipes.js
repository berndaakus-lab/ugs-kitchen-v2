import { db, rpc } from '@/lib/supabaseAdmin'
import { withAuth, can } from '@/lib/session'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Recipes: what one batch uses and makes.
// GET → recipes (inputs, and cost per unit made if allowed) + items
// POST { recipe: {id?, output_item, yield_qty, kitchen_kind, note, is_active, lines: [{input_item, qty}]} }
export default withAuth(async (req, res) => {
  if (req.method === 'GET') {
    const [{ data: recipes, error: e1 }, { data: items, error: e2 }] = await Promise.all([
      db.from('inv_recipes').select('*, inv_recipe_lines(input_item, qty)').order('created_at'),
      db.from('inv_stock_items').select('id, name, unit, kind, unit_cost, is_active').order('name'),
    ])
    if (e1 || e2) throw e1 || e2
    const showCost = can(req.user, 'food_cost')
    const cost = Object.fromEntries(items.map(i => [i.id, Number(i.unit_cost)]))
    return res.status(200).json({
      can_edit: can(req.user, 'recipes'),
      show_cost: showCost,
      items: items.map(i => ({ ...i, unit_cost: showCost ? Number(i.unit_cost) : undefined })),
      recipes: recipes.map(({ inv_recipe_lines: lines, ...r }) => ({
        ...r,
        yield_qty: Number(r.yield_qty),
        lines: lines.map(l => ({ input_item: l.input_item, qty: Number(l.qty) })),
        unit_cost: showCost ? Math.round(lines.reduce((t, l) => t + Number(l.qty) * (cost[l.input_item] || 0), 0) / Number(r.yield_qty) * 100) / 100 : undefined,
      })),
    })
  }
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })
  if (!can(req.user, 'recipes')) return res.status(403).json({ message: 'Not allowed for your role.' })

  const r = req.body?.recipe || {}
  if (!UUID.test(r.output_item || '')) return res.status(400).json({ message: 'Choose what the recipe makes.' })
  const yieldQty = Number(r.yield_qty)
  if (!(yieldQty > 0)) return res.status(400).json({ message: 'Enter how much one batch makes.' })
  const lines = (r.lines || []).filter(l => UUID.test(l.input_item || '') && Number(l.qty) > 0 && l.input_item !== r.output_item)
  if (!lines.length) return res.status(400).json({ message: 'Add at least one ingredient.' })
  const row = {
    output_item: r.output_item,
    yield_qty: yieldQty,
    kitchen_kind: ['central', 'satellite'].includes(r.kitchen_kind) ? r.kitchen_kind : 'any',
    note: String(r.note || '').trim() || null,
    is_active: r.is_active !== false,
  }
  let id = UUID.test(r.id || '') ? r.id : null
  if (id) {
    const { error } = await db.from('inv_recipes').update(row).eq('id', id)
    if (error) throw error
    await db.from('inv_recipe_lines').delete().eq('recipe_id', id)
  } else {
    const { data, error } = await db.from('inv_recipes').insert(row).select('id').single()
    if (error) throw error
    id = data.id
  }
  const merged = Object.values(lines.reduce((m, l) => {
    (m[l.input_item] ||= { recipe_id: id, input_item: l.input_item, qty: 0 }).qty += Number(l.qty)
    return m
  }, {}))
  const { error: e3 } = await db.from('inv_recipe_lines').insert(merged)
  if (e3) throw e3
  return res.status(200).json({ id, unit_cost: await rpc('inv_recipe_unit_cost', { p_recipe: id }) })
}, { perms: ['recipes', 'production', 'food_cost'] })
