import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { PackageCheck, Settings } from 'lucide-react'
import Layout, { ErrorText, Modal } from '@/components/Layout'
import { api, dateTime, time, isElevated, useBranchEvents, useMe } from '@/lib/client'

const ROLES = ['cashier', 'server']
const fmt = n => (Number.isInteger(Number(n)) ? Number(n) : Number(n).toFixed(1))
const BADGE = {
  out: 'bg-red-100 text-red-700',
  low: 'bg-amber-100 text-amber-800',
  ok:  'bg-green-100 text-green-800',
}
const BADGE_LABEL = { out: 'Out', low: 'Low', ok: 'OK' }

// Branch stock: confirm deliveries from the kitchen, see what's left, and do
// the closing count (leftovers carry over to the next day).
export default function Stock() {
  const [me] = useMe(ROLES)
  const [items, setItems] = useState(null)
  const [incoming, setIncoming] = useState({ pending: [], recent: [] })
  const [receiving, setReceiving] = useState(null)
  const [counting, setCounting] = useState(false)
  const [adjusting, setAdjusting] = useState(null)
  const [history, setHistory] = useState(false)
  const [error, setError] = useState('')
  const manager = isElevated(me?.user.role)

  const load = useCallback(async () => {
    try {
      const [lv, inc] = await Promise.all([api('stock/levels'), api('stock/incoming')])
      setItems(lv.items)
      setIncoming(inc)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [])
  useEffect(() => { if (me) load() }, [me, load])
  useBranchEvents(me?.user.branch_id, () => load(), 30000) // new deliveries, sales, counts

  return (
    <Layout me={me}>
      <div className="mx-auto max-w-4xl space-y-4 p-3 md:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black">Stock · {me?.user.branch_name}</h1>
          {manager && (
            <Link href="/manager/stock" className="btn-ghost ml-auto px-3 py-2 text-sm"><Settings size={16} /> Setup</Link>
          )}
        </div>
        <ErrorText>{error}</ErrorText>

        {/* Deliveries waiting to be confirmed */}
        {incoming.pending.length > 0 && (
          <div className="card space-y-2 border-2 border-brand-orange">
            <h2 className="text-lg font-black">Delivery from the kitchen — please confirm</h2>
            {incoming.pending.map(d => (
              <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-brand-cream p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-bold">Sent {dateTime(d.sent_at)}{d.sent_by ? ` by ${d.sent_by}` : ''}</div>
                  <div className="text-gray-600">{d.lines.map(l => `${fmt(l.qty_sent)} ${l.name}`).join(', ')}</div>
                  {d.note && <div className="text-xs text-gray-500">Note: {d.note}</div>}
                </div>
                <button className="btn-primary px-4 py-2" onClick={() => setReceiving(d)}><PackageCheck size={18} /> Confirm</button>
              </div>
            ))}
          </div>
        )}

        {/* Stock now */}
        <div className="card">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-black">Stock now</h2>
            <button className="btn-dark ml-auto px-3 py-2 text-sm" onClick={() => setCounting(true)} disabled={!items?.length}>Closing count</button>
            {manager && <button className="btn-ghost px-3 py-2 text-sm" onClick={() => setHistory(true)}>History</button>}
          </div>
          {!items ? <div className="text-gray-400">Loading…</div> : !items.length ? (
            <p className="text-sm text-gray-500">Nothing is tracked yet.{manager ? ' Set it up under Setup.' : ' Ask a manager to set it up.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-gray-500">
                  <tr><th className="p-2">Item</th><th className="p-2 text-right">Left</th><th className="p-2 text-right">Received today</th><th className="p-2 text-right">Sold today</th><th className="p-2 text-right">Adjusted</th><th className="p-2" /></tr>
                </thead>
                <tbody className="divide-y">
                  {items.map(i => (
                    <tr key={i.id}>
                      <td className="p-2 font-semibold">{i.name} <span className="text-xs font-normal text-gray-500">({i.unit})</span></td>
                      <td className="p-2 text-right text-lg font-black">{fmt(i.on_hand)}</td>
                      <td className="p-2 text-right">{fmt(i.today.received)}</td>
                      <td className="p-2 text-right">{fmt(i.today.sold - i.today.returned)}</td>
                      <td className="p-2 text-right">{fmt(i.today.adjusted)}</td>
                      <td className="p-2 text-right">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${BADGE[i.status]}`}>{BADGE_LABEL[i.status]}</span>
                        {manager && <button className="ml-2 text-xs font-semibold text-brand-brown" onClick={() => setAdjusting(i)}>Adjust</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {incoming.recent.length > 0 && (
          <div className="card">
            <h2 className="mb-2 font-black">Recent deliveries</h2>
            {incoming.recent.map(d => (
              <div key={d.id} className="border-b py-2 text-sm last:border-0">
                <b>{dateTime(d.received_at)}</b> confirmed by {d.received_by}
                {d.status === 'received_short' && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">SHORT</span>}
                <div className="text-gray-600">
                  {d.lines.map(l => `${fmt(l.qty_received)}/${fmt(l.qty_sent)} ${l.name}`).join(', ')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {receiving && <ReceiveModal dispatch={receiving} onClose={() => setReceiving(null)} onDone={() => { setReceiving(null); load() }} />}
      {counting && <CountModal items={items} onClose={() => setCounting(false)} onDone={load} />}
      {adjusting && <AdjustModal item={adjusting} onClose={() => setAdjusting(null)} onDone={() => { setAdjusting(null); load() }} />}
      {history && <HistoryModal onClose={() => setHistory(false)} />}
    </Layout>
  )
}

function ReceiveModal({ dispatch, onClose, onDone }) {
  const [got, setGot] = useState(Object.fromEntries(dispatch.lines.map(l => [l.id, String(l.qty_sent)])))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const short = dispatch.lines.some(l => Number(got[l.id]) < l.qty_sent)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api('stock/receive', { method: 'POST', body: { dispatch_id: dispatch.id, lines: dispatch.lines.map(l => ({ line_id: l.id, qty_received: got[l.id] })) } })
      onDone()
    } catch (err) {
      setError(err.message); setBusy(false)
    }
  }

  return (
    <Modal title="Confirm what arrived" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-gray-600">Count what actually arrived. Change a number if something is missing.</p>
        {dispatch.lines.map(l => (
          <div key={l.id} className="flex items-center gap-2">
            <div className="min-w-0 flex-1 font-semibold">{l.name}<div className="text-xs font-normal text-gray-500">sent {fmt(l.qty_sent)} {l.unit}s</div></div>
            <input className={`input w-24 py-2 text-right text-lg font-bold ${Number(got[l.id]) < l.qty_sent ? 'border-red-400 text-red-700' : ''}`}
              type="number" min="0" step="any" inputMode="decimal" value={got[l.id]} onChange={e => setGot(g => ({ ...g, [l.id]: e.target.value }))} />
          </div>
        ))}
        {short && <div className="rounded-xl bg-red-50 p-2 text-sm font-semibold text-red-700">Less than sent — this will be flagged to the owner.</div>}
        <ErrorText>{error}</ErrorText>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Confirm delivery'}</button>
      </form>
    </Modal>
  )
}

function CountModal({ items, onClose, onDone }) {
  const [counted, setCounted] = useState({})
  const [note, setNote] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const lines = Object.entries(counted).filter(([, v]) => v !== '').map(([stock_item_id, v]) => ({ stock_item_id, counted: v }))
      const r = await api('stock/count', { method: 'POST', body: { lines, note } })
      setResult(r.lines)
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <Modal title="Count saved" onClose={onClose}>
        <p className="mb-2 text-sm text-gray-600">These amounts carry over to tomorrow.</p>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-gray-500"><tr><th className="p-1">Item</th><th className="p-1 text-right">Expected</th><th className="p-1 text-right">Counted</th><th className="p-1 text-right">Difference</th></tr></thead>
          <tbody className="divide-y">
            {result.map(l => (
              <tr key={l.name}><td className="p-1">{l.name}</td><td className="p-1 text-right">{fmt(l.expected)}</td><td className="p-1 text-right font-bold">{fmt(l.counted)}</td>
                <td className={`p-1 text-right font-bold ${l.variance < 0 ? 'text-red-600' : l.variance > 0 ? 'text-amber-700' : 'text-green-700'}`}>{l.variance > 0 ? '+' : ''}{fmt(l.variance)}</td></tr>
            ))}
          </tbody>
        </table>
        <button className="btn-primary mt-3 w-full" onClick={onClose}>Done</button>
      </Modal>
    )
  }

  return (
    <Modal title="Closing count" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-gray-600">Count what's left of each item. Leave blank to skip an item.</p>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {items.map(i => (
            <div key={i.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1 font-semibold">{i.name} <span className="text-xs font-normal text-gray-500">({i.unit}s)</span></div>
              <input className="input w-24 py-2 text-right text-lg font-bold" type="number" min="0" step="any" inputMode="decimal" placeholder="—"
                value={counted[i.id] ?? ''} onChange={e => setCounted(c => ({ ...c, [i.id]: e.target.value }))} />
            </div>
          ))}
        </div>
        <input className="input py-2 text-base" placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} />
        <ErrorText>{error}</ErrorText>
        <button className="btn-dark w-full" disabled={busy || !Object.values(counted).some(v => v !== '')}>{busy ? 'Saving…' : 'Save count'}</button>
      </form>
    </Modal>
  )
}

function AdjustModal({ item, onClose, onDone }) {
  const [kind, setKind] = useState('waste')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api('stock/adjust', { method: 'POST', body: { stock_item_id: item.id, qty, kind, note } })
      onDone()
    } catch (err) {
      setError(err.message); setBusy(false)
    }
  }

  return (
    <Modal title={`Adjust ${item.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {[['waste', 'Waste / spoilt'], ['manual', 'Correction']].map(([k, label]) => (
            <button type="button" key={k} onClick={() => setKind(k)} className={`btn ${kind === k ? 'bg-brand-dark text-white' : 'border border-brand-muted bg-white'}`}>{label}</button>
          ))}
        </div>
        <input className="input py-2" type="number" step="any" inputMode="decimal"
          placeholder={kind === 'waste' ? `How many ${item.unit}s were wasted` : 'Add (+) or remove (−), e.g. -2'}
          value={qty} onChange={e => setQty(e.target.value)} />
        <input className="input py-2" placeholder="Reason (required)" value={note} onChange={e => setNote(e.target.value)} />
        <p className="text-xs text-gray-500">Now {fmt(item.on_hand)} {item.unit}s.</p>
        <ErrorText>{error}</ErrorText>
        <button className="btn-primary w-full" disabled={busy || !Number(qty) || !note.trim()}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </Modal>
  )
}

const KIND_LABEL = {
  receive: 'Delivery received', sale: 'Walk-in sale', sale_void: 'Sale voided', online_sale: 'Online order',
  online_cancel: 'Online order cancelled', count_adjust: 'Closing count', waste: 'Waste', manual: 'Correction',
}

function HistoryModal({ onClose }) {
  const [rows, setRows] = useState(null)
  useEffect(() => { api('stock/movements').then(r => setRows(r.movements)) }, [])
  return (
    <Modal title="Stock history (last 100)" onClose={onClose} wide>
      {!rows ? <div className="text-gray-400">Loading…</div> : (
        <div className="divide-y text-sm">
          {rows.map(m => (
            <div key={m.id} className="flex flex-wrap items-center gap-x-3 py-1.5">
              <span className="w-24 text-gray-500">{time(m.at)} {new Date(m.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
              <span className="min-w-0 flex-1">{m.name}</span>
              <span className="text-gray-600">{KIND_LABEL[m.kind] || m.kind}{m.by ? ` · ${m.by}` : ''}{m.note ? ` · ${m.note}` : ''}</span>
              <b className={m.qty < 0 ? 'text-red-600' : 'text-green-700'}>{m.qty > 0 ? '+' : ''}{fmt(m.qty)}</b>
            </div>
          ))}
          {!rows.length && <div className="py-4 text-center text-gray-400">No changes yet.</div>}
        </div>
      )}
    </Modal>
  )
}
