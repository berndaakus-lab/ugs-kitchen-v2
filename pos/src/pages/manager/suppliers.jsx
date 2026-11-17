import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import Layout, { ErrorText, Modal } from '@/components/Layout'
import { api, useMe } from '@/lib/client'

const ROLES = ['purchases']   // permissions that open this page

// Who the warehouse buys from: add, change, archive or delete.
export default function Suppliers() {
  const [me] = useMe(ROLES)
  const [list, setList] = useState(null)
  const [editing, setEditing] = useState(null)
  const [archived, setArchived] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const load = useCallback(() => api('manager/suppliers').then(r => setList(r.suppliers)).catch(e => setError(e.message)), [])
  useEffect(() => { if (me) load() }, [me, load])

  async function remove(s) {
    if (!confirm(`Remove "${s.name}"?`)) return
    setError(''); setMsg('')
    try {
      const r = await api('manager/suppliers', { method: 'POST', body: { action: 'delete', id: s.id } })
      setMsg(r.removed === 'deleted' ? `"${s.name}" deleted.` : `"${s.name}" has purchases on record, so it was archived instead (past purchases keep it).`)
      load()
    } catch (err) { setError(err.message) }
  }

  const shown = (list || []).filter(s => archived || s.is_active)
  const archivedCount = (list || []).filter(s => !s.is_active).length
  return (
    <Layout me={me}>
      <div className="mx-auto max-w-3xl space-y-4 p-3 md:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <h1 className="text-2xl font-black">Suppliers</h1>
            <p className="text-sm text-gray-600">Who the warehouse buys from. Pick them when recording a purchase.</p>
          </div>
          <button className="btn-primary ml-auto px-3 py-2 text-sm" onClick={() => setEditing({})}><Plus size={16} /> New supplier</button>
        </div>
        <Link href="/store?tab=purchase" className="btn-ghost inline-flex px-3 py-1.5 text-sm">Record a purchase →</Link>
        {msg && <div className="rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">{msg}</div>}
        <ErrorText>{error}</ErrorText>
        {archivedCount > 0 && (
          <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} /> Show archived ({archivedCount})</label>
        )}
        <div className="card divide-y p-0">
          {shown.map(s => (
            <div key={s.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <b>{s.name}</b>{!s.is_active && <span className="ml-1 text-xs font-bold text-red-600">archived</span>}
                <div className="text-sm text-gray-500">{s.phone || 'no phone'}</div>
              </div>
              <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setEditing(s)}><Pencil size={14} /> Change</button>
              {s.is_active && <button className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => remove(s)} aria-label={`Remove ${s.name}`}><Trash2 size={16} /></button>}
            </div>
          ))}
          {list && !shown.length && <div className="p-6 text-center text-gray-400">No suppliers yet.</div>}
        </div>
      </div>
      {editing && <SupplierModal supplier={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </Layout>
  )
}

function SupplierModal({ supplier = {}, onClose, onSaved }) {
  const [name, setName] = useState(supplier.name || '')
  const [phone, setPhone] = useState(supplier.phone || '')
  const [active, setActive] = useState(supplier.is_active !== false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(e) {
    e.preventDefault()
    e.stopPropagation()
    setBusy(true); setError('')
    try {
      const r = await api('manager/suppliers', { method: 'POST', body: { supplier: { id: supplier.id, name, phone, is_active: active } } })
      onSaved(r.supplier)
    } catch (err) { setError(err.message); setBusy(false) }
  }
  return (
    <Modal title={supplier.id ? `Change ${supplier.name}` : 'New supplier'} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <input className="input" placeholder="Name, e.g. Makola Poultry" value={name} onChange={e => setName(e.target.value)} autoFocus />
        <input className="input" placeholder="Phone (optional)" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} />
        {supplier.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> In use</label>}
        <ErrorText>{error}</ErrorText>
        <button className="btn-primary w-full" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </Modal>
  )
}
