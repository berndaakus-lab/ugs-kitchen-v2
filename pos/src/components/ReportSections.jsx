// The report sections (Module 4), shared by the Reports dashboard and its
// print / PDF page so both always show the same thing.
import { useState } from 'react'
import { Bars, COLORS, Donut, HBars, topParts } from './Charts'
// Times in Ghana time (UTC), whatever the device's clock is set to.
const TZ = { timeZone: 'Africa/Accra' }
const dateTime = d => new Date(d).toLocaleString('en-GB', { ...TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const time = d => new Date(d).toLocaleTimeString('en-GB', { ...TZ, hour: '2-digit', minute: '2-digit' })

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const d8 = s => new Date(`${s}T00:00:00Z`)
export const niceDate = s => `${d8(s).getUTCDate()} ${MONTHS[d8(s).getUTCMonth()]} ${d8(s).getUTCFullYear()}`
export const periodLabel = f => (f.from === f.to ? niceDate(f.from) : `${niceDate(f.from)} – ${niceDate(f.to)}`)
const qty = n => (Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(1))
// Money with thousands separators: GH₵ 12,345.50 (cedis = whole cedis, for tight spots).
const ghs = n => `GH₵ ${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const cedis = n => `GH₵ ${Math.round(Number(n || 0)).toLocaleString('en-GB')}`

export function Card({ title, right, children, className = '' }) {
  return (
    <section className={`card break-inside-avoid ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {title && <h2 className="font-black">{title}</h2>}
          {right && <div className="ml-auto">{right}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

function Kpi({ label, value, note, tone = 'bg-white', dark }) {
  return (
    <div className={`rounded-2xl p-3 shadow-sm ${tone}`}>
      <div className={`text-xs font-semibold uppercase ${dark ? 'text-white/70' : 'text-gray-500'}`}>{label}</div>
      <div className="text-lg font-black sm:text-2xl">{value}</div>
      {note && <div className={`text-xs ${dark ? 'text-white/80' : 'text-gray-500'}`}>{note}</div>}
    </div>
  )
}

function Chips({ value, onChange, options }) {
  return (
    <div className="flex gap-1 print:hidden">
      {options.map(([k, label]) => (
        <button key={k} onClick={() => onChange(k)} className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${value === k ? 'bg-brand-dark text-white' : 'bg-brand-muted'}`}>{label}</button>
      ))}
    </div>
  )
}

// Group the daily rows into weeks (Monday start) or months.
function groupDays(days, by) {
  if (by === 'day') {
    return days.map(d => ({
      label: days.length <= 7 ? `${DAYS[d8(d.date).getUTCDay()]} ${d8(d.date).getUTCDate()}` : `${d8(d.date).getUTCDate()} ${MONTHS[d8(d.date).getUTCMonth()]}`,
      tip: `${DAYS[d8(d.date).getUTCDay()]} ${niceDate(d.date)}`,
      values: { walk_in: d.walk_in, online: d.online }, extra: `${d.count} orders`,
    }))
  }
  const groups = []
  for (const d of days) {
    const dt = d8(d.date)
    let key, label, tip
    if (by === 'week') {
      const monday = new Date(dt.getTime() - ((dt.getUTCDay() + 6) % 7) * 864e5)
      key = monday.toISOString().slice(0, 10)
      label = `${monday.getUTCDate()} ${MONTHS[monday.getUTCMonth()]}`
      tip = `Week of ${niceDate(key)}`
    } else {
      key = d.date.slice(0, 7)
      label = `${MONTHS[dt.getUTCMonth()]} ${String(dt.getUTCFullYear()).slice(2)}`
      tip = `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`
    }
    let g = groups[groups.length - 1]
    if (!g || g.key !== key) groups.push(g = { key, label, tip, values: { walk_in: 0, online: 0 }, count: 0 })
    g.values.walk_in += d.walk_in
    g.values.online += d.online
    g.count += d.count
  }
  return groups.map(g => ({ ...g, extra: `${g.count} orders` }))
}

const CHANNEL_KEYS = [['walk_in', 'Walk-in', COLORS.walk_in], ['online', 'Online', COLORS.online]]

export function Overview({ r }) {
  const k = r.kpis
  const days = r.filters.days
  const [by, setBy] = useState(days > 120 ? 'month' : days > 31 ? 'week' : 'day')
  const allBranches = !r.filters.branchId
  const change = k.previous && k.previous.total > 0 ? Math.round(((k.total - k.previous.total) / k.previous.total) * 1000) / 10 : null

  // Hours with sales, padded a little (shop hours rather than 24 empty slots).
  const used = r.by_hour.filter(h => h.count)
  const lo = used.length ? Math.max(0, Math.min(used[0].hour, 8)) : 8
  const hi = used.length ? Math.min(23, Math.max(used[used.length - 1].hour, 20)) : 20
  const hours = r.by_hour.slice(lo, hi + 1).map(h => ({
    label: String(h.hour).padStart(2, '0'), tip: `${String(h.hour).padStart(2, '0')}:00–${String(h.hour).padStart(2, '0')}:59`,
    values: { total: h.total }, extra: `${h.count} orders`,
  }))
  const busiest = [...r.by_hour].sort((a, b) => b.total - a.total)[0]

  const fc = k.food_cost
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi
          label="Total sales" value={ghs(k.total)} tone="bg-brand-dark text-white" dark
          note={change == null ? `${k.count} orders` : `${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}% vs previous ${days === 1 ? 'day' : `${days} days`}`}
        />
        <Kpi label="Orders" value={k.count} note={`Average ${ghs(k.avg)}`} />
        <Kpi label="Walk-in / Online" value={`${cedis(k.walk_in.total)} / ${cedis(k.online.total)}`} note={`${k.walk_in.count} walk-in · ${k.online.count} online`} />
        {fc ? (
          <Kpi label="Food cost" value={fc.pct == null ? '—' : `${fc.pct}%`} note={`${ghs(fc.cost)} of ingredients`} tone={fc.pct > 35 ? 'bg-red-50' : 'bg-white'} />
        ) : (
          <Kpi label="Voids" value={k.voids.count} note={ghs(k.voids.total)} tone={k.voids.count ? 'bg-amber-50' : 'bg-white'} />
        )}
      </div>

      {days > 1 && (
        <Card title="Sales over time" right={<Chips value={by} onChange={setBy} options={[['day', 'Day'], ['week', 'Week'], ['month', 'Month']]} />}>
          <Bars data={groupDays(r.by_day, by)} keys={r.filters.channel ? CHANNEL_KEYS.filter(([c]) => c === r.filters.channel) : CHANNEL_KEYS} format={ghs} height={200} />
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {allBranches && (
          <Card title="Sales by branch">
            <HBars rows={r.by_branch.map(b => ({ label: b.name, value: b.total, sub: `${b.count}` }))} format={cedis} emptyText="No sales in this period." />
            {r.by_branch.length > 0 && <p className="mt-2 text-xs text-gray-400">Number after the amount = orders.</p>}
          </Card>
        )}
        <Card title="Sales by hour" right={busiest?.count ? <span className="text-xs text-gray-500">Busiest: {String(busiest.hour).padStart(2, '0')}:00</span> : null}>
          <Bars data={hours} keys={[['total', 'Sales', COLORS.walk_in]]} format={ghs} height={170} />
        </Card>
        <Card title="Walk-in vs online">
          <Donut parts={[{ label: 'Walk-in', value: k.walk_in.total, color: COLORS.walk_in }, { label: 'Online', value: k.online.total, color: COLORS.online }]} format={ghs} />
        </Card>
        <Card title="Payment methods">
          <Donut parts={r.by_method.map(m => ({ label: m.label, value: m.total, color: COLORS[m.key] }))} format={ghs} />
        </Card>
        <Card title="Sales by category">
          <Donut parts={topParts(r.by_category)} format={ghs} />
        </Card>
      </div>
    </div>
  )
}

function Table({ head, rows, empty = 'Nothing in this period.', right = [] }) {
  if (!rows.length) return <p className="py-3 text-center text-sm text-gray-400">{empty}</p>
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-gray-500">
          <tr>{head.map((h, i) => <th key={h} className={`whitespace-nowrap p-1.5 ${right.includes(i) ? 'text-right' : ''}`}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((cells, r) => (
            <tr key={r} className="break-inside-avoid">
              {cells.map((c, i) => <td key={i} className={`p-1.5 ${right.includes(i) ? 'whitespace-nowrap text-right' : ''} ${i === 0 ? 'font-semibold' : ''}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Dishes({ r, print }) {
  const best = r.items.slice(0, 10)
  // Slowest 10 outside the top 10 (a short menu: the bottom 5).
  const slow = (r.items.length > 10 ? r.items.slice(10) : r.items.slice(-5)).slice().sort((a, b) => a.qty - b.qty || a.amount - b.amount).slice(0, 10)
  const [showAll, setShowAll] = useState(false)
  const list = print || showAll ? r.items : r.items.slice(0, 25)
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Best sellers">
          <HBars rows={best.map(i => ({ label: i.name, value: i.qty, sub: cedis(i.amount) }))} format={qty} color={COLORS.cash} emptyText="No dishes sold." />
        </Card>
        <Card title="Slow sellers">
          <HBars rows={slow.map(i => ({ label: i.name, value: i.qty, sub: cedis(i.amount) }))} format={qty} color={COLORS.other} emptyText="No dishes sold." />
          {r.not_sold.length > 0 && (
            <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              <div className="font-black">Not sold at all ({r.not_sold.length})</div>
              <div className="mt-1">{r.not_sold.join(', ')}</div>
            </div>
          )}
        </Card>
      </div>
      <Card title="Every dish sold">
        <Table
          head={['Dish', 'Category', 'Sold', 'Walk-in', 'Online', 'Sales', 'Share']}
          right={[2, 3, 4, 5, 6]}
          rows={list.map(i => [i.name, i.category || 'Other', qty(i.qty), qty(i.walk_in_qty), qty(i.online_qty), ghs(i.amount), `${i.share}%`])}
        />
        {!print && r.items.length > 25 && (
          <button className="mt-2 text-sm font-bold text-brand-brown" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${r.items.length}`}</button>
        )}
      </Card>
      <Card title="By category">
        <Table head={['Category', 'Sold', 'Sales']} right={[1, 2]} rows={r.by_category.map(c => [c.name, qty(c.qty), ghs(c.amount)])} />
      </Card>
    </div>
  )
}

export function Stock({ r }) {
  const s = r.stock
  const signed = n => (n ? qty(n) : '—')
  return (
    <div className="space-y-4">
      <Card title={`Stock at ${r.filters.branchId ? r.branch_name : 'the branches'}`}>
        <p className="mb-2 text-xs text-gray-500">Sent = delivered from the kitchen in this period. Left = what was there at the end of the last day.</p>
        <Table
          head={['Item', 'Sent', 'Received', 'Sold', 'Returned', 'Wasted', 'Count diff.', 'Left']}
          right={[1, 2, 3, 4, 5, 6, 7]}
          empty="No stock moved in this period."
          rows={s.items.map(i => [
            <span key="n">{i.name} <span className="text-xs font-normal text-gray-400">{i.unit}</span></span>,
            signed(i.sent), signed(i.received), signed(i.sold), signed(i.returned),
            <span key="w" className={i.wasted ? 'text-red-600' : ''}>{signed(i.wasted)}</span>,
            <span key="c" className={i.count_diff < 0 ? 'text-red-600' : ''}>{signed(i.count_diff)}</span>,
            <b key="l">{qty(i.left)}</b>,
          ])}
        />
      </Card>
      <Card title="Sent from the warehouse and kitchens">
        {s.senders.length ? (
          <div className="space-y-3">
            {s.senders.map(x => (
              <div key={`${x.from}>${x.to}`} className="break-inside-avoid rounded-xl border border-brand-muted p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{x.from} → {x.to}</b>
                  <span className="text-gray-500">{x.deliveries} {x.deliveries === 1 ? 'delivery' : 'deliveries'}</span>
                  {x.short > 0 && <span className="rounded-full bg-red-100 px-2 text-xs font-bold text-red-700">{x.short} short</span>}
                  {x.waiting > 0 && <span className="rounded-full bg-amber-100 px-2 text-xs font-bold text-amber-800">{x.waiting} not confirmed</span>}
                </div>
                <div className="mt-1 text-gray-600">
                  {x.lines.map(l => `${l.name} ${qty(l.sent)} ${l.unit}${l.pending ? ' (not confirmed yet)' : l.received !== l.sent ? ` (got ${qty(l.received)})` : ''}`).join(' · ')}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-gray-400">No deliveries in this period.</p>}
      </Card>
      {s.short_deliveries.length > 0 && (
        <Card title="Short deliveries">
          <Table
            head={['Sent', 'From → to', 'Confirmed by', 'Short']}
            rows={s.short_deliveries.map(d => [dateTime(d.sent_at), `${d.from} → ${d.to}`, d.received_by, d.lines.map(l => `${l.name} ${qty(l.received)} of ${qty(l.sent)}`).join(', ')])}
          />
        </Card>
      )}
    </div>
  )
}

export function Cash({ r }) {
  const c = r.cash
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {r.by_method.filter(m => m.total > 0 || m.key !== 'other').map(m => (
          <Kpi key={m.key} label={m.label} value={ghs(m.total)} note={`Walk-in ${cedis(m.walk_in)} · Online ${cedis(m.online)}`} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi label="Cash short" value={ghs(c.short)} tone={c.short < 0 ? 'bg-red-50' : 'bg-white'} note="Drawers that came up short" />
        <Kpi label="Cash over" value={ghs(c.over)} note="Drawers with extra cash" />
        <Kpi label="Net difference" value={ghs(c.net)} tone={c.net < 0 ? 'bg-red-50' : 'bg-white'} note={`${c.closed} closed ${c.closed === 1 ? 'shift' : 'shifts'}`} />
        <Kpi label="Voids" value={r.kpis.voids.count} note={ghs(r.kpis.voids.total)} />
      </div>
      <Card title="Cashier shifts">
        <Table
          head={['Opened', 'Cashier', ...(r.filters.branchId ? [] : ['Branch']), 'Float', 'Expected', 'Counted', 'Difference']}
          right={r.filters.branchId ? [2, 3, 4, 5] : [3, 4, 5, 6]}
          empty="No shifts in this period."
          rows={c.shifts.map(s => [
            `${dateTime(s.opened_at)}${s.closed_at ? `–${time(s.closed_at)}` : ' (open)'}`,
            s.staff, ...(r.filters.branchId ? [] : [s.branch]),
            s.opening_float == null ? '—' : ghs(s.opening_float),
            s.expected_cash == null ? '—' : ghs(s.expected_cash),
            s.counted_cash == null ? '—' : ghs(s.counted_cash),
            s.variance == null ? '—' : <b key="v" className={s.variance < 0 ? 'text-red-600' : s.variance > 0 ? 'text-green-700' : ''}>{ghs(s.variance)}</b>,
          ])}
        />
      </Card>
    </div>
  )
}

export function Staff({ r }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Sales per cashier">
          <HBars rows={r.cashiers.filter(c => c.total > 0).map(c => ({ label: c.name, value: c.total, sub: `${c.sales_count}` }))} format={cedis} emptyText="No walk-in sales." />
        </Card>
        <Card title="Tickets per server">
          <HBars rows={r.servers.map(s => ({ label: s.name, value: s.ticket_count, sub: `${s.item_count} items` }))} format={qty} color={COLORS.online} emptyText="Nothing served." />
        </Card>
      </div>
      <Card title="Cashiers">
        <Table
          head={['Cashier', 'Sales', 'Total', 'Average', 'Voids', 'Short', 'Over']}
          right={[1, 2, 3, 4, 5, 6]}
          rows={r.cashiers.map(c => [
            c.name, c.sales_count, ghs(c.total), ghs(c.avg),
            c.voids_count ? `${c.voids_count} (${cedis(c.voids_total)})` : '—',
            <span key="s" className={c.short < 0 ? 'font-bold text-red-600' : ''}>{c.short ? ghs(c.short) : '—'}</span>,
            c.over ? ghs(c.over) : '—',
          ])}
        />
      </Card>
      <Card title="Voids">
        <Table
          head={['When', 'Ticket', ...(r.filters.branchId ? [] : ['Branch']), 'Amount', 'Cashier', 'Approved by', 'Reason']}
          right={r.filters.branchId ? [2] : [3]}
          empty="No voids in this period."
          rows={r.voids.map(v => [dateTime(v.at), v.ref, ...(r.filters.branchId ? [] : [v.branch]), ghs(v.total), v.cashier, v.approved_by, v.reason])}
        />
      </Card>
    </div>
  )
}

export const TABS = [
  ['overview', 'Overview', Overview],
  ['dishes', 'Dishes', Dishes],
  ['stock', 'Stock', Stock],
  ['cash', 'Cash & payments', Cash],
  ['staff', 'Staff', Staff],
]

// The filters written out, for the print page and the dashboard subtitle.
export function filterSummary(r) {
  const f = r.filters
  const parts = [periodLabel(f), r.branch_name]
  if (f.channel) parts.push(f.channel === 'online' ? 'Online only' : 'Walk-in only')
  if (f.method) parts.push(`Paid by ${({ cash: 'cash', momo: 'MoMo', card: 'card', other: 'other' })[f.method]}`)
  if (f.staff) parts.push(r.staff_options.find(s => s.id === f.staff)?.name || 'One person')
  return parts.join(' · ')
}
