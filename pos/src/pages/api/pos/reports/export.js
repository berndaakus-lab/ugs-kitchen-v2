import * as XLSX from 'xlsx'
import { withAuth, can } from '@/lib/session'
import { buildReport, parseFilters } from '@/lib/reportData'

// GET — same filters as reports/dashboard; downloads the report as an Excel
// file (one sheet per section). Needs "Download data" (export) as well.
export default withAuth(async (req, res) => {
  if (!can(req.user, 'export')) return res.status(403).json({ message: 'Downloading needs the "Download data" permission.' })
  const f = parseFilters(req.query, req.user)
  const r = await buildReport(req.user, f)
  const book = XLSX.utils.book_new()
  const add = (name, rows) => XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows.length ? rows : [{ '': 'Nothing in this period' }]), name)
  const k = r.kpis

  add('Summary', [
    { Item: 'Period', Value: f.from === f.to ? f.from : `${f.from} to ${f.to}` },
    { Item: 'Branch', Value: r.branch_name },
    { Item: 'Channel', Value: f.channel === 'walk_in' ? 'Walk-in' : f.channel === 'online' ? 'Online' : 'Walk-in and online' },
    ...(f.method ? [{ Item: 'Payment', Value: f.method }] : []),
    ...(f.staff ? [{ Item: 'Staff', Value: r.staff_options.find(s => s.id === f.staff)?.name || '' }] : []),
    { Item: 'Total sales (GHS)', Value: k.total },
    { Item: 'Orders', Value: k.count },
    { Item: 'Average order (GHS)', Value: k.avg },
    { Item: 'Walk-in (GHS)', Value: k.walk_in.total },
    { Item: 'Walk-in orders', Value: k.walk_in.count },
    { Item: 'Online (GHS)', Value: k.online.total },
    { Item: 'Online orders', Value: k.online.count },
    { Item: 'Voided (GHS)', Value: k.voids.total },
    { Item: 'Voids', Value: k.voids.count },
    ...(k.previous ? [{ Item: `Previous period ${k.previous.from} to ${k.previous.to} (GHS)`, Value: k.previous.total }] : []),
    { Item: 'Cash short (GHS)', Value: r.cash.short },
    { Item: 'Cash over (GHS)', Value: r.cash.over },
    ...(k.food_cost ? [
      { Item: 'Food cost of dishes sold (GHS)', Value: k.food_cost.cost },
      { Item: 'Food cost %', Value: k.food_cost.pct },
    ] : []),
  ])
  add('By day', r.by_day.map(d => ({ Date: d.date, 'Walk-in': d.walk_in, Online: d.online, Total: d.total, Orders: d.count })))
  add('By branch', r.by_branch.map(b => ({ Branch: b.name, 'Walk-in': b.walk_in, Online: b.online, Total: b.total, Orders: b.count })))
  add('By hour', r.by_hour.map(h => ({ Hour: `${String(h.hour).padStart(2, '0')}:00`, Sales: h.total, Orders: h.count })))
  add('Dishes', r.items.map(i => ({ Dish: i.name, Category: i.category || 'Other', Sold: i.qty, 'Walk-in': i.walk_in_qty, Online: i.online_qty, 'Sales (GHS)': i.amount, 'Share %': i.share })))
  add('Not sold', r.not_sold.map(n => ({ Dish: n })))
  add('Categories', r.by_category.map(c => ({ Category: c.name, Sold: c.qty, 'Sales (GHS)': c.amount })))
  add('Payments', r.by_method.map(m => ({ Method: m.label, 'Walk-in': m.walk_in, Online: m.online, Total: m.total, Orders: m.count })))
  add('Stock', r.stock.items.map(i => ({ Item: i.name, Unit: i.unit, Sent: i.sent, Received: i.received, Sold: i.sold, Returned: i.returned, Wasted: i.wasted, 'Count difference': i.count_diff, Other: i.other, 'Left at end': i.left })))
  add('Deliveries', r.stock.senders.flatMap(s => s.lines.map(l => ({ From: s.from, To: s.to, Item: l.name, Unit: l.unit, Sent: l.sent, Received: l.received, 'Not confirmed yet': l.pending }))))
  add('Short deliveries', r.stock.short_deliveries.flatMap(d => d.lines.map(l => ({ From: d.from, To: d.to, 'Sent at': d.sent_at, 'Received by': d.received_by, Item: l.name, Sent: l.sent, Received: l.received, 'Not confirmed yet': l.pending }))))
  add('Shifts', r.cash.shifts.map(s => ({ Branch: s.branch, Cashier: s.staff, Opened: s.opened_at, Closed: s.closed_at || 'open', Float: s.opening_float, 'Expected cash': s.expected_cash, 'Counted cash': s.counted_cash, Difference: s.variance })))
  add('Cashiers', r.cashiers.map(c => ({ Cashier: c.name, Sales: c.sales_count, 'Total (GHS)': c.total, 'Average (GHS)': c.avg, Voids: c.voids_count, 'Voided (GHS)': c.voids_total, Short: c.short, Over: c.over })))
  add('Servers', r.servers.map(s => ({ Server: s.name, Tickets: s.ticket_count, Items: s.item_count })))
  add('Voids', r.voids.map(v => ({ Date: v.date, Ticket: v.ref, Branch: v.branch, 'Amount (GHS)': v.total, Cashier: v.cashier, 'Approved by': v.approved_by, Reason: v.reason })))
  add('Every sale', r.sales.map(s => ({ Date: s.date, Time: s.at, Channel: s.channel === 'online' ? 'Online' : 'Walk-in', Ticket: s.ref, Branch: s.branch, Status: s.status, 'Total (GHS)': s.total, Payment: s.payment, Cashier: s.cashier, Items: s.items })))

  const file = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })
  const name = `ugs-report-${f.from}${f.to !== f.from ? `-to-${f.to}` : ''}.xlsx`
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
  return res.status(200).send(file)
}, { perms: ['reports'] })
