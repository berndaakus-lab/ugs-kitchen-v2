// Server-only: the owner dashboard / reports (Module 4). One builder feeds the
// dashboard API, the Excel export and the print (PDF) page, so the numbers are
// always the same everywhere.
//
// Sales come from sales_unified (walk-in + online together). Walk-in details the
// view doesn't carry (cashier, split payments, who approved a void) come from
// pos_sales. Ghana is UTC all year: a sale's day is its business_date and its
// hour is the UTC hour.
import { db, staffNames, today } from './supabaseAdmin'
import { can } from './permissions'

const DAY = 864e5
const MAX_DAYS = 366
const PAGE = 1000 // Supabase returns at most 1000 rows per request
const round = n => Math.round(n * 100) / 100
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '')
export const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY)

// Payment methods, grouped the way the owner thinks of them.
export const METHOD_GROUPS = [['cash', 'Cash'], ['momo', 'MoMo'], ['card', 'Card'], ['other', 'Other']]
const methodGroup = m => {
  if (!m) return 'other'
  if (m === 'cash') return 'cash'
  if (['momo_paystack', 'momo_manual', 'mobile_money'].includes(m)) return 'momo'
  if (m === 'card') return 'card'
  return 'other'
}

// Every row of a query, page by page. `build` returns a fresh query each time.
async function fetchAll(build) {
  const rows = []
  for (let page = 0; page < 200; page++) {
    const { data, error } = await build().range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) throw error
    rows.push(...data)
    if (data.length < PAGE) break
  }
  return rows
}

// Read and check the filters. People who don't work across branches always get
// their own branch, whatever they ask for.
export function parseFilters(query, user) {
  let from = isDate(query.from) ? query.from : today()
  let to = isDate(query.to) ? query.to : from
  if (to < from) [from, to] = [to, from]
  if (daysBetween(from, to) >= MAX_DAYS) from = addDays(to, -(MAX_DAYS - 1))
  const branchId = user.scopeAll
    ? (query.branch && query.branch !== 'all' ? String(query.branch) : null)
    : user.branch_id
  return {
    from, to, branchId,
    channel: ['walk_in', 'online'].includes(query.channel) ? query.channel : null,
    method: ['cash', 'momo', 'card', 'other'].includes(query.method) ? query.method : null,
    staff: /^[0-9a-f-]{36}$/i.test(query.staff || '') ? query.staff : null,
  }
}

export async function buildReport(user, f) {
  const { from, to, branchId, channel, method, staff } = f
  const endTs = `${addDays(to, 1)}T00:00:00Z`
  const startTs = `${from}T00:00:00Z`
  const scoped = (q, col = 'branch_id') => (branchId ? q.eq(col, branchId) : q)
  const showCost = can(user, 'food_cost')

  // Previous period of the same length, for "vs last period" on the total.
  const span = daysBetween(from, to) + 1
  const prevFrom = addDays(from, -span), prevTo = addDays(from, -1)

  const [unified, walkIn, prevRows, shifts, serves, branches, menu, categories, locations] = await Promise.all([
    fetchAll(() => {
      let q = db.from('sales_unified')
        .select('channel, sale_ref, branch_id, sold_at, business_date, total, status, items, payment, pos_sale_id')
        .gte('business_date', from).lte('business_date', to)
        .order('sold_at').order('sale_ref')
      if (channel) q = q.eq('channel', channel)
      return scoped(q)
    }),
    channel === 'online' ? [] : fetchAll(() => scoped(db.from('pos_sales')
      .select('id, cashier_id, voided_by_id, void_reason, voided_at, pos_payments(method, amount, status)')
      .gte('business_date', from).lte('business_date', to).order('id'))),
    method || staff ? null : fetchAll(() => {
      let q = db.from('sales_unified').select('channel, sale_ref, total, status')
        .gte('business_date', prevFrom).lte('business_date', prevTo).neq('status', 'voided').order('sale_ref')
      if (channel) q = q.eq('channel', channel)
      return scoped(q)
    }),
    fetchAll(() => scoped(db.from('pos_shifts')
      .select('id, branch_id, staff_id, opened_at, closed_at, opening_float, expected_cash, counted_cash, variance')
      .gte('opened_at', startTs).lt('opened_at', endTs).order('opened_at'))),
    channel === 'online' ? [] : fetchAll(() => scoped(db.from('pos_serve_events')
      .select('id, staff_id, sale_id, items, at, pos_sales!inner(branch_id)')
      .gte('at', startTs).lt('at', endTs).order('id'), 'pos_sales.branch_id')),
    db.from('branches').select('id, name, is_active, sort_order').order('sort_order').then(r => { if (r.error) throw r.error; return r.data }),
    fetchAll(() => scoped(db.from('menu_items').select('id, name, category_id, is_available, branch_id').order('id'))),
    db.from('categories').select('id, name').then(r => { if (r.error) throw r.error; return r.data }),
    db.from('inv_locations').select('id, name, kind, branch_id').then(r => (r.error ? [] : r.data)),
  ])

  const branchName = Object.fromEntries(branches.map(b => [b.id, b.name]))
  const catName = Object.fromEntries(categories.map(c => [c.id, c.name]))
  const menuById = Object.fromEntries(menu.map(m => [m.id, m]))
  const detail = Object.fromEntries(walkIn.map(s => [s.id, s]))

  // ── One clean line per sale, filters applied ──────────────────
  const all = unified.map(r => {
    const d = r.pos_sale_id ? detail[r.pos_sale_id] : null
    const total = Number(r.total)
    const payments = r.channel === 'online'
      ? [{ group: methodGroup(r.payment), method: r.payment || 'online', amount: total }]
      : (d?.pos_payments || []).filter(p => p.status === 'success')
        .map(p => ({ group: methodGroup(p.method), method: p.method, amount: Number(p.amount) }))
    return {
      channel: r.channel, ref: r.sale_ref, branch_id: r.branch_id, at: r.sold_at, date: r.business_date,
      total, status: r.status, voided: r.status === 'voided', items: r.items || [], payments,
      cashier_id: d?.cashier_id || null, voided_by_id: d?.voided_by_id || null,
      void_reason: d?.void_reason || null, voided_at: d?.voided_at || null,
    }
  })
  const staffInData = new Set([...all.map(s => s.cashier_id), ...serves.map(e => e.staff_id), ...shifts.map(s => s.staff_id)].filter(Boolean))

  const sales = all.filter(s =>
    (!method || s.payments.some(p => p.group === method)) &&
    (!staff || s.cashier_id === staff))
  const counted = sales.filter(s => !s.voided)
  const voided = sales.filter(s => s.voided)

  // ── Sales totals ───────────────────────────────────────────────
  const sum = rows => round(rows.reduce((t, s) => t + s.total, 0))
  const walk = counted.filter(s => s.channel === 'walk_in')
  const online = counted.filter(s => s.channel === 'online')

  const byDay = {}
  for (let d = from; d <= to; d = addDays(d, 1)) byDay[d] = { date: d, walk_in: 0, online: 0, total: 0, count: 0 }
  const byBranch = {}
  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, total: 0, count: 0 }))
  const byMethod = Object.fromEntries(METHOD_GROUPS.map(([k]) => [k, { walk_in: 0, online: 0, total: 0, count: 0 }]))
  const items = {}
  for (const s of counted) {
    const day = byDay[s.date]
    if (day) { day[s.channel] = round(day[s.channel] + s.total); day.total = round(day.total + s.total); day.count += 1 }
    const b = byBranch[s.branch_id] ||= { branch_id: s.branch_id, name: branchName[s.branch_id] || 'Unknown branch', walk_in: 0, online: 0, total: 0, count: 0 }
    b[s.channel] = round(b[s.channel] + s.total); b.total = round(b.total + s.total); b.count += 1
    const h = byHour[new Date(s.at).getUTCHours()]
    h.total = round(h.total + s.total); h.count += 1
    for (const p of s.payments) {
      const m = byMethod[p.group]
      m[s.channel] = round(m[s.channel] + p.amount); m.total = round(m.total + p.amount)
    }
    for (const g of new Set(s.payments.map(p => p.group))) byMethod[g].count += 1
    for (const i of s.items) {
      const name = i.name || 'Unknown item'
      const qty = Number(i.quantity || 0)
      const row = items[name] ||= { name, category: null, qty: 0, amount: 0, walk_in_qty: 0, online_qty: 0, ids: new Set() }
      row.qty += qty
      row[`${s.channel}_qty`] += qty
      row.amount = round(row.amount + qty * Number(i.price || 0))
      if (i.id) row.ids.add(i.id)
      if (!row.category && menuById[i.id]) row.category = catName[menuById[i.id].category_id] || null
    }
  }

  // Items: best first; dishes on the menu that sold nothing are listed apart.
  const itemList = Object.values(items).sort((a, b) => b.qty - a.qty || b.amount - a.amount)
  const totalItemSales = itemList.reduce((t, i) => t + i.amount, 0)
  const soldNames = new Set(itemList.map(i => i.name))
  const notSold = [...new Set(menu.filter(m => m.is_available !== false && !soldNames.has(m.name)).map(m => m.name))].sort()

  const byCategory = {}
  for (const i of itemList) {
    const c = byCategory[i.category || 'Other'] ||= { name: i.category || 'Other', qty: 0, amount: 0 }
    c.qty += i.qty
    c.amount = round(c.amount + i.amount)
  }

  // Food cost of what was sold (only for people who may see costs).
  let foodCost = null
  const menuIds = [...new Set(itemList.flatMap(i => [...i.ids]))]
  if (showCost && menuIds.length) {
    const costs = {}
    for (let i = 0; i < menuIds.length; i += 200) {
      const { data, error } = await db.from('inv_dish_cost').select('menu_item_id, cost, links').in('menu_item_id', menuIds.slice(i, i + 200))
      if (error) break
      for (const c of data) if (c.links > 0) costs[c.menu_item_id] = Number(c.cost)
    }
    let cost = 0, costedSales = 0, uncosted = new Set()
    for (const s of counted) for (const i of s.items) {
      const qty = Number(i.quantity || 0)
      if (costs[i.id] != null) { cost += qty * costs[i.id]; costedSales += qty * Number(i.price || 0) }
      else uncosted.add(i.name)
    }
    foodCost = {
      cost: round(cost), costed_sales: round(costedSales),
      pct: costedSales > 0 ? Math.round((cost / costedSales) * 1000) / 10 : null,
      uncosted: [...uncosted].sort(),
    }
  }

  // ── Cash: shifts and shortages ─────────────────────────────────
  const shiftRows = shifts.filter(s => !staff || s.staff_id === staff)
  const drawerShifts = shiftRows.filter(s => s.closed_at && s.variance != null)
  const short = round(drawerShifts.filter(s => Number(s.variance) < 0).reduce((t, s) => t + Number(s.variance), 0))
  const over = round(drawerShifts.filter(s => Number(s.variance) > 0).reduce((t, s) => t + Number(s.variance), 0))

  // ── Staff ──────────────────────────────────────────────────────
  const cashiers = {}
  const cashier = id => (cashiers[id] ||= { id, sales_count: 0, total: 0, voids_count: 0, voids_total: 0, short: 0, over: 0, shifts: 0 })
  for (const s of walk) { const c = cashier(s.cashier_id); c.sales_count += 1; c.total = round(c.total + s.total) }
  for (const s of voided.filter(v => v.cashier_id)) { const c = cashier(s.cashier_id); c.voids_count += 1; c.voids_total = round(c.voids_total + s.total) }
  for (const s of drawerShifts) {
    const c = cashier(s.staff_id); const v = Number(s.variance)
    c.shifts += 1
    if (v < 0) c.short = round(c.short + v); else c.over = round(c.over + v)
  }
  const servers = {}
  for (const e of serves.filter(e => !staff || e.staff_id === staff)) {
    const sv = servers[e.staff_id] ||= { id: e.staff_id, tickets: new Set(), item_count: 0 }
    sv.tickets.add(e.sale_id)
    sv.item_count += (e.items || []).reduce((t, i) => t + Number(i.qty || 0), 0)
  }

  // ── Stock at the branches, and what the warehouse / kitchens sent ──
  const stock = await stockReport({ locations, branchId, startTs, endTs })

  const names = await staffNames([...staffInData, ...voided.map(v => v.voided_by_id), ...stock.staffIds])
  const nameOf = id => (id ? names[id] || 'Unknown' : '—')

  const prevTotal = prevRows ? round(prevRows.reduce((t, s) => t + Number(s.total), 0)) : null

  return {
    filters: { ...f, days: span },
    can_cost: showCost,
    can_export: can(user, 'export'),
    branches: branches.filter(b => b.is_active !== false).map(b => ({ id: b.id, name: b.name })),
    branch_name: branchId ? branchName[branchId] || '' : 'All branches',
    staff_options: [...staffInData].map(id => ({ id, name: nameOf(id) })).sort((a, b) => a.name.localeCompare(b.name)),
    kpis: {
      total: sum(counted), count: counted.length,
      avg: counted.length ? round(sum(counted) / counted.length) : 0,
      walk_in: { total: sum(walk), count: walk.length },
      online: { total: sum(online), count: online.length },
      voids: { total: sum(voided), count: voided.length },
      previous: prevTotal == null ? null : { from: prevFrom, to: prevTo, total: prevTotal, count: prevRows.length },
      food_cost: foodCost,
    },
    by_day: Object.values(byDay),
    by_branch: Object.values(byBranch).sort((a, b) => b.total - a.total),
    by_hour: byHour,
    by_method: METHOD_GROUPS.map(([k, label]) => ({ key: k, label, ...byMethod[k] })),
    by_category: Object.values(byCategory).sort((a, b) => b.amount - a.amount),
    items: itemList.map(({ ids, ...i }) => ({ ...i, share: totalItemSales ? Math.round((i.amount / totalItemSales) * 1000) / 10 : 0 })),
    not_sold: notSold,
    cash: {
      short, over, net: round(short + over), closed: drawerShifts.length,
      shifts: shiftRows.map(s => ({
        id: s.id, branch: branchName[s.branch_id] || '', staff: nameOf(s.staff_id),
        opened_at: s.opened_at, closed_at: s.closed_at,
        opening_float: s.opening_float == null ? null : Number(s.opening_float),
        expected_cash: s.expected_cash == null ? null : Number(s.expected_cash),
        counted_cash: s.counted_cash == null ? null : Number(s.counted_cash),
        variance: s.variance == null ? null : Number(s.variance),
      })),
    },
    cashiers: Object.values(cashiers).filter(c => c.id)
      .map(c => ({ ...c, name: nameOf(c.id), avg: c.sales_count ? round(c.total / c.sales_count) : 0 }))
      .sort((a, b) => b.total - a.total),
    servers: Object.values(servers)
      .map(s => ({ id: s.id, name: nameOf(s.id), ticket_count: s.tickets.size, item_count: s.item_count }))
      .sort((a, b) => b.ticket_count - a.ticket_count),
    voids: voided.map(v => ({
      ref: v.ref, date: v.date, at: v.at, branch: branchName[v.branch_id] || '', total: v.total,
      cashier: nameOf(v.cashier_id), approved_by: nameOf(v.voided_by_id), reason: v.void_reason || '',
    })),
    stock: {
      items: stock.items, deliveries: stock.deliveries, senders: stock.senders,
      short_deliveries: stock.short_deliveries.map(d => ({ ...d, sent_by: nameOf(d.sent_by), received_by: nameOf(d.received_by) })),
    },
    // Every sale, for the Excel export only (the dashboard API drops it).
    sales: sales.map(s => ({
      date: s.date, at: s.at, channel: s.channel, ref: s.ref, branch: branchName[s.branch_id] || '',
      status: s.status, total: s.total,
      payment: [...new Set(s.payments.map(p => p.group))].join(' + '),
      cashier: s.cashier_id ? nameOf(s.cashier_id) : '',
      items: s.items.map(i => `${i.quantity}× ${i.name}`).join(', '),
    })),
  }
}

// Branch stock over the period from the inv_movements ledger, what is left at
// the end of it, and deliveries from the warehouse / kitchens (inv_dispatches).
async function stockReport({ locations, branchId, startTs, endTs }) {
  const empty = { items: [], senders: [], short_deliveries: [], deliveries: 0, staffIds: [] }
  if (!locations.length) return empty
  const locName = Object.fromEntries(locations.map(l => [l.id, l.name]))
  const branchLocs = locations.filter(l => l.kind === 'branch' && (!branchId || l.branch_id === branchId)).map(l => l.id)
  if (!branchLocs.length) return empty

  const [moves, after, balances, dispatches, stockItems] = await Promise.all([
    fetchAll(() => db.from('inv_movements').select('stock_item_id, qty, kind')
      .in('location_id', branchLocs).gte('at', startTs).lt('at', endTs).order('id')),
    fetchAll(() => db.from('inv_movements').select('stock_item_id, qty')
      .in('location_id', branchLocs).gte('at', endTs).order('id')),
    fetchAll(() => db.from('inv_balances').select('stock_item_id, on_hand').in('location_id', branchLocs).order('stock_item_id')),
    fetchAll(() => {
      let q = db.from('inv_dispatches')
        .select('id, from_location, to_location, status, sent_at, received_at, sent_by, received_by, inv_dispatch_lines(stock_item_id, qty_sent, qty_received)')
        .gte('sent_at', startTs).lt('sent_at', endTs).order('sent_at')
      if (branchId) q = q.in('to_location', branchLocs)
      return q
    }),
    db.from('inv_stock_items').select('id, name, unit').then(r => (r.error ? [] : r.data)),
  ])
  const itemOf = Object.fromEntries(stockItems.map(i => [i.id, i]))

  const rows = {}
  const row = id => (rows[id] ||= { id, name: itemOf[id]?.name || 'Unknown', unit: itemOf[id]?.unit || '', sent: 0, received: 0, sold: 0, returned: 0, wasted: 0, count_diff: 0, other: 0, left: 0 })
  for (const m of moves) {
    const r = row(m.stock_item_id); const q = Number(m.qty)
    if (m.kind === 'receive') r.received += q
    else if (m.kind === 'sale' || m.kind === 'online_sale') r.sold -= q
    else if (m.kind === 'sale_void' || m.kind === 'online_cancel') r.returned += q
    else if (m.kind === 'waste') r.wasted -= q
    else if (m.kind === 'count_adjust') r.count_diff += q
    else r.other += q
  }
  // Left at the end of the period = on hand now − anything that moved since.
  const left = {}
  for (const b of balances) left[b.stock_item_id] = (left[b.stock_item_id] || 0) + Number(b.on_hand)
  for (const m of after) left[m.stock_item_id] = (left[m.stock_item_id] || 0) - Number(m.qty)

  const branchSet = new Set(branchLocs)
  const senders = {}
  const shortList = []
  for (const d of dispatches) {
    const toBranch = branchSet.has(d.to_location)
    const s = senders[`${d.from_location}>${d.to_location}`] ||= { from: locName[d.from_location] || '—', to: locName[d.to_location] || '—', deliveries: 0, waiting: 0, short: 0, lines: {} }
    s.deliveries += 1
    if (d.status === 'sent') s.waiting += 1
    if (d.status === 'received_short') s.short += 1
    for (const l of d.inv_dispatch_lines || []) {
      const sent = Number(l.qty_sent), got = l.qty_received == null ? null : Number(l.qty_received)
      if (toBranch) row(l.stock_item_id).sent += sent
      const line = s.lines[l.stock_item_id] ||= { name: itemOf[l.stock_item_id]?.name || 'Unknown', unit: itemOf[l.stock_item_id]?.unit || '', sent: 0, received: 0, pending: 0 }
      line.sent += sent
      if (got == null) line.pending += sent
      else line.received += got
    }
    if (d.status === 'received_short') {
      shortList.push({
        id: d.id, from: locName[d.from_location] || '—', to: locName[d.to_location] || '—',
        sent_at: d.sent_at, received_at: d.received_at, sent_by: d.sent_by, received_by: d.received_by,
        lines: (d.inv_dispatch_lines || []).filter(l => l.qty_received != null && Number(l.qty_received) < Number(l.qty_sent))
          .map(l => ({ name: itemOf[l.stock_item_id]?.name || 'Unknown', unit: itemOf[l.stock_item_id]?.unit || '', sent: Number(l.qty_sent), received: Number(l.qty_received) })),
      })
    }
  }

  const q2 = n => Math.round(n * 100) / 100
  const items = Object.values(rows).map(r => {
    const out = {}
    for (const [k, v] of Object.entries(r)) out[k] = typeof v === 'number' ? q2(v) : v
    out.left = q2(left[r.id] || 0)
    return out
  }).sort((a, b) => a.name.localeCompare(b.name))

  const staffIds = shortList.flatMap(d => [d.sent_by, d.received_by])
  return {
    items,
    deliveries: dispatches.length,
    senders: Object.values(senders).map(s => ({
      ...s, lines: Object.values(s.lines).map(l => ({ ...l, sent: q2(l.sent), received: q2(l.received), pending: q2(l.pending) })).sort((a, b) => a.name.localeCompare(b.name)),
    })).sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
    short_deliveries: shortList,
    staffIds,
  }
}
