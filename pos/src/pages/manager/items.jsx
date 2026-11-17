import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import Layout, { ErrorText } from '@/components/Layout'
import ItemModal from '@/components/ItemModal'
import { api, ghs, useMe } from '@/lib/client'

const ROLES = ['stock_setup', 'purchases', 'recipes']   // permissions that open this page
const KIND_LABEL = { raw: 'Raw ingredient', prepared: 'Prepared item', cooked: 'Cooked food' }
const fmt = n => Number(Number(n || 0).toFixed(2))

// Every ingredient and food kept in stock: add, change, archive or delete.
export default function Items() {
  const [me] = useMe(ROLES)
  const [data, setData] = useState(null)
  const [editing, setEditing] = useState(null)   // {} = new
  const [kind, setKind] = useState('all')
  const [q, setQ] = useState('')
  const [archived, setArchived] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(() => api('items').then(setData).catch(e => setError(e.message)), [])
  useEffect(() => { if (me) load() }, [me, load])

  const shown = useMemo(() => (data?.items || []).filter(i =>
    (archived || i.is_active) && (kind === 'all' || i.kind === kind) &&
    (!q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase()))), [data, kind, q, archived])
  const archivedCount = (data?.items || []).filter(i => !i.is_active).length

  async function remove(item) {
    if (!confirm(`Remove "${item.name}"?`)) return
    setError(''); setMsg('')
    try {
      const r = await api('items', { method: 'POST', body: { action: 'delete', id: item.id } })
      setMsg(r.removed === 'deleted'
        ? `"${item.name}" deleted.`
        : `"${item.name}" is ${r.why}, so it was archived instead of deleted (past records keep it). Tick "Show archived" to bring it back.`)
      load()
    } catch (err) { setError(err.message) }
  }

  return (
    <Layout me={me}>
      <div className="mx-auto max-w-4xl space-y-4 p-3 md:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <h1 className="text-2xl font-black">Stock items</h1>
            <p className="text-sm text-gray-600">Everything you keep in stock: raw ingredients, prepared items and cooked food.</p>
          </div>
          {data?.can_add && <button className="btn-primary ml-auto px-3 py-2 text-sm" onClick={() => setEditing({})}><Plus size={16} /> New item</button>}
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/manager/stock" className="btn-ghost px-3 py-1.5">What each dish uses →</Link>
          <Link href="/manager/recipes" className="btn-ghost px-3 py-1.5">Recipes →</Link>
          <Link href="/store" className="btn-ghost px-3 py-1.5">Warehouse & kitchens →</Link>
        </div>
        {msg && <div className="rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">{msg}</div>}
        <ErrorText>{error}</ErrorText>

        <div className="card space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input py-2 pl-10" placeholder="Search items" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <div className="no-scrollbar flex gap-1 overflow-x-auto">
              {[['all', 'All'], ['raw', 'Raw'], ['prepared', 'Prepared'], ['cooked', 'Cooked']].map(([k, l]) => (
                <button key={k} onClick={() => setKind(k)} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold ${kind === k ? 'bg-brand-dark text-white' : 'bg-brand-muted'}`}>{l}</button>
              ))}
            </div>
            {archivedCount > 0 && (
              <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} /> Show archived ({archivedCount})</label>
            )}
          </div>

          {!data ? <div className="text-gray-400">Loading…</div> : (
            <div className="divide-y text-sm">
              {shown.map(i => (
                <div key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <div className="min-w-0 flex-1">
                    <b>{i.name}</b>{!i.is_active && <span className="ml-1 text-xs font-bold text-red-600">archived</span>}
                    <div className="text-xs text-gray-500">
                      {KIND_LABEL[i.kind]} · per {i.unit}
                      {i.batch_yield ? ` · ${i.batch_label || '1 batch'} = ${fmt(i.batch_yield)} ${i.unit}s` : ''}
                      {` · warn at ${fmt(i.low_level)}`}
                      {i.unit_cost !== undefined && ` · ${ghs(i.unit_cost)}/${i.unit}`}
                    </div>
                    <div className="text-xs text-gray-500">
                      In stock everywhere: {fmt(i.in_stock)} {i.unit}
                      {i.used_in_dishes > 0 && <> · <Link href={`/manager/stock?q=${encodeURIComponent(i.name)}`} className="font-semibold text-brand-brown">used by {i.used_in_dishes} dish{i.used_in_dishes === 1 ? '' : 'es'}</Link></>}
                      {i.used_in_recipes > 0 && <> · <Link href="/manager/recipes" className="font-semibold text-brand-brown">in {i.used_in_recipes} recipe{i.used_in_recipes === 1 ? '' : 's'}</Link></>}
                    </div>
                  </div>
                  {data.can_edit && (
                    <>
                      <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setEditing(i)}><Pencil size={14} /> Change</button>
                      {i.is_active && <button className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => remove(i)} aria-label={`Remove ${i.name}`} title="Remove"><Trash2 size={16} /></button>}
                    </>
                  )}
                </div>
              ))}
              {!shown.length && <div className="py-6 text-center text-gray-400">No items here yet.{data.can_add && ' Use "New item" to add one.'}</div>}
            </div>
          )}
        </div>
      </div>
      {editing && data && (
        <ItemModal item={editing} units={data.units} showCost={data.show_cost} defaultKind={kind === 'all' ? 'raw' : kind}
          onClose={() => setEditing(null)}
          onSaved={it => { setEditing(null); setMsg(`"${it.name}" saved.`); load() }} />
      )}
    </Layout>
  )
}
