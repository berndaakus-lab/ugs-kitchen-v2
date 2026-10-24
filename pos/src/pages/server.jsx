import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Printer, ScanLine } from 'lucide-react'
import Layout, { ErrorText, StatusBadge } from '@/components/Layout'
import { usePrinter } from '@/components/Print'
import { api, ghs, time, useBranchEvents, useMe } from '@/lib/client'

const ROLES = ['server']

export default function Server() {
  const [me] = useMe(ROLES)
  const { print, slip } = usePrinter()
  const [queue, setQueue] = useState([])
  const [code, setCode] = useState('')
  const [sale, setSale] = useState(null)
  const [error, setError] = useState('')
  const inputRef = useRef()

  const loadQueue = useCallback(async () => {
    try {
      const { sales } = await api('sales?view=queue')
      setQueue(sales)
    } catch { /* keep last queue */ }
  }, [])

  useEffect(() => { if (me) loadQueue() }, [me, loadQueue])
  useBranchEvents(me?.user.branch_id, () => loadQueue())

  async function open(lookup) {
    setError('')
    try {
      const { sale } = await api(`sales/lookup?code=${encodeURIComponent(lookup)}`)
      setSale(sale)
    } catch (err) {
      setSale(null)
      setError(err.message)
    }
    setCode('')
  }

  function closed() {
    setSale(null)
    loadQueue()
    inputRef.current?.focus()
  }

  return (
    <Layout me={me}>
      <div className="grid h-[calc(100vh-52px)] grid-cols-1 md:grid-cols-[1fr_340px]">
        <section className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4">
          {/* USB/Bluetooth scanners type the QR content followed by Enter. */}
          <form onSubmit={e => { e.preventDefault(); if (code.trim()) open(code.trim()) }} className="flex gap-2">
            <div className="relative flex-1">
              <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={inputRef}
                className="input pl-11 text-xl font-bold"
                placeholder="Scan ticket or type number (e.g. 42)"
                value={code}
                onChange={e => setCode(e.target.value)}
                autoFocus
              />
            </div>
            <button className="btn-dark px-6">Open</button>
          </form>
          <ErrorText>{error}</ErrorText>
          {sale
            ? <ServePanel sale={sale} branchName={me.user.branch_name} print={print} onChange={setSale} onServed={loadQueue} onDone={closed} />
            : <div className="card p-10 text-center text-gray-400">Collect the customer's food ticket, then scan it or type its number.</div>}
        </section>

        <aside className="min-h-0 overflow-y-auto border-l border-brand-muted bg-white">
          <div className="sticky top-0 border-b bg-white p-3 font-black">Waiting to be served ({queue.length})</div>
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
        </aside>
      </div>
      {slip}
    </Layout>
  )
}

function ServePanel({ sale, branchName, print, onChange, onServed, onDone }) {
  const remaining = i => i.qty - i.qty_served
  const [pick, setPick] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [justServed, setJustServed] = useState(null) // sale id served in this panel

  useEffect(() => {
    setPick(Object.fromEntries(sale.items.map(i => [i.id, remaining(i)])))
    setError('')
  }, [sale])

  const printReceipt = s => print('receipt', { ...s, branch_name: branchName })

  async function serve(all) {
    setBusy(true)
    setError('')
    try {
      const body = all ? {} : { items: Object.entries(pick).map(([item_id, qty]) => ({ item_id, qty })) }
      const { sale: updated } = await api(`sales/${sale.id}/serve`, { method: 'POST', body })
      onChange(updated)
      onServed()
      if (updated.status === 'served') {
        setJustServed(updated.id)
        printReceipt(updated)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function reprintReceipt() {
    try {
      const { sale: s } = await api(`sales/${sale.id}/reprint`, { method: 'POST', body: { kind: 'receipt' } })
      printReceipt(s)
    } catch (err) {
      setError(err.message)
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
        <span className="text-5xl font-black">{sale.ticket_no}</span>
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
          <CheckCircle2 className="shrink-0" /> Served. Receipt printed — keep the food ticket.
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
            <div className="flex-1">
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
              Serve all &amp; print receipt
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
        {sale.status === 'served' && (
          <button className="btn-ghost" onClick={reprintReceipt}><Printer size={18} /> Reprint receipt</button>
        )}
        <button className="btn-ghost" onClick={onDone}>Done</button>
      </div>
      {sale.status === 'partially_served' && (
        <p className="text-sm text-purple-700">Partly served. Keep the ticket until the rest of the order is handed over.</p>
      )}
    </div>
  )
}
