import { useCallback, useEffect, useMemo, useState } from 'react'
import { Send, Trash2 } from 'lucide-react'
import Layout, { ErrorText } from '@/components/Layout'
import { api, dateTime, time, useMe } from '@/lib/client'

const ROLES = ['kitchen']
const fmt = n => (Number.isInteger(n) ? n : Number(n).toFixed(1))
const STATUS = {
  sent:           ['bg-blue-100 text-blue-800', 'Waiting for branch'],
  received:       ['bg-green-100 text-green-800', 'Received'],
  received_short: ['bg-red-100 text-red-700', 'Received SHORT'],
}

// Central kitchen: send cooked food to a branch, follow each delivery, and see
// what every branch has left / sold today to plan the next cooking.
export default function Kitchen() {
  const [me] = useMe(ROLES)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(() => api('kitchen').then(setData).catch(e => setError(e.message)), [])
  useEffect(() => { if (me) load() }, [me, load])
  useEffect(() => { const id = setInterval(load, 60000); return () => clearInterval(id) }, [load])

  return (
    <Layout me={me}>
      <div className="mx-auto max-w-5xl space-y-4 p-3 md:p-4">
        <h1 className="text-2xl font-black">Central kitchen</h1>
        <ErrorText>{error}</ErrorText>
        {!data ? <div className="card text-gray-400">Loading…</div> : (
          <>
            <SendForm data={data} onSent={load} />
            <Deliveries list={data.dispatches} />
            <BranchStock data={data} />
          </>
        )}
      </div>
    </Layout>
  )
}

function SendForm({ data, onSent }) {
  const [branch, setBranch] = useState(data.branches[0]?.id || '')
  const [lines, setLines] = useState([])   // [{stock_item_id, qty, batches}]
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const byId = useMemo(() => Object.fromEntries(data.items.map(i => [i.id, i])), [data.items])
  const unused = data.items.filter(i => !lines.some(l => l.stock_item_id === i.id))

  const set = (i, patch) => setLines(ls => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)))
  function setBatches(i, b) {
    const item = byId[lines[i].stock_item_id]
    const n = b === '' ? '' : Number(b)
    set(i, { batches: b, qty: n === '' ? '' : Math.round(n * Number(item.batch_yield) * 100) / 100 })
  }

  async function send(e) {
    e.preventDefault()
    setBusy(true); setError(''); setMsg('')
    try {
      await api('kitchen/dispatch', { method: 'POST', body: { branch_id: branch, note, lines: lines.map(l => ({ stock_item_id: l.stock_item_id, qty: Number(l.qty) })) } })
      const name = data.branches.find(b => b.id === branch)?.name
      setMsg(`Sent to ${name}. Their stock goes up when they confirm what arrived.`)
      setLines([]); setNote('')
      onSent()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={send} className="card space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-black">Send food to a branch</h2>
        <select className="input ml-auto w-auto py-2 text-base" value={branch} onChange={e => setBranch(e.target.value)}>
          {data.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {!data.items.length && <p className="text-sm text-gray-500">No stock items yet. A manager sets them up under Stock → Setup.</p>}

      <div className="space-y-2">
        {lines.map((l, i) => {
          const item = byId[l.stock_item_id]
          return (
            <div key={l.stock_item_id} className="flex flex-wrap items-center gap-2 rounded-xl border p-2">
              <div className="min-w-[8rem] flex-1 font-bold">{item.name}</div>
              {item.batch_yield && (
                <label className="flex items-center gap-1 text-sm">
                  <input className="input w-20 px-2 py-1.5 text-base" type="number" min="0" step="0.5" inputMode="decimal"
                    value={l.batches ?? ''} onChange={e => setBatches(i, e.target.value)} placeholder="0" />
                  <span className="text-gray-500">× {item.batch_label || 'batch'} (= {fmt(Number(item.batch_yield))} {item.unit}s)</span>
                </label>
              )}
              <label className="flex items-center gap-1 text-sm">
                <input className="input w-24 px-2 py-1.5 text-base font-bold" type="number" min="0" step="1" inputMode="decimal"
                  value={l.qty} onChange={e => set(i, { qty: e.target.value, batches: '' })} placeholder="0" />
                <span className="text-gray-500">{item.unit}s</span>
              </label>
              <button type="button" className="p-2 text-red-600" onClick={() => setLines(ls => ls.filter((_, n) => n !== i))} aria-label="Remove"><Trash2 size={16} /></button>
            </div>
          )
        })}
      </div>

      {unused.length > 0 && (
        <select className="input py-2 text-base" value="" onChange={e => e.target.value && setLines(ls => [...ls, { stock_item_id: e.target.value, qty: '', batches: '' }])}>
          <option value="">+ Add an item…</option>
          {unused.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
        </select>
      )}

      <input className="input py-2 text-base" placeholder="Note (optional), e.g. driver name" value={note} onChange={e => setNote(e.target.value)} />
      {msg && <div className="rounded-xl bg-green-50 p-2 text-sm font-semibold text-green-800">{msg}</div>}
      <ErrorText>{error}</ErrorText>
      <button className="btn-primary w-full" disabled={busy || !branch || !lines.some(l => Number(l.qty) > 0)}>
        <Send size={18} /> {busy ? 'Sending…' : 'Send delivery'}
      </button>
    </form>
  )
}

function Deliveries({ list }) {
  return (
    <div className="card">
      <h2 className="mb-2 text-lg font-black">Deliveries (last 7 days)</h2>
      <div className="divide-y">
        {list.map(d => {
          const [cls, label] = STATUS[d.status]
          return (
            <div key={d.id} className="py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <b>{d.to_name}</b>
                <span className="text-gray-500">sent {dateTime(d.sent_at)}{d.sent_by ? ` by ${d.sent_by}` : ''}</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${cls}`}>{label}</span>
              </div>
              <div className="text-gray-600">
                {d.lines.map(l => (
                  <span key={l.id} className="mr-3 inline-block">
                    {l.name}: {fmt(l.qty_sent)}
                    {l.qty_received != null && l.qty_received < l.qty_sent && <b className="text-red-600"> (got {fmt(l.qty_received)})</b>}
                  </span>
                ))}
              </div>
              {d.received_at && <div className="text-xs text-gray-500">Confirmed {time(d.received_at)}{d.received_by ? ` by ${d.received_by}` : ''}</div>}
              {d.note && <div className="text-xs text-gray-500">Note: {d.note}</div>}
            </div>
          )
        })}
        {!list.length && <div className="py-4 text-center text-gray-400">No deliveries yet.</div>}
      </div>
    </div>
  )
}

function BranchStock({ data }) {
  const byId = Object.fromEntries(data.items.map(i => [i.id, i]))
  return (
    <div className="card">
      <h2 className="mb-2 text-lg font-black">What each branch has now</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="p-2">Item</th>
              {data.branches.map(b => <th key={b.id} className="p-2 text-right">{b.name}<div className="font-normal normal-case">left · sold today</div></th>)}
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.items.map(i => (
              <tr key={i.id}>
                <td className="p-2 font-semibold">{i.name} <span className="text-xs text-gray-500">({i.unit})</span></td>
                {data.branches.map(b => {
                  const l = (data.levels[b.id] || []).find(x => x.stock_item_id === i.id) || { on_hand: 0, status: 'out', sold_today: 0 }
                  const color = l.status === 'out' ? 'text-red-600' : l.status === 'low' ? 'text-amber-700' : ''
                  return <td key={b.id} className="whitespace-nowrap p-2 text-right"><b className={color}>{fmt(l.on_hand)}</b> · {fmt(l.sold_today)}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-500">Red = out, amber = low. {Object.keys(byId).length ? '' : 'No items yet.'}</p>
    </div>
  )
}
