// Server-only helpers for branch stock (Module 2). Tables and functions are
// in migrations/pos_007_branch_stock.sql.
import { db, rpc, staffNames } from './supabaseAdmin'

export const UNITS = ['plate', 'piece', 'pack', 'portion', 'kg', 'litre', 'bottle']
const SOLD = ['sale', 'online_sale']

export const branchLocation = branchId => rpc('inv_branch_location', { p_branch: branchId })

function dayStart(date = new Date()) {
  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00Z`).toISOString()
}

// Every active stock item with what this branch has now and today's movements.
export async function branchLevels(branchId) {
  const loc = await branchLocation(branchId)
  const [{ data: items, error: e1 }, { data: balances, error: e2 }, { data: moves, error: e3 }] = await Promise.all([
    db.from('inv_stock_items').select('*').eq('is_active', true).order('name'),
    db.from('inv_balances').select('stock_item_id, on_hand').eq('location_id', loc),
    db.from('inv_movements').select('stock_item_id, qty, kind').eq('location_id', loc).gte('at', dayStart()),
  ])
  if (e1 || e2 || e3) throw e1 || e2 || e3

  const onHand = Object.fromEntries(balances.map(b => [b.stock_item_id, Number(b.on_hand)]))
  const today = {}
  for (const m of moves) {
    const t = today[m.stock_item_id] ||= { received: 0, sold: 0, returned: 0, adjusted: 0 }
    const q = Number(m.qty)
    if (m.kind === 'receive') t.received += q
    else if (SOLD.includes(m.kind)) t.sold += -q
    else if (m.kind === 'sale_void' || m.kind === 'online_cancel') t.returned += q
    else t.adjusted += q   // count_adjust, waste, manual
  }
  return items.map(i => {
    const on = onHand[i.id] ?? 0
    return {
      ...i,
      on_hand: on,
      status: on <= 0 ? 'out' : on <= Number(i.low_level) ? 'low' : 'ok',
      today: today[i.id] || { received: 0, sold: 0, returned: 0, adjusted: 0 },
    }
  })
}

// Deliveries to a location (or all branches when locationId is null), newest first.
export async function dispatches({ toLocation = null, sinceDays = 7, status = null } = {}) {
  let q = db.from('inv_dispatches')
    .select('*, inv_dispatch_lines(id, stock_item_id, qty_sent, qty_received), to:inv_locations!inv_dispatches_to_location_fkey(name, branch_id)')
    .gte('sent_at', new Date(Date.now() - sinceDays * 864e5).toISOString())
    .order('sent_at', { ascending: false })
  if (toLocation) q = q.eq('to_location', toLocation)
  if (status) q = q.in('status', status)
  const { data, error } = await q
  if (error) throw error

  const itemIds = [...new Set(data.flatMap(d => d.inv_dispatch_lines.map(l => l.stock_item_id)))]
  const { data: items } = itemIds.length
    ? await db.from('inv_stock_items').select('id, name, unit').in('id', itemIds)
    : { data: [] }
  const byId = Object.fromEntries((items || []).map(i => [i.id, i]))
  const names = await staffNames(data.flatMap(d => [d.sent_by, d.received_by]))

  return data.map(({ inv_dispatch_lines, to, ...d }) => ({
    ...d,
    to_name:     to?.name,
    sent_by:     names[d.sent_by] || null,
    received_by: names[d.received_by] || null,
    lines: inv_dispatch_lines.map(l => ({
      ...l,
      qty_sent:     Number(l.qty_sent),
      qty_received: l.qty_received == null ? null : Number(l.qty_received),
      name:         byId[l.stock_item_id]?.name,
      unit:         byId[l.stock_item_id]?.unit,
    })),
  }))
}

// { menu_item_id: { left, low } } for a branch's tracked dishes.
export async function dishStock(branchId) {
  const rows = await rpc('menu_stock', { p_branch: branchId })
  return Object.fromEntries((rows || []).map(r => [r.menu_item_id, { left: r.left, low: r.low }]))
}
