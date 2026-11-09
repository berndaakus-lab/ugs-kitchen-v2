import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Lock, Plus, Trash2 } from 'lucide-react'
import Layout, { Modal, ErrorText } from '@/components/Layout'
import { api, useMe } from '@/lib/client'

const ROLES = ['roles_manage']   // permissions that open this page

// The owner builds the roles: what each can do, where it works, whether it
// runs on shift, and which roles its holders may give to other people.
export default function RolesPage() {
  const [me] = useMe(ROLES)
  const [data, setData] = useState(null)
  const [editing, setEditing] = useState(null)   // {} = new
  const [error, setError] = useState('')

  const load = useCallback(() => api('manager/roles').then(setData).catch(e => setError(e.message)), [])
  useEffect(() => { if (me) load() }, [me, load])
  const label = Object.fromEntries((data?.groups || []).flatMap(g => g.perms))
  const scopeLabel = Object.fromEntries(data?.scopes || [])

  return (
    <Layout me={me}>
      <div className="mx-auto max-w-4xl space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black">Roles</h1>
          <Link href="/manager/staff" className="btn-ghost px-3 py-2 text-sm">Staff</Link>
          <button className="btn-primary ml-auto px-3 py-2 text-sm" onClick={() => setEditing({})}><Plus size={16} /> New role</button>
        </div>
        <p className="text-sm text-gray-600">
          Changes apply straight away, on the POS and the website. A person with several roles can do everything any of their roles allows.
        </p>
        <ErrorText>{error}</ErrorText>
        <div className="space-y-3">
          {(data?.roles || []).map(r => (
            <div key={r.key} className="card space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black">{r.name}</h2>
                {r.is_system && <span className="flex items-center gap-1 text-xs text-gray-500"><Lock size={12} /> locked</span>}
                <span className="text-sm text-gray-500">{scopeLabel[r.scope]} · {r.runs_shift ? 'runs on shift' : 'no shift'} · {r.holders} {r.holders === 1 ? 'person' : 'people'}</span>
                {!r.is_system && <button className="ml-auto text-sm font-semibold text-brand-brown" onClick={() => setEditing(r)}>Edit</button>}
              </div>
              <div className="flex flex-wrap gap-1">
                {r.is_system
                  ? <span className="rounded-full bg-brand-dark px-2 py-0.5 text-xs font-semibold text-white">Everything</span>
                  : r.permissions.map(p => <span key={p} className="rounded-full bg-brand-muted px-2 py-0.5 text-xs font-semibold">{label[p] || p}</span>)}
                {!r.is_system && !r.permissions.length && <span className="text-xs text-gray-400">Nothing ticked yet</span>}
              </div>
              {!r.is_system && r.can_assign.length > 0 && (
                <div className="text-xs text-gray-500">Can give: {r.can_assign.map(k => data.roles.find(x => x.key === k)?.name || k).join(', ')}</div>
              )}
            </div>
          ))}
        </div>
      </div>
      {editing && <RoleModal role={editing} data={data} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </Layout>
  )
}

function RoleModal({ role, data, onClose, onSaved }) {
  const [f, setF] = useState({ name: '', permissions: [], scope: 'branch', runs_shift: false, can_assign: [], ...role })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = patch => setF(x => ({ ...x, ...patch }))
  const flip = (field, v) => set({ [field]: f[field].includes(v) ? f[field].filter(x => x !== v) : [...f[field], v] })

  async function save(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api('manager/roles', { method: 'POST', body: { role: { key: role.key, name: f.name, permissions: f.permissions, scope: f.scope, runs_shift: f.runs_shift, can_assign: f.can_assign } } })
      onSaved()
    } catch (err) {
      setError(err.message); setBusy(false)
    }
  }

  async function remove() {
    if (!confirm(`Delete the role "${role.name}"?`)) return
    setBusy(true); setError('')
    try {
      await api('manager/roles', { method: 'POST', body: { action: 'delete', key: role.key } })
      onSaved()
    } catch (err) {
      setError(err.message); setBusy(false)
    }
  }

  return (
    <Modal title={role.key ? `Edit ${role.name}` : 'New role'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <input className="input" placeholder="Role name, e.g. Supervisor" value={f.name} onChange={e => set({ name: e.target.value })} autoFocus={!role.key} />

        <div>
          <div className="mb-1 text-sm font-semibold">Works at</div>
          <div className="flex flex-wrap gap-2">
            {data.scopes.map(([k, l]) => (
              <label key={k} className={`cursor-pointer rounded-xl border px-3 py-2 text-sm ${f.scope === k ? 'border-brand-dark bg-brand-dark text-white' : 'border-brand-muted'}`}>
                <input type="radio" className="sr-only" checked={f.scope === k} onChange={() => set({ scope: k })} />{l}
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={f.runs_shift} onChange={e => set({ runs_shift: e.target.checked })} /> Runs on shift (must start a shift to work)
        </label>

        {data.groups.map(g => (
          <div key={g.label}>
            <div className="mb-1 text-sm font-black">{g.label}</div>
            <div className="grid gap-1 sm:grid-cols-2">
              {g.perms.map(([p, l]) => (
                <label key={p} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={f.permissions.includes(p)} onChange={() => flip('permissions', p)} /> {l}
                </label>
              ))}
            </div>
          </div>
        ))}

        {f.permissions.includes('staff_assign') && (
          <div>
            <div className="mb-1 text-sm font-black">May give these roles to others</div>
            <div className="grid gap-1 sm:grid-cols-2">
              {data.roles.filter(r => !r.is_system).map(r => (
                <label key={r.key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={f.can_assign.includes(r.key)} onChange={() => flip('can_assign', r.key)} /> {r.name}
                </label>
              ))}
            </div>
          </div>
        )}

        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          {role.key && (
            <button type="button" className="btn-ghost px-3 text-red-600" onClick={remove} disabled={busy || role.holders > 0}
              title={role.holders > 0 ? 'Change the roles of the people who have it first' : 'Delete role'}><Trash2 size={18} /></button>
          )}
          <button className="btn-primary flex-1" disabled={busy || !f.name.trim()}>{busy ? 'Saving…' : 'Save role'}</button>
        </div>
      </form>
    </Modal>
  )
}
