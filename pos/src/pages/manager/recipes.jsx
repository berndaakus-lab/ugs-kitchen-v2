import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import Layout, { ErrorText, Modal } from '@/components/Layout'
import { api, ghs, useMe } from '@/lib/client'

const ROLES = ['recipes', 'production', 'food_cost']   // permissions that open this page
const fmt = n => Number(Number(n || 0).toFixed(3))
const KITCHEN = { central: 'Central kitchen', satellite: 'Satellite kitchens', any: 'Any kitchen' }

// Recipes: what one batch uses and makes. Central kitchen: raw ingredients →
// prepared item. Satellite kitchen: prepared + raw → cooked food.
export default function Recipes() {
  const [me] = useMe(ROLES)
  const [data, setData] = useState(null)
  const [editing, setEditing] = useState(null)
  const [q, setQ] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(() => api('manager/recipes').then(setData).catch(e => setError(e.message)), [])
  useEffect(() => { if (me) load() }, [me, load])
  const byId = useMemo(() => Object.fromEntries((data?.items || []).map(i => [i.id, i])), [data])
  const shown = (data?.recipes || []).filter(r => !q.trim() || (byId[r.output_item]?.name || '').toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <Layout me={me}>
      <div className="mx-auto max-w-4xl space-y-4 p-3 md:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black">Recipes</h1>
          {data?.can_edit && <button className="btn-primary ml-auto px-3 py-2 text-sm" onClick={() => setEditing({})}><Plus size={16} /> New recipe</button>}
        </div>
        <p className="text-sm text-gray-600">When a kitchen records a batch, its ingredients come off that kitchen's stock and the food made goes on.</p>
        <ErrorText>{error}</ErrorText>
        {data?.recipes.length > 6 && <input className="input" placeholder="Search recipes" value={q} onChange={e => setQ(e.target.value)} />}
        <div className="space-y-2">
          {shown.map(r => (
            <div key={r.id} className="card space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-lg">{byId[r.output_item]?.name}</b>
                <span className="text-sm text-gray-500">1 batch = {fmt(r.yield_qty)} {byId[r.output_item]?.unit} · {KITCHEN[r.kitchen_kind]}</span>
                {!r.is_active && <span className="text-xs font-bold text-red-600">not in use</span>}
                {r.unit_cost !== undefined && <span className="text-sm font-semibold">{ghs(r.unit_cost)} per {byId[r.output_item]?.unit}</span>}
                {data.can_edit && <button className="ml-auto text-sm font-semibold text-brand-brown" onClick={() => setEditing(r)}>Edit</button>}
              </div>
              <div className="text-sm text-gray-600">Uses: {r.lines.map(l => `${fmt(l.qty)} ${byId[l.input_item]?.unit} ${byId[l.input_item]?.name}`).join(' + ')}</div>
              {r.note && <div className="text-xs text-gray-500">{r.note}</div>}
            </div>
          ))}
          {data && !shown.length && <div className="card text-gray-400">No recipes yet.</div>}
        </div>
      </div>
      {editing && <RecipeModal recipe={editing} data={data} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </Layout>
  )
}

function RecipeModal({ recipe, data, onClose, onSaved }) {
  const [f, setF] = useState({ output_item: '', yield_qty: '', kitchen_kind: 'central', note: '', is_active: true, lines: [], ...recipe })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const items = data.items.filter(i => i.is_active)
  const byId = Object.fromEntries(data.items.map(i => [i.id, i]))
  const set = patch => setF(x => ({ ...x, ...patch }))
  const unused = items.filter(i => i.id !== f.output_item && !f.lines.some(l => l.input_item === i.id))
  const cost = data.show_cost && Number(f.yield_qty) > 0
    ? f.lines.reduce((t, l) => t + Number(l.qty || 0) * (byId[l.input_item]?.unit_cost || 0), 0) / Number(f.yield_qty) : null

  async function save(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api('manager/recipes', { method: 'POST', body: { recipe: { ...f, lines: f.lines.map(l => ({ input_item: l.input_item, qty: Number(l.qty) })) } } })
      onSaved()
    } catch (err) { setError(err.message); setBusy(false) }
  }

  const group = (kinds, list) => kinds.map(k => (
    <optgroup key={k} label={{ raw: 'Raw ingredients', prepared: 'Prepared items', cooked: 'Cooked food' }[k]}>
      {list.filter(i => i.kind === k).map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
    </optgroup>
  ))

  return (
    <Modal title={recipe.id ? 'Edit recipe' : 'New recipe'} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <label className="block text-sm font-semibold">Makes
          <select className="input mt-1 py-2" value={f.output_item} onChange={e => set({ output_item: e.target.value })}>
            <option value="">Choose…</option>
            {group(['prepared', 'cooked', 'raw'], items)}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          One batch makes
          <input className="input w-24 py-2 text-right font-bold" type="number" min="0" step="any" inputMode="decimal" value={f.yield_qty} onChange={e => set({ yield_qty: e.target.value })} />
          {byId[f.output_item]?.unit || ''}
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(KITCHEN).map(([k, l]) => (
            <button type="button" key={k} onClick={() => set({ kitchen_kind: k })} className={`rounded-xl border px-3 py-2 text-sm ${f.kitchen_kind === k ? 'bg-brand-dark text-white' : ''}`}>{l}</button>
          ))}
        </div>
        <div className="text-sm font-black">Ingredients for one batch</div>
        {f.lines.map((l, i) => (
          <div key={l.input_item} className="flex items-center gap-2">
            <input className="input w-24 py-2 text-right font-bold" type="number" min="0" step="any" inputMode="decimal" value={l.qty}
              onChange={e => set({ lines: f.lines.map((x, n) => (n === i ? { ...x, qty: e.target.value } : x)) })} />
            <span className="min-w-0 flex-1 text-sm">{byId[l.input_item]?.unit} <b>{byId[l.input_item]?.name}</b></span>
            <button type="button" className="p-2 text-red-600" onClick={() => set({ lines: f.lines.filter((_, n) => n !== i) })} aria-label="Remove"><Trash2 size={16} /></button>
          </div>
        ))}
        <select className="input py-2 text-base" value="" onChange={e => e.target.value && set({ lines: [...f.lines, { input_item: e.target.value, qty: '' }] })}>
          <option value="">+ Add an ingredient…</option>
          {group(['raw', 'prepared', 'cooked'], unused)}
        </select>
        {cost != null && <p className="text-sm">Cost: <b>{ghs(cost)}</b> per {byId[f.output_item]?.unit || 'unit'}</p>}
        <input className="input" placeholder="Note (optional), e.g. fry 12 minutes" value={f.note || ''} onChange={e => set({ note: e.target.value })} />
        {recipe.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_active} onChange={e => set({ is_active: e.target.checked })} /> In use</label>}
        <ErrorText>{error}</ErrorText>
        <button className="btn-primary w-full" disabled={busy || !f.output_item || !(Number(f.yield_qty) > 0) || !f.lines.length}>{busy ? 'Saving…' : 'Save recipe'}</button>
      </form>
    </Modal>
  )
}
