import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChefHat, PackageCheck, Plus, Send, ShoppingCart, Trash2 } from 'lucide-react'
import Layout, { ErrorText, Modal } from '@/components/Layout'
import { api, can, dateTime, ghs, time, useMe } from '@/lib/client'

// Permissions that open this page (warehouse and kitchen work).
const ROLES = ['stock_send', 'stock_receive', 'stock_count', 'production', 'purchases', 'activity']
const fmt = n => Number(Number(n || 0).toFixed(2))
const STATUS = {
  sent:           ['bg-blue-100 text-blue-800', 'On the way'],
  received:       ['bg-green-100 text-green-800', 'Received'],
  received_short: ['bg-red-100 text-red-700', 'Received SHORT'],
}
const PICK_KEY = 'ugs-store-location'

// Module 3: the warehouse, the central kitchen and each satellite kitchen.
// Incoming deliveries · food made · sending on · purchases · stock & counts.
export default function Store() {
  const [me] = useMe(ROLES)
  const [picked, setPicked] = useState(null)
  const [data, setData] = useState(null)
  const [tab, setTab] = useState(null)
  const [error, setError] = useState('')
  const u = me?.user

  const load = useCallback(async (loc) => {
    try {
      const q = loc ? `?location=${encodeURIComponent(loc)}` : ''
      const d = await api(`store${q}`)
      setData(d); setError('')
      if (!loc && d.location) setPicked(d.location.id)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    if (!me) return
    let saved = null
    try { saved = localStorage.getItem(PICK_KEY) } catch {}
    const first = me.user.scopeAll ? saved : null
    setPicked(first)
    load(first)
  }, [me, load])

  function pick(id) {
    setPicked(id); setData(null)
    try { localStorage.setItem(PICK_KEY, id) } catch {}
    load(id)
  }
  const reload = () => load(picked || data?.location?.id)

  const loc = data?.location
  const tabs = useMemo(() => {
    if (!loc || !u) return []
    const t = [['incoming', 'Incoming']]
    if (['central', 'satellite'].includes(loc.kind) && can(u, 'production')) t.push(['produce', 'Make food'])
    if (can(u, 'stock_send') && data.destinations.length) t.push(['send', 'Send'])
    if (loc.kind === 'warehouse' && can(u, 'purchases')) t.push(['purchase', 'Purchases'])
    t.push(['stock', 'Stock'])
    return t
  }, [loc, u, data])
  useEffect(() => { if (tabs.length && !tabs.some(([k]) => k === tab)) setTab(tabs[0][0]) }, [tabs, tab])

  return (
    <Layout me={me}>
      <div className="mx-auto max-w-5xl space-y-4 p-3 md:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black">{loc ? loc.name : 'Kitchens & warehouse'}</h1>
          {loc && <span className="rounded-full bg-brand-muted px-2 py-0.5 text-xs font-bold">{loc.kind_label}</span>}
          {data?.stores?.length > 1 && (
            <select className="input ml-auto w-auto py-2 text-base" value={picked || loc?.id || ''} onChange={e => pick(e.target.value)}>
              {!loc && <option value="">Choose…</option>}
              {data.stores.map(s => <option key={s.id} value={s.id}>{s.name} · {s.kind_label}</option>)}
            </select>
          )}
        </div>
        <ErrorText>{error || data?.error}</ErrorText>
        {!data && !error && <div className="card text-gray-400">Loading…</div>}
        {loc && (
          <>
            <div className="no-scrollbar flex gap-1 overflow-x-auto">
              {tabs.map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold ${tab === k ? 'bg-brand-dark text-white' : 'bg-white'}`}>
                  {label}{k === 'incoming' && data.incoming.filter(d => d.status === 'sent').length ? ` (${data.incoming.filter(d => d.status === 'sent').length})` : ''}
                </button>
              ))}
            </div>
            {tab === 'incoming' && <Incoming data={data} me={me} onDone={reload} />}
            {tab === 'produce' && <Produce data={data} onDone={reload} />}
            {tab === 'send' && <SendForm data={data} onDone={reload} />}
            {tab === 'purchase' && <Purchase data={data} onDone={reload} />}
            {tab === 'stock' && <StockList data={data} me={me} onDone={reload} />}
          </>
        )}
      </div>
    </Layout>
  )
}

// Every action goes to one endpoint, with the place it's about.
const act = (data, action, body) => api('store/action', { method: 'POST', body: { location: data.location.id, action, ...body } })

function Lines({ lines }) {
  return <div className="text-sm text-gray-600">{lines.map(l => `${fmt(l.qty_received ?? l.qty_sent)} ${l.unit || ''} ${l.name}`).join(' · ')}</div>
}

function Incoming({ data, me, onDone }) {
  const [receiving, setReceiving] = useState(null)
  const pending = data.incoming.filter(d => d.status === 'sent')
  const recent = data.incoming.filter(d => d.status !== 'sent').slice(0, 15)
  return (
    <div className="space-y-3">
      <div className="card space-y-2">
        <h2 className="text-lg font-black">Waiting to be confirmed</h2>
        {!pending.length && <p className="text-sm text-gray-400">Nothing on the way.</p>}
        {pending.map(d => (
          <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
            <div className="min-w-0 flex-1">
              <div className="font-bold">From {d.from_name} <span className="font-normal text-gray-500">· {dateTime(d.sent_at)}{d.sent_by_name ? ` · ${d.sent_by_name}` : ''}</span></div>
              <Lines lines={d.inv_dispatch_lines} />
              {d.note && <div className="text-xs text-gray-500">Note: {d.note}</div>}
            </div>
            {can(me.user, 'stock_receive') && <button className="btn-primary px-4 py-2" onClick={() => setReceiving(d)}><PackageCheck size={18} /> Confirm</button>}
          </div>
        ))}
      </div>
      {recent.length > 0 && (
        <div className="card space-y-2">
          <h2 className="text-lg font-black">Received</h2>
          {recent.map(d => (
            <div key={d.id} className="flex flex-wrap items-start gap-2 border-b pb-2 text-sm">
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS[d.status][0]}`}>{STATUS[d.status][1]}</span>
              <div className="min-w-0 flex-1"><b>{d.from_name}</b> · {d.received_at ? dateTime(d.received_at) : ''}<Lines lines={d.inv_dispatch_lines} /></div>
            </div>
          ))}
        </div>
      )}
      {receiving && <ReceiveModal data={data} dispatch={receiving} onClose={() => setReceiving(null)} onDone={() => { setReceiving(null); onDone() }} />}
    </div>
  )
}

function ReceiveModal({ data, dispatch, onClose, onDone }) {
  const [got, setGot] = useState(Object.fromEntries(dispatch.inv_dispatch_lines.map(l => [l.id, String(fmt(l.qty_sent))])))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await act(data, 'receive', { dispatch_id: dispatch.id, lines: dispatch.inv_dispatch_lines.map(l => ({ line_id: l.id, qty_received: Number(got[l.id] || 0) })) })
      onDone()
    } catch (err) { setError(err.message); setBusy(false) }
  }
  return (
    <Modal title={`From ${dispatch.from_name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <p className="text-sm text-gray-600">Change any number that arrived short. Your stock goes up by what you confirm.</p>
        {dispatch.inv_dispatch_lines.map(l => (
          <div key={l.id} className="flex items-center gap-3">
            <div className="min-w-0 flex-1 font-semibold">{l.name}<div className="text-xs font-normal text-gray-500">sent {fmt(l.qty_sent)} {l.unit}</div></div>
            <input className="input w-28 py-2 text-right text-lg font-bold" type="number" min="0" step="any" inputMode="decimal"
              value={got[l.id]} onChange={e => setGot(g => ({ ...g, [l.id]: e.target.value }))} />
          </div>
        ))}
        <ErrorText>{error}</ErrorText>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Confirm what arrived'}</button>
      </form>
    </Modal>
  )
}

function Produce({ data, onDone }) {
  const [recipes, setRecipes] = useState(null)
  const [items, setItems] = useState([])
  const [recipeId, setRecipeId] = useState('')
  const [batches, setBatches] = useState('1')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    api('manager/recipes').then(r => {
      const mine = r.recipes.filter(x => x.is_active && (x.kitchen_kind === 'any' || x.kitchen_kind === data.location.kind))
      setRecipes(mine); setItems(r.items)
      if (mine[0]) setRecipeId(mine[0].id)
    }).catch(e => setError(e.message))
  }, [data.location.kind])
  const byId = Object.fromEntries(items.map(i => [i.id, i]))
  const onHand = Object.fromEntries(data.stock.map(s => [s.id, s.on_hand]))
  const recipe = recipes?.find(r => r.id === recipeId)
  const n = Number(batches) || 0

  async function save(e) {
    e.preventDefault()
    setBusy(true); setError(''); setMsg('')
    try {
      await act(data, 'produce', { recipe_id: recipeId, batches: n, note })
      setMsg(`Recorded: ${fmt(recipe.yield_qty * n)} ${byId[recipe.output_item]?.unit} ${byId[recipe.output_item]?.name}.`)
      setNote('')
      onDone()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (!recipes) return <div className="card text-gray-400">{error || 'Loading recipes…'}</div>
  if (!recipes.length) return <div className="card text-gray-500">No recipes for a {data.location.kind_label.toLowerCase()} yet. Add them under Recipes.</div>
  return (
    <form onSubmit={save} className="card space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-black"><ChefHat size={20} /> Record food made</h2>
      <div className="flex flex-wrap gap-2">
        <select className="input min-w-0 flex-1 py-2 text-base" value={recipeId} onChange={e => setRecipeId(e.target.value)}>
          {recipes.map(r => <option key={r.id} value={r.id}>{byId[r.output_item]?.name} — 1 batch = {fmt(r.yield_qty)} {byId[r.output_item]?.unit}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm font-semibold">Batches
          <input className="input w-24 py-2 text-right text-lg font-bold" type="number" min="0" step="any" inputMode="decimal" value={batches} onChange={e => setBatches(e.target.value)} />
        </label>
      </div>
      {recipe && n > 0 && (
        <div className="rounded-xl bg-brand-cream p-3 text-sm">
          <div className="font-bold">Makes {fmt(recipe.yield_qty * n)} {byId[recipe.output_item]?.unit} {byId[recipe.output_item]?.name}, uses:</div>
          {recipe.lines.map(l => {
            const need = l.qty * n, have = onHand[l.input_item] ?? 0
            return (
              <div key={l.input_item} className={`flex justify-between ${need > have ? 'font-bold text-red-600' : ''}`}>
                <span>{byId[l.input_item]?.name}</span>
                <span>{fmt(need)} {byId[l.input_item]?.unit} <span className="text-gray-500">(have {fmt(have)})</span></span>
              </div>
            )
          })}
        </div>
      )}
      <input className="input" placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} />
      {msg && <p className="text-sm font-semibold text-green-700">{msg}</p>}
      <ErrorText>{error}</ErrorText>
      <button className="btn-primary w-full" disabled={busy || !recipe || !(n > 0)}>{busy ? 'Saving…' : 'Record'}</button>
    </form>
  )
}

function ItemLines({ items, lines, setLines, withCost, onHand }) {
  const byId = Object.fromEntries(items.map(i => [i.id, i]))
  const unused = items.filter(i => !lines.some(l => l.stock_item_id === i.id))
  const set = (i, patch) => setLines(ls => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)))
  return (
    <div className="space-y-2">
      {lines.map((l, i) => {
        const it = byId[l.stock_item_id]
        return (
          <div key={l.stock_item_id} className="flex flex-wrap items-center gap-2 rounded-xl border p-2">
            <div className="min-w-0 flex-1 font-semibold">{it?.name}{onHand && <span className="ml-1 text-xs font-normal text-gray-500">have {fmt(onHand[l.stock_item_id] ?? 0)}</span>}</div>
            <input className="input w-24 px-2 py-1.5 text-right font-bold" type="number" min="0" step="any" inputMode="decimal" placeholder="qty"
              value={l.qty} onChange={e => set(i, { qty: e.target.value })} />
            <span className="w-14 text-sm text-gray-500">{it?.unit}</span>
            {withCost && (
              <label className="flex items-center gap-1 text-sm">GH₵
                <input className="input w-24 px-2 py-1.5 text-right" type="number" min="0" step="any" inputMode="decimal" placeholder="per unit"
                  value={l.unit_cost} onChange={e => set(i, { unit_cost: e.target.value })} />
              </label>
            )}
            <button type="button" className="p-2 text-red-600" onClick={() => setLines(ls => ls.filter((_, n) => n !== i))} aria-label="Remove"><Trash2 size={16} /></button>
          </div>
        )
      })}
      {unused.length > 0 && (
        <select className="input py-2 text-base" value="" onChange={e => {
          const it = byId[e.target.value]
          if (it) setLines(ls => [...ls, { stock_item_id: it.id, qty: '', unit_cost: it.unit_cost != null ? String(fmt(it.unit_cost)) : '' }])
        }}>
          <option value="">+ Add an item…</option>
          {['raw', 'prepared', 'cooked'].map(k => (
            <optgroup key={k} label={{ raw: 'Raw ingredients', prepared: 'Prepared items', cooked: 'Cooked food' }[k]}>
              {unused.filter(i => i.kind === k).map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
            </optgroup>
          ))}
        </select>
      )}
    </div>
  )
}

function SendForm({ data, onDone }) {
  const [to, setTo] = useState(data.destinations[0]?.id || '')
  const [lines, setLines] = useState([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const onHand = Object.fromEntries(data.stock.map(s => [s.id, s.on_hand]))

  async function send(e) {
    e.preventDefault()
    setBusy(true); setError(''); setMsg('')
    try {
      await act(data, 'send', { to, note, lines: lines.map(l => ({ stock_item_id: l.stock_item_id, qty: Number(l.qty) })) })
      setMsg(`Sent to ${data.destinations.find(d => d.id === to)?.name}. It comes off your stock now; theirs goes up when they confirm.`)
      setLines([]); setNote('')
      onDone()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={send} className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-2 text-lg font-black"><Send size={18} /> Send to</h2>
          <select className="input w-auto py-2 text-base" value={to} onChange={e => setTo(e.target.value)}>
            {data.destinations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <ItemLines items={data.stock} lines={lines} setLines={setLines} onHand={onHand} />
        <input className="input" placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} />
        {msg && <p className="text-sm font-semibold text-green-700">{msg}</p>}
        <ErrorText>{error}</ErrorText>
        <button className="btn-primary w-full" disabled={busy || !to || !lines.some(l => Number(l.qty) > 0)}>{busy ? 'Sending…' : 'Send'}</button>
      </form>
      {data.sent.length > 0 && (
        <div className="card space-y-2">
          <h2 className="text-lg font-black">Sent (last 3 days)</h2>
          {data.sent.map(d => (
            <div key={d.id} className="flex flex-wrap items-start gap-2 border-b pb-2 text-sm">
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS[d.status][0]}`}>{STATUS[d.status][1]}</span>
              <div className="min-w-0 flex-1"><b>{d.to_name}</b> · {time(d.sent_at)}<Lines lines={d.inv_dispatch_lines} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Purchase({ data, onDone }) {
  const [suppliers, setSuppliers] = useState([])
  const [supplier, setSupplier] = useState('')
  const [lines, setLines] = useState([])
  const [note, setNote] = useState('')
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const loadSuppliers = useCallback(() => api('manager/suppliers').then(r => setSuppliers(r.suppliers.filter(s => s.is_active))).catch(e => setError(e.message)), [])
  useEffect(() => { loadSuppliers() }, [loadSuppliers])
  const total = lines.reduce((t, l) => t + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0)

  async function save(e) {
    e.preventDefault()
    setBusy(true); setError(''); setMsg('')
    try {
      await act(data, 'purchase', { supplier_id: supplier || null, note, lines: lines.map(l => ({ stock_item_id: l.stock_item_id, qty: Number(l.qty), unit_cost: Number(l.unit_cost) || 0 })) })
      setMsg(`Purchase recorded: ${ghs(total)}. Stock and costs updated.`)
      setLines([]); setNote('')
      onDone()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <>
    <form onSubmit={save} className="card space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-lg font-black"><ShoppingCart size={18} /> Record a purchase</h2>
        <select className="input w-auto py-2 text-base" value={supplier} onChange={e => setSupplier(e.target.value)}>
          <option value="">Supplier (optional)</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button type="button" className="text-sm font-semibold text-brand-brown" onClick={() => setAdding(true)}><Plus size={14} className="inline" /> New supplier</button>
      </div>
      <ItemLines items={data.stock} lines={lines} setLines={setLines} withCost />
      <div className="text-right text-lg font-black">Total {ghs(total)}</div>
      <input className="input" placeholder="Note, e.g. invoice number (optional)" value={note} onChange={e => setNote(e.target.value)} />
      {msg && <p className="text-sm font-semibold text-green-700">{msg}</p>}
      <ErrorText>{error}</ErrorText>
      <button className="btn-primary w-full" disabled={busy || !lines.some(l => Number(l.qty) > 0)}>{busy ? 'Saving…' : 'Save purchase'}</button>
    </form>
    {adding && <SupplierModal onClose={() => setAdding(false)} onSaved={s => { setAdding(false); loadSuppliers(); setSupplier(s.id) }} />}
    </>
  )
}

function SupplierModal({ onClose, onSaved }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(e) {
    e.preventDefault()
    e.stopPropagation()
    setBusy(true); setError('')
    try {
      const { supplier } = await api('manager/suppliers', { method: 'POST', body: { supplier: { name, phone } } })
      onSaved(supplier)
    } catch (err) { setError(err.message); setBusy(false) }
  }
  return (
    <Modal title="New supplier" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <input className="input" placeholder="Name, e.g. Makola Poultry" value={name} onChange={e => setName(e.target.value)} autoFocus />
        <input className="input" placeholder="Phone (optional)" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} />
        <ErrorText>{error}</ErrorText>
        <button className="btn-primary w-full" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Add supplier'}</button>
      </form>
    </Modal>
  )
}

function StockList({ data, me, onDone }) {
  const [counting, setCounting] = useState(false)
  const [adjusting, setAdjusting] = useState(null)
  const [kind, setKind] = useState('all')
  const u = me.user
  const list = data.stock.filter(s => kind === 'all' || s.kind === kind)
  const BADGE = { out: 'bg-red-100 text-red-700', low: 'bg-amber-100 text-amber-800', ok: 'bg-green-100 text-green-800' }
  return (
    <div className="card space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-black">Stock now</h2>
        <select className="input w-auto py-1.5 text-sm" value={kind} onChange={e => setKind(e.target.value)}>
          <option value="all">Everything</option><option value="raw">Raw ingredients</option><option value="prepared">Prepared items</option><option value="cooked">Cooked food</option>
        </select>
        {can(u, 'stock_count') && <button className="btn-dark ml-auto px-3 py-2 text-sm" onClick={() => setCounting(true)}>Count</button>}
      </div>
      <div className="divide-y text-sm">
        {list.map(s => (
          <div key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <b className="min-w-0 flex-1">{s.name}</b>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${BADGE[s.status]}`}>{fmt(s.on_hand)} {s.unit}</span>
            <span className="text-xs text-gray-500">low at {fmt(s.level)}</span>
            {(s.today.in > 0 || s.today.out > 0) && <span className="text-xs text-gray-500">today +{fmt(s.today.in)} / −{fmt(s.today.out)}</span>}
            {s.unit_cost !== undefined && <span className="text-xs text-gray-500">{ghs(s.unit_cost)}/{s.unit}</span>}
            {can(u, 'stock_adjust') && <button className="text-xs font-semibold text-brand-brown" onClick={() => setAdjusting(s)}>Adjust</button>}
          </div>
        ))}
        {!list.length && <div className="py-3 text-gray-400">Nothing here yet.</div>}
      </div>
      {counting && <CountModal data={data} onClose={() => setCounting(false)} onDone={() => { setCounting(false); onDone() }} />}
      {adjusting && <AdjustModal data={data} item={adjusting} onClose={() => setAdjusting(null)} onDone={() => { setAdjusting(null); onDone() }} />}
    </div>
  )
}

function CountModal({ data, onClose, onDone }) {
  const [counted, setCounted] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await act(data, 'count', { lines: Object.entries(counted).filter(([, v]) => v !== '').map(([id, v]) => ({ stock_item_id: id, counted: Number(v) })) })
      onDone()
    } catch (err) { setError(err.message); setBusy(false) }
  }
  return (
    <Modal title={`Count at ${data.location.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-2">
        <p className="text-sm text-gray-600">Enter what is really there. Leave blank what you didn't count.</p>
        {data.stock.map(s => (
          <div key={s.id} className="flex items-center gap-3">
            <div className="min-w-0 flex-1 font-semibold">{s.name} <span className="text-xs font-normal text-gray-500">(system {fmt(s.on_hand)} {s.unit})</span></div>
            <input className="input w-24 py-2 text-right font-bold" type="number" min="0" step="any" inputMode="decimal" placeholder="—"
              value={counted[s.id] ?? ''} onChange={e => setCounted(c => ({ ...c, [s.id]: e.target.value }))} />
          </div>
        ))}
        <ErrorText>{error}</ErrorText>
        <button className="btn-primary w-full" disabled={busy || !Object.values(counted).some(v => v !== '')}>{busy ? 'Saving…' : 'Save count'}</button>
      </form>
    </Modal>
  )
}

function AdjustModal({ data, item, onClose, onDone }) {
  const [kind, setKind] = useState('waste')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await act(data, 'adjust', { stock_item_id: item.id, qty: Number(qty), kind, note })
      onDone()
    } catch (err) { setError(err.message); setBusy(false) }
  }
  return (
    <Modal title={`${item.name}: waste or correction`} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div className="flex gap-2">
          {[['waste', 'Waste / spoilt'], ['manual', 'Correction (+/−)']].map(([k, l]) => (
            <button type="button" key={k} onClick={() => setKind(k)} className={`flex-1 rounded-xl border p-2 text-sm font-bold ${kind === k ? 'bg-brand-dark text-white' : ''}`}>{l}</button>
          ))}
        </div>
        <input className="input" type="number" step="any" inputMode="decimal" placeholder={kind === 'waste' ? `How many ${item.unit} were wasted` : 'Add (+) or remove (−), e.g. -2'}
          value={qty} onChange={e => setQty(e.target.value)} />
        <input className="input" placeholder="Reason (required)" value={note} onChange={e => setNote(e.target.value)} />
        <ErrorText>{error}</ErrorText>
        <button className="btn-primary w-full" disabled={busy || !Number(qty) || !note.trim()}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </Modal>
  )
}
