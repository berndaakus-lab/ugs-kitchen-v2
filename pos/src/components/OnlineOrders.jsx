// Orders placed on the website, as seen in the POS (read-only: their status is
// still updated in the online admin). The cashier can print a receipt; the
// server only views them, since the one printer is at the cashier.
import { useCallback, useState } from 'react'
import { Printer, Search } from 'lucide-react'
import { StatusBadge } from './Layout'
import { api, ghs, time } from '@/lib/client'

export function useOnlineOrders() {
  const [orders, setOrders] = useState([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')

  // q empty → today's paid orders; "#00A1B2" or a phone → matches from the last 2 days
  const load = useCallback(async (q = '') => {
    try {
      const { orders } = await api(`online-orders?q=${encodeURIComponent(q)}`)
      setOrders(orders)
      setQuery(q)
      setError('')
      return orders
    } catch (err) {
      setError(err.message)
      return []
    }
  }, [])

  return { orders, query, error, load }
}

export function OnlineOrderRow({ order, active, onClick }) {
  return (
    <button onClick={onClick} className={`flex w-full flex-col gap-1 border-b p-3 text-left hover:bg-brand-cream ${active ? 'bg-brand-cream' : ''}`}>
      <div className="flex items-center gap-2">
        <span className="text-lg font-black">{order.order_no}</span>
        <span className="text-xs text-gray-500">{time(order.paid_at || order.created_at)}</span>
        <span className="ml-auto"><StatusBadge status={order.status} /></span>
      </div>
      <div className="truncate text-sm font-semibold">{order.customer} · {order.is_pickup ? 'Pick-up' : 'Delivery'}</div>
      <div className="truncate text-sm text-gray-600">{order.items.map(i => `${i.qty}× ${i.name}`).join(', ')}</div>
    </button>
  )
}

// Search box + list, used on the cashier's Online orders window.
export function OnlineOrderSearch({ online, selected, onSelect }) {
  const [q, setQ] = useState('')
  return (
    <div className="space-y-2">
      <form onSubmit={e => { e.preventDefault(); online.load(q.trim()) }} className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input py-2 pl-10 text-base" placeholder="#order no. or customer phone" value={q} onChange={e => setQ(e.target.value)} autoFocus />
        </div>
        <button className="btn-dark px-4 py-2">Find</button>
      </form>
      {online.query && (
        <button onClick={() => { setQ(''); online.load() }} className="w-full rounded-lg bg-brand-cream p-2 text-xs font-semibold text-brand-brown">
          Results for “{online.query}” · show all today’s orders
        </button>
      )}
      {online.error && <div className="text-sm text-red-600">{online.error}</div>}
      <div className="max-h-72 overflow-y-auto rounded-xl border">
        {online.orders.map(o => <OnlineOrderRow key={o.id} order={o} active={selected?.id === o.id} onClick={() => onSelect(o)} />)}
        {!online.orders.length && <div className="p-6 text-center text-gray-400">No paid online orders {online.query ? 'match' : 'yet today'}.</div>}
      </div>
    </div>
  )
}

// One online order. Pass onPrint to show the Print receipt button (cashier only).
export function OnlineOrderPanel({ order, onPrint, onDone }) {
  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">Online</span>
        <span className="text-4xl font-black md:text-5xl">{order.order_no}</span>
        <StatusBadge status={order.status} />
        <span className="ml-auto text-right text-sm text-gray-500">
          Paid {time(order.paid_at || order.created_at)} · {ghs(order.total)}
        </span>
      </div>

      <div className="grid gap-1 rounded-xl bg-brand-cream p-3 text-sm sm:grid-cols-2">
        <div><span className="text-gray-500">Customer:</span> <b>{order.customer}</b></div>
        <div><span className="text-gray-500">Phone:</span> {order.phone}</div>
        <div className="sm:col-span-2">
          <span className="text-gray-500">{order.is_pickup ? 'Pick-up' : 'Delivery to:'}</span> {order.is_pickup ? '' : order.location}
        </div>
        {order.notes && <div className="sm:col-span-2"><span className="text-gray-500">Note:</span> {order.notes}</div>}
        {order.status === 'delivered' && (
          <div className="font-semibold text-green-700 sm:col-span-2">
            Delivered{order.delivered_by ? ` by ${order.delivered_by}` : ''}{order.delivered_at ? ` at ${time(order.delivered_at)}` : ''}
          </div>
        )}
      </div>

      <div className="divide-y rounded-xl border">
        {order.items.map(i => (
          <div key={i.key} className="flex items-center gap-3 p-3">
            <span className="w-10 text-lg font-black">{i.qty}×</span>
            <span className="min-w-0 flex-1 text-lg font-bold">{i.name}</span>
            <span className="whitespace-nowrap text-gray-600">{ghs(i.qty * i.price)}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {onPrint && <button className="btn-primary flex-1 py-4 text-lg" onClick={onPrint}><Printer size={20} /> Print receipt</button>}
        {onDone && <button className="btn-ghost" onClick={onDone}>Done</button>}
      </div>
      <p className="text-xs text-gray-500">
        {onPrint ? '' : 'The customer’s receipt is printed at the cashier. '}
        Mark the order ready/delivered in the online admin as usual; the POS doesn’t change online orders.
      </p>
    </div>
  )
}
