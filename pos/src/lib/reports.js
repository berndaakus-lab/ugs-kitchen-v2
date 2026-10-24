// Server-only report builders shared by shift close, Z-report and manager summary.
import { db, staffNames } from './supabaseAdmin'

const COUNTED = ['paid', 'partially_served', 'served']  // sales that brought in money
const METHODS = ['cash', 'momo_paystack', 'momo_manual', 'card']
const round = n => Math.round(n * 100) / 100

function dayRange(date) {
  const start = new Date(`${date}T00:00:00Z`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return [start.toISOString(), end.toISOString()]
}

// Totals for a set of sales rows (with nested pos_sale_items + pos_payments).
function summarise(sales) {
  const counted = sales.filter(s => COUNTED.includes(s.status))
  const voided  = sales.filter(s => s.status === 'voided')

  const byMethod = Object.fromEntries(METHODS.map(m => [m, 0]))
  for (const s of counted) {
    for (const p of s.pos_payments || []) {
      if (p.status === 'success') byMethod[p.method] = round(byMethod[p.method] + Number(p.amount))
    }
  }

  const items = {}
  for (const s of counted) {
    for (const i of s.pos_sale_items || []) {
      const row = items[i.name_snapshot] ||= { name: i.name_snapshot, qty: 0, amount: 0 }
      row.qty += i.qty
      row.amount = round(row.amount + i.qty * Number(i.unit_price))
    }
  }

  return {
    sales_count:  counted.length,
    gross:        round(counted.reduce((t, s) => t + Number(s.total), 0)),
    by_method:    byMethod,
    voids:        { count: voided.length, total: round(voided.reduce((t, s) => t + Number(s.total), 0)) },
    failed_count: sales.filter(s => s.status === 'failed').length,
    unserved:     sales.filter(s => ['paid', 'partially_served'].includes(s.status)).map(s => s.ticket_no),
    items:        Object.values(items).sort((a, b) => b.qty - a.qty),
  }
}

const SALE_FIELDS = 'id, ticket_no, status, total, cashier_id, pos_sale_items(name_snapshot, qty, unit_price), pos_payments(method, amount, status)'

export async function shiftReport(shift) {
  const { data: sales, error } = await db.from('pos_sales').select(SALE_FIELDS).eq('shift_id', shift.id)
  if (error) throw error

  const summary = summarise(sales)
  const names = await staffNames([shift.staff_id])
  return {
    shift: { ...shift, staff_name: names[shift.staff_id] },
    ...summary,
    expected_cash: round(Number(shift.opening_float) + summary.by_method.cash),
  }
}

// What a server handed out on a day — the digital side of the paper tickets they collected.
export async function serverReport(posStaffId, date) {
  const [from, to] = dayRange(date)
  const { data: events, error } = await db
    .from('pos_serve_events')
    .select('sale_id, items, at, pos_sales(ticket_no, status)')
    .eq('staff_id', posStaffId)
    .gte('at', from)
    .lt('at', to)
    .order('at')
  if (error) throw error

  const tickets = {}
  const items = {}
  for (const e of events) {
    const t = tickets[e.sale_id] ||= {
      ticket_no: e.pos_sales?.ticket_no, status: e.pos_sales?.status, first_at: e.at, item_count: 0,
    }
    for (const i of e.items) {
      t.item_count += i.qty
      const row = items[i.name] ||= { name: i.name, qty: 0 }
      row.qty += i.qty
    }
  }

  const names = await staffNames([posStaffId])
  return {
    staff_name:   names[posStaffId],
    date,
    ticket_count: Object.keys(tickets).length,
    item_count:   Object.values(items).reduce((t, i) => t + i.qty, 0),
    tickets:      Object.values(tickets),
    items:        Object.values(items).sort((a, b) => b.qty - a.qty),
  }
}

// Manager's day view: walk-in totals, per-staff breakdown, and the online
// channel alongside (read-only from the online orders table).
// branchId null = every branch (admin).
export async function daySummary(branchId, date) {
  const [from, to] = dayRange(date)
  const forBranch = (q, col = 'branch_id') => (branchId ? q.eq(col, branchId) : q)

  const [{ data: sales, error: e1 }, { data: online, error: e2 }, { data: serves, error: e3 }] = await Promise.all([
    forBranch(db.from('pos_sales').select(SALE_FIELDS).eq('business_date', date)),
    forBranch(db.from('orders').select('total_amount')
      .in('status', ['paid', 'preparing', 'ready', 'delivered'])
      .gte('paid_at', from).lt('paid_at', to)),
    forBranch(db.from('pos_serve_events').select('staff_id, sale_id, items, pos_sales!inner(branch_id)')
      .gte('at', from).lt('at', to), 'pos_sales.branch_id'),
  ])
  if (e1 || e2 || e3) throw e1 || e2 || e3

  const walkIn = summarise(sales)

  const cashiers = {}
  for (const s of sales.filter(s => COUNTED.includes(s.status))) {
    const c = cashiers[s.cashier_id] ||= { id: s.cashier_id, sales_count: 0, total: 0 }
    c.sales_count += 1
    c.total = round(c.total + Number(s.total))
  }

  const servers = {}
  for (const e of serves) {
    const sv = servers[e.staff_id] ||= { id: e.staff_id, tickets: new Set(), item_count: 0 }
    sv.tickets.add(e.sale_id)
    sv.item_count += e.items.reduce((t, i) => t + i.qty, 0)
  }

  const names = await staffNames([...Object.keys(cashiers), ...Object.keys(servers)])
  const onlineTotal = round(online.reduce((t, o) => t + Number(o.total_amount), 0))

  return {
    date,
    walk_in:  walkIn,
    online:   { orders_count: online.length, total: onlineTotal },
    combined: round(walkIn.gross + onlineTotal),
    cashiers: Object.values(cashiers).map(c => ({ ...c, name: names[c.id] })),
    servers:  Object.values(servers).map(s => ({
      id: s.id, name: names[s.id], ticket_count: s.tickets.size, item_count: s.item_count,
    })),
  }
}
