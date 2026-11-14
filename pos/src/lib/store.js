// Server-only helpers for Module 3: the warehouse, the central kitchen and the
// satellite kitchens ("stores"). Tables and functions: migrations/pos_010_warehouse_kitchens.sql.
import { db, staffNames } from './supabaseAdmin'
import { can } from './permissions'

export const STORE_KINDS = ['warehouse', 'central', 'satellite']
export const KIND_LABEL = { warehouse: 'Warehouse', central: 'Central kitchen', satellite: 'Satellite kitchen', branch: 'Branch' }

export async function allLocations() {
  const { data, error } = await db.from('inv_locations').select('*').order('sort').order('name')
  if (error) throw error
  return data
}

// Which store a request is about. People who work across branches choose one
// (?location= / body.location); kitchen and warehouse staff are held to theirs.
export async function storeFor(req) {
  const wanted = req.query?.location || req.body?.location
  const u = req.user
  const id = u.scopeAll && wanted ? wanted : u.locationId
  if (!id) return { error: u.scopeAll ? 'Choose a kitchen or the warehouse.' : 'You are not assigned to a kitchen or the warehouse yet. Ask a manager (POS → Staff).' }
  const { data: loc } = await db.from('inv_locations').select('*').eq('id', id).maybeSingle()
  if (!loc || !STORE_KINDS.includes(loc.kind) || !loc.is_active) return { error: 'That kitchen or warehouse was not found.' }
  return { loc }
}

// The places a store may send to (same rule as inv_step_allowed in the database).
export function destinations(from, locations) {
  return locations.filter(t => t.is_active && t.id !== from.id && (
    (from.kind === 'warehouse' && ['central', 'satellite'].includes(t.kind)) ||
    (from.kind === 'central' && t.kind === 'satellite') ||
    (from.kind === 'satellite' && t.kind === 'branch' && t.supplied_by === from.id)))
}

const dayStart = () => `${new Date().toISOString().slice(0, 10)}T00:00:00Z`

// Everything the store screen shows for one place.
export async function storeSummary(loc, user) {
  const [items, balances, levels, locations, incoming, sentToday, moves] = await Promise.all([
    db.from('inv_stock_items').select('*').eq('is_active', true).order('name'),
    db.from('inv_balances').select('stock_item_id, on_hand').eq('location_id', loc.id),
    db.from('inv_levels').select('stock_item_id, reorder_level').eq('location_id', loc.id),
    allLocations(),
    db.from('inv_dispatches').select('id, from_location, status, note, sent_by, sent_at, received_at, inv_dispatch_lines(id, stock_item_id, qty_sent, qty_received)')
      .eq('to_location', loc.id).order('sent_at', { ascending: false }).limit(30),
    db.from('inv_dispatches').select('id, to_location, status, sent_at, received_at, inv_dispatch_lines(stock_item_id, qty_sent, qty_received)')
      .eq('from_location', loc.id).gte('sent_at', new Date(Date.now() - 3 * 864e5).toISOString()).order('sent_at', { ascending: false }),
    db.from('inv_movements').select('stock_item_id, qty, kind').eq('location_id', loc.id).gte('at', dayStart()),
  ])
  for (const r of [items, balances, levels, incoming, sentToday, moves]) if (r.error) throw r.error

  const onHand = Object.fromEntries(balances.data.map(b => [b.stock_item_id, Number(b.on_hand)]))
  const level = Object.fromEntries(levels.data.map(l => [l.stock_item_id, Number(l.reorder_level)]))
  const today = {}
  for (const m of moves.data) {
    const t = today[m.stock_item_id] ||= { in: 0, out: 0 }
    const q = Number(m.qty)
    if (q > 0) t.in += q; else t.out += -q
  }
  const showCost = can(user, 'food_cost', 'purchases')
  const stock = items.data
    .filter(i => onHand[i.id] != null || i.kind !== 'cooked' || loc.kind === 'satellite')
    .map(i => {
      const on = onHand[i.id] ?? 0
      const lvl = level[i.id] ?? Number(i.low_level)
      return {
        id: i.id, name: i.name, unit: i.unit, kind: i.kind, batch_label: i.batch_label, batch_yield: i.batch_yield,
        unit_cost: showCost ? Number(i.unit_cost) : undefined,
        on_hand: on, level: lvl, status: on <= 0 ? 'out' : on <= lvl ? 'low' : 'ok', today: today[i.id] || { in: 0, out: 0 },
      }
    })

  const byId = Object.fromEntries(locations.map(l => [l.id, l]))
  const names = await staffNames([...new Set(incoming.data.map(d => d.sent_by).filter(Boolean))])
  const itemName = Object.fromEntries(items.data.map(i => [i.id, i]))
  const lineView = l => ({ ...l, name: itemName[l.stock_item_id]?.name || '?', unit: itemName[l.stock_item_id]?.unit })
  return {
    location: { ...loc, kind_label: KIND_LABEL[loc.kind] },
    stock,
    destinations: destinations(loc, locations).map(t => ({ id: t.id, name: t.name, kind: t.kind })),
    incoming: incoming.data.map(d => ({ ...d, from_name: byId[d.from_location]?.name, sent_by_name: names[d.sent_by], inv_dispatch_lines: d.inv_dispatch_lines.map(lineView) })),
    sent: sentToday.data.map(d => ({ ...d, to_name: byId[d.to_location]?.name, inv_dispatch_lines: d.inv_dispatch_lines.map(lineView) })),
  }
}

// The stores a person can open: theirs, or all of them for all-branch people.
export async function storesFor(user) {
  const locations = await allLocations()
  return locations.filter(l => STORE_KINDS.includes(l.kind) && l.is_active && (user.scopeAll || l.id === user.locationId))
    .map(l => ({ id: l.id, name: l.name, kind: l.kind, kind_label: KIND_LABEL[l.kind] }))
}
