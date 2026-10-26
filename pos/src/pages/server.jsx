import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ScanLine } from 'lucide-react'
import Layout, { ErrorText, StatusBadge } from '@/components/Layout'
import { OnlineOrderPanel, OnlineOrderRow, useOnlineOrders } from '@/components/OnlineOrders'
import { api, ghs, time, useBranchEvents, useMe } from '@/lib/client'

const ROLES = ['server']

// "#A1B2C3" (online order no.) or a phone number → online order search.
// A scanned QR is a sale id (UUID, which also contains many digits) → walk-in.
const looksOnline = code => code.startsWith('#') || /^\+?[\d\s-]{9,}$/.test(code)

// The serving point has no printer: the cashier prints the food ticket and the
// customer's receipt together. The server scans the ticket, hands over the
// food and keeps the ticket as proof of what was served.
export default function Server() {
  const [me] = useMe(ROLES)
  const online = useOnlineOrders()
  const [queue, setQueue] = useState([])
  const [tab, setTab] = useState('walkin')         // side list: 'walkin' | 'online'
  const [code, setCode] = useState('')
  const [sale, setSale] = useState(null)           // open walk-in ticket
  const [order, setOrder] = useState(null)         // open online order (view only)
  const [error, setError] = useState('')
  const inputRef = useRef()

  const loadQueue = useCallback(async () => {
    try {
      const { sales } = await api('sales?view=queue')
      setQueue(sales)
    } catch { /* keep last queue */ }
  }, [])

  useEffect(() => { if (me) { loadQueue(); online.load() } }, [me]) // eslint-disable-line react-hooks/exhaustive-deps
  useBranchEvents(me?.user.branch_id, () => {
    loadQueue()
    if (!online.query) online.load() // keep a search result on screen until cleared
  }, 10000)

  async function searchOnline(q) {
    const found = await online.load(q)
    setTab('online')
    if (found.length === 1) { setSale(null); setOrder(found[0]) }
    return found
  }

  async function open(lookup) {
    setError('')
    setCode('')
    if (looksOnline(lookup)) {
      const found = await searchOnline(lookup)
      if (!found.length) setError(`No paid online order matches ${lookup}.`)
      return
    }
    try {
      const { sale } = await api(`sales/lookup?code=${encodeURIComponent(lookup)}`)
      setOrder(null)
      setSale(sale)
    } catch (err) {
      // Not a walk-in ticket — it may be an online order number typed without "#".
      const found = /^[0-9a-z]{3,}$/i.test(lookup) ? await searchOnline(lookup) : []
      if (!found.length) {
        setSale(null)
        setError(err.message)
      }
    }
  }

  function closed() {
    setSale(null)
    setOrder(null)
    loadQueue()
    inputRef.current?.focus()
  }

  return (
    <Layout fill me={me}>
      {/* Phone: ticket panel on top, lists below (capped). md+: side by side. */}
      <div className="flex h-full flex-col md:grid md:grid-cols-[minmax(0,1fr)_320px] lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3 md:p-4">
          {/* USB/Bluetooth scanners type the QR content followed by Enter. */}
          <form onSubmit={e => { e.preventDefault(); if (code.trim()) open(code.trim()) }} className="flex gap-2">
            <div className="relative flex-1">
              <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={inputRef}
                className="input pl-11 text-lg font-bold md:text-xl"
                placeholder="Scan ticket, or #order / phone"
                value={code}
                onChange={e => setCode(e.target.value)}
                autoFocus
              />
            </div>
            <button className="btn-dark px-4 md:px-6">Open</button>
          </form>
          <ErrorText>{error}</ErrorText>
          {sale && <ServePanel sale={sale} onChange={setSale} onServed={loadQueue} onDone={closed} />}
          {order && <OnlineOrderPanel order={order} onDone={closed} />}
          {!sale && !order && (
            <div className="card p-10 text-center text-gray-400">
              Collect the customer's food ticket, then scan it or type its number.
              <div className="mt-2 text-sm">Online order? Type its number (e.g. #00A1B2) or the customer's phone.</div>
            </div>
          )}
        </section>

        <aside className="max-h-[35%] min-h-0 min-w-0 shrink-0 overflow-y-auto border-t border-brand-muted bg-white md:max-h-none md:border-l md:border-t-0">
          <div className="sticky top-0 z-10 flex border-b bg-white">
            {[['walkin', `Walk-in (${queue.length})`], ['online', `Online (${online.orders.length})`]].map(([k, label]) => (
              <button
                key={k}
                onClick={() => { setTab(k); if (k === 'online' && online.query) online.load() }}
                className={`flex-1 p-3 text-sm font-black ${tab === k ? 'border-b-2 border-brand-orange text-brand-dark' : 'text-gray-400'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'online' ? (
            <>
              {online.query && (
                <button onClick={() => online.load()} className="w-full border-b bg-brand-cream p-2 text-xs font-semibold text-brand-brown">
                  Showing results for “{online.query}” · show all today’s orders
                </button>
              )}
              {online.orders.map(o => (
                <OnlineOrderRow key={o.id} order={o} active={order?.id === o.id} onClick={() => { setSale(null); setOrder(o) }} />
              ))}
              {!online.orders.length && <div className="p-6 text-center text-gray-400">No paid online orders {online.query ? 'match' : 'yet today'}.</div>}
            </>
          ) : (
            <>
              {queue.map(s => (
                <button key={s.id} onClick={() => open(s.id)} className="flex w-full flex-col gap-1 border-b p-3 text-left hover:bg-brand-cream">
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-black">{s.ticket_no}</span>
                    <span className="text-xs text-gray-500">{time(s.created_at)}</span>
                    <span className="ml-auto"><StatusBadge status={s.status} /></span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {s.items.map(i => `${i.qty - i.qty_served}× ${i.name_snapshot}`).filter(t => !t.startsWith('0×')).join(', ')}
                  </div>
                </button>
              ))}
              {!queue.length && <div className="p-6 text-center text-gray-400">All caught up.</div>}
            </>
          )}
        </aside>
      </div>
    </Layout>
  )
}

function ServePanel({ sale, onChange, onServed, onDone }) {
  const remaining = i => i.qty - i.qty_served
  const [pick, setPick] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [justServed, setJustServed] = useState(null) // sale id served in this panel

  useEffect(() => {
    setPick(Object.fromEntries(sale.items.map(i => [i.id, remaining(i)])))
    setError('')
  }, [sale])

  async function serve(all) {
    setBusy(true)
    setError('')
    try {
      const body = all ? {} : { items: Object.entries(pick).map(([item_id, qty]) => ({ item_id, qty })) }
      const { sale: updated } = await api(`sales/${sale.id}/serve`, { method: 'POST', body })
      onChange(updated)
      onServed()
      if (updated.status === 'served') setJustServed(updated.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const blocked = {
    voided:          `VOIDED${sale.void_reason ? ` — ${sale.void_reason}` : ''}. Do not serve. Keep the ticket and inform a manager.`,
    pending_payment: 'Payment not completed. Send the customer back to the cashier.',
    failed:          'Payment failed. Send the customer back to the cashier.',
  }[sale.status]
  const canServe = ['paid', 'partially_served'].includes(sale.status)

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-4xl font-black md:text-5xl">{sale.ticket_no}</span>
        <StatusBadge status={sale.status} />
        <span className="ml-auto text-right text-sm text-gray-500">
          Paid {time(sale.created_at)} · {ghs(sale.total)}<br />Cashier: {sale.cashier}
        </span>
      </div>

      {blocked && (
        <div className="flex items-start gap-2 rounded-xl bg-red-600 p-4 text-lg font-bold text-white">
          <AlertTriangle className="shrink-0" /> {blocked}
        </div>
      )}
      {sale.status === 'served' && justServed === sale.id && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 p-4 text-lg font-bold text-green-800">
          <CheckCircle2 className="shrink-0" /> Served. Keep the food ticket.
        </div>
      )}
      {sale.status === 'served' && justServed !== sale.id && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-100 p-4 font-bold text-amber-900">
          <AlertTriangle className="shrink-0" />
          Already served by {sale.served_by} at {time(sale.served_at)}. Do not serve again.
        </div>
      )}

      <div className="divide-y rounded-xl border">
        {sale.items.map(i => (
          <div key={i.id} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="text-lg font-bold">{i.name_snapshot}</div>
              <div className="text-sm text-gray-500">Paid {i.qty} · served {i.qty_served}</div>
            </div>
            {canServe && remaining(i) > 0 ? (
              <div className="flex items-center gap-2">
                <button className="btn-ghost px-3 py-2" onClick={() => setPick(p => ({ ...p, [i.id]: Math.max(0, p[i.id] - 1) }))}>−</button>
                <span className="w-8 text-center text-xl font-black">{pick[i.id] ?? 0}</span>
                <button className="btn-ghost px-3 py-2" onClick={() => setPick(p => ({ ...p, [i.id]: Math.min(remaining(i), p[i.id] + 1) }))}>+</button>
              </div>
            ) : (
              remaining(i) === 0 && <CheckCircle2 className="text-green-600" />
            )}
          </div>
        ))}
      </div>

      <ErrorText>{error}</ErrorText>

      <div className="flex flex-wrap gap-2">
        {canServe && (
          <>
            <button className="btn-primary flex-1 py-4 text-lg" disabled={busy} onClick={() => serve(true)}>
              Serve all
            </button>
            <button
              className="btn-ghost"
              disabled={busy || !Object.values(pick).some(q => q > 0)}
              onClick={() => serve(false)}
            >
              Serve selected only
            </button>
          </>
        )}
        <button className="btn-ghost" onClick={onDone}>Done</button>
      </div>
      {sale.status === 'partially_served' && (
        <p className="text-sm text-purple-700">Partly served. Keep the ticket until the rest of the order is handed over.</p>
      )}
    </div>
  )
}
