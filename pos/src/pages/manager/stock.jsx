import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Link2, Plus, Trash2, Wand2 } from 'lucide-react'
import Layout, { ErrorText, Modal } from '@/components/Layout'
import { api, ghs, useMe } from '@/lib/client'

const ROLES = ['manager']

// Stock setup (managers): what is counted, and what each dish uses.
// A dish with no links is untracked and sells exactly as before.
export default function StockSetup() {
  const [me] = useMe(ROLES)
  const [data, setData] = useState(null)
  const [editingItem, setEditingItem] = useState(null)   // {} = new
  const [editingDish, setEditingDish] = useState(null)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(() => api('stock/setup').then(setData).catch(e => setError(e.message)), [])
  useEffect(() => { if (me) load() }, [me, load])
  const itemsById = useMemo(() => Object.fromEntries((data?.items || []).map(i => [i.id, i])), [data])

  async function autoLink() {
    if (!confirm('Link every untracked dish to a stock item with the same name (1 per sale)? You can change any of them after.')) return
    try {
      const { linked } = await api('stock/setup', { method: 'POST', body: { action: 'auto_link' } })
      setMsg(`${linked} dish${linked === 1 ? '' : 'es'} linked.`)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const untracked = data?.dishes.filter(d => !d.links.length).length ?? 0

  return (
    <Layout me={me}>
      <div className="mx-auto max-w-4xl space-y-4 p-3 md:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black">Stock setup</h1>
          <Link href="/stock" className="btn-ghost ml-auto px-3 py-2 text-sm">← Stock</Link>
        </div>
        {msg && <div className="rounded-xl bg-green-50 p-2 text-sm font-semibold text-green-800">{msg}</div>}
        <ErrorText>{error}</ErrorText>
        {!data ? <div className="card text-gray-400">Loading…</div> : (
          <>
            {/* Stock items */}
            <div className="card">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black">Stock items</h2>
                <span className="text-sm text-gray-500">What the kitchen sends and the branch counts</span>
                <button className="btn-dark ml-auto px-3 py-2 text-sm" onClick={() => setEditingItem({})}><Plus size={16} /> New item</button>
              </div>
              <div className="divide-y text-sm">
                {data.items.map(i => (
                  <div key={i.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2 ${i.is_active ? '' : 'opacity-50'}`}>
                    <b className="min-w-0 flex-1">{i.name}</b>
                    <span className="text-gray-600">per {i.unit}</span>
                    {i.batch_yield && <span className="text-gray-600">{i.batch_label || '1 batch'} = {Number(i.batch_yield)} {i.unit}s</span>}
                    <span className="text-gray-600">low at {Number(i.low_level)}</span>
                    {!i.is_active && <span className="text-xs font-bold">hidden</span>}
                    <button className="text-xs font-semibold text-brand-brown" onClick={() => setEditingItem(i)}>Edit</button>
                  </div>
                ))}
                {!data.items.length && <div className="py-3 text-gray-400">No stock items yet. Use “Link dishes automatically” below to start, or add one.</div>}
              </div>
            </div>

            {/* Dishes */}
            <div className="card">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black">Dishes at {me.user.branch_name}</h2>
                <span className="text-sm text-gray-500">{untracked} not tracked</span>
                <button className="btn-primary ml-auto px-3 py-2 text-sm" onClick={autoLink} disabled={!untracked}><Wand2 size={16} /> Link dishes automatically</button>
              </div>
              <p className="mb-2 text-xs text-gray-500">
                A dish made at the branch from several things (e.g. Assorted Fried Rice) should use each of them — edit its links.
                A dish with no links is not tracked and always sells.
              </p>
              <div className="divide-y text-sm">
                {data.dishes.map(d => (
                  <div key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <b className="min-w-0 flex-1">{d.name} <span className="font-normal text-gray-500">{ghs(d.price)}</span></b>
                    <span className="text-gray-600">
                      {d.links.length
                        ? d.links.map(l => `${Number(l.qty)} ${itemsById[l.stock_item_id]?.unit || ''} ${itemsById[l.stock_item_id]?.name || '?'}`).join(' + ')
                        : <i className="text-gray-400">not tracked</i>}
                    </span>
                    <button className="text-xs font-semibold text-brand-brown" onClick={() => setEditingDish(d)}><Link2 size={12} className="inline" /> Links</button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      {editingItem && <ItemModal item={editingItem} units={data.units} onClose={() => setEditingItem(null)} onSaved={() => { setEditingItem(null); load() }} />}
      {editingDish && (
        <LinksModal dish={editingDish} dishes={data.dishes} items={data.items.filter(i => i.is_active)} isAdmin={me.user.role === 'admin'}
          onClose={() => setEditingDish(null)}
          onSaved={n => { setMsg(n > 1 ? `Saved for ${editingDish.name} at ${n} branches.` : ''); setEditingDish(null); load() }} />
      )}
    </Layout>
  )
}

function ItemModal({ item, units, onClose, onSaved }) {
  const [f, setF] = useState({ unit: 'plate', low_level: 5, is_active: true, ...item, batch_yield: item.batch_yield ?? '', batch_label: item.batch_label ?? '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = patch => setF(v => ({ ...v, ...patch }))

  async function save(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api('stock/setup', { method: 'POST', body: { action: 'save_item', item: f } })
      onSaved()
    } catch (err) {
      setError(err.message); setBusy(false)
    }
  }

  return (
    <Modal title={item.id ? `Edit ${item.name}` : 'New stock item'} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <input className="input py-2" placeholder="Name, e.g. Jollof rice" value={f.name || ''} onChange={e => set({ name: e.target.value })} autoFocus />
        <label className="block text-sm font-semibold">Counted in</label>
        <select className="input py-2" value={f.unit} onChange={e => set({ unit: e.target.value })}>
          {units.map(u => <option key={u} value={u}>{u}s</option>)}
        </select>
        <label className="block text-sm font-semibold">Batch conversion <span className="font-normal text-gray-500">(optional, for the kitchen)</span></label>
        <div className="flex gap-2">
          <input className="input py-2" placeholder="e.g. 5 kg bag of rice" value={f.batch_label} onChange={e => set({ batch_label: e.target.value })} />
          <input className="input w-28 py-2" type="number" min="0" step="0.5" placeholder={`${f.unit}s`} value={f.batch_yield} onChange={e => set({ batch_yield: e.target.value })} />
        </div>
        <label className="block text-sm font-semibold">Warn when at or below</label>
        <input className="input py-2" type="number" min="0" step="1" value={f.low_level} onChange={e => set({ low_level: e.target.value })} />
        {item.id && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.is_active} onChange={e => set({ is_active: e.target.checked })} /> In use
          </label>
        )}
        <ErrorText>{error}</ErrorText>
        <button className="btn-primary w-full" disabled={busy || !String(f.name || '').trim()}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </Modal>
  )
}

function LinksModal({ dish, dishes, items, isAdmin, onClose, onSaved }) {
  const [links, setLinks] = useState(dish.links.map(l => ({ ...l, qty: String(l.qty) })))
  const [allBranches, setAllBranches] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const unused = items.filter(i => !links.some(l => l.stock_item_id === i.id))
  const byId = Object.fromEntries(items.map(i => [i.id, i]))
  // Dishes that share a recipe ("protein same as Special Chicken Fried Rice"):
  // start from another dish's links, then change the base.
  const others = dishes.filter(d => d.id !== dish.id && d.links.length)

  function copyFrom(id) {
    const src = others.find(d => d.id === id)
    if (src) setLinks(src.links.filter(l => byId[l.stock_item_id]).map(l => ({ ...l, qty: String(l.qty) })))
  }

  async function save(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const r = await api('stock/setup', { method: 'POST', body: {
        action: 'set_links', menu_item_id: dish.id, all_branches: isAdmin && allBranches,
        links: links.map(l => ({ stock_item_id: l.stock_item_id, qty: Number(l.qty) })),
      } })
      onSaved(r.dishes)
    } catch (err) {
      setError(err.message); setBusy(false)
    }
  }

  return (
    <Modal title={`What one ${dish.name} uses`} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        {links.map((l, i) => (
          <div key={l.stock_item_id} className="flex items-center gap-2">
            <input className="input w-20 py-2 text-right font-bold" type="number" min="0" step="any" value={l.qty}
              onChange={e => setLinks(ls => ls.map((x, n) => (n === i ? { ...x, qty: e.target.value } : x)))} />
            <span className="min-w-0 flex-1 text-sm">{byId[l.stock_item_id]?.unit}{Number(l.qty) === 1 ? '' : 's'} of <b>{byId[l.stock_item_id]?.name}</b></span>
            <button type="button" className="p-2 text-red-600" onClick={() => setLinks(ls => ls.filter((_, n) => n !== i))} aria-label="Remove"><Trash2 size={16} /></button>
          </div>
        ))}
        {!links.length && <p className="text-sm text-gray-500">Not tracked — this dish always sells.</p>}
        {unused.length > 0 && (
          <select className="input py-2 text-base" value="" onChange={e => e.target.value && setLinks(ls => [...ls, { stock_item_id: e.target.value, qty: '1' }])}>
            <option value="">+ Add what it uses…</option>
            {unused.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
          </select>
        )}
        {others.length > 0 && (
          <select className="input py-2 text-base" value="" onChange={e => e.target.value && copyFrom(e.target.value)}>
            <option value="">Copy links from another dish…</option>
            {others.map(d => <option key={d.id} value={d.id}>{d.name} ({ghs(d.price)})</option>)}
          </select>
        )}
        <p className="text-xs text-gray-500">Fractions are fine: 0.1 can of beef, 2.5 scoops of rice, 0.33 pack of spaghetti.</p>
        {isAdmin && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allBranches} onChange={e => setAllBranches(e.target.checked)} />
            Same for “{dish.name}” at every branch
          </label>
        )}
        <ErrorText>{error}</ErrorText>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </Modal>
  )
}
