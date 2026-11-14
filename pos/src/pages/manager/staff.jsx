import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { UserPlus } from 'lucide-react'
import Layout, { Modal, ErrorText } from '@/components/Layout'
import { api, can, useMe } from '@/lib/client'

const ROLES = ['staff_assign']   // permissions that open this page

// One list of people for the POS and the website: add someone, tick their
// roles (any combination), set their PIN. You can only give the roles your
// own roles allow, and only change people whose roles you could give.
export default function StaffPage() {
  const [me] = useMe(ROLES)
  const [data, setData] = useState(null)
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const [showRemoved, setShowRemoved] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => api('manager/staff').then(setData).catch(e => setError(e.message)), [])
  useEffect(() => { if (me) load() }, [me, load])

  const roleName = useMemo(() => Object.fromEntries((data?.roles || []).map(r => [r.key, r.name])), [data])
  const branchName = useMemo(() => Object.fromEntries((data?.branches || []).map(b => [b.id, b.name])), [data])
  const removedCount = (data?.staff || []).filter(s => !s.is_active).length
  const shown = (data?.staff || []).filter(s => (showRemoved || s.is_active) && (!q.trim() || `${s.name} ${s.username}`.toLowerCase().includes(q.trim().toLowerCase())))

  return (
    <Layout me={me}>
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black">Staff{data && !data.can_pick_branch ? ` · ${me?.user.branch_name}` : ''}</h1>
          {can(me?.user, 'roles_manage') && <Link href="/manager/roles" className="btn-ghost px-3 py-2 text-sm">Roles</Link>}
          <button className="btn-primary ml-auto px-3 py-2 text-sm" onClick={() => setAdding(true)}><UserPlus size={16} /> Add person</button>
        </div>
        <p className="text-sm text-gray-600">
          One login per person, for the POS and the website staff pages. You can give: {(data?.assignable || []).map(k => roleName[k]).join(', ') || '—'}.
        </p>
        <ErrorText>{error}</ErrorText>
        {removedCount > 0 && (
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={showRemoved} onChange={e => setShowRemoved(e.target.checked)} /> Show removed people ({removedCount})
          </label>
        )}
        {data && data.staff.length > 8 && <input className="input" placeholder="Search people" value={q} onChange={e => setQ(e.target.value)} />}
        <div className="card divide-y p-0">
          {shown.map(s => (
            <div key={s.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="font-bold">{s.name} <span className="text-sm font-normal text-gray-500">@{s.username}</span>{s.is_me && <span className="ml-1 text-xs text-gray-400">(you)</span>}</div>
                <div className="text-sm text-gray-500">
                  {s.pos
                    ? <><b>{(s.pos.pos_roles || []).map(k => roleName[k] || k).join(' + ')}</b>
                        {data.can_pick_branch && s.pos.branch_id && ` · ${branchName[s.pos.branch_id] || ''}`}
                        {!s.pos.is_active && ' · disabled'}
                        {s.pos.locked_until && new Date(s.pos.locked_until) > new Date() && ' · locked (wrong PINs)'}</>
                    : 'No login yet'}
                  {!s.is_active && <span className="ml-1 font-semibold text-red-600">· removed</span>}
                </div>
              </div>
              {s.editable && <button className="btn-ghost px-3 py-2 text-sm" onClick={() => setEditing(s)}>{!s.is_active ? 'Restore' : s.pos ? 'Edit' : 'Give access'}</button>}
            </div>
          ))}
          {data && !shown.length && <div className="p-6 text-center text-gray-400">No staff here yet.</div>}
        </div>
      </div>
      {adding && (
        <AddPerson data={data} me={me} onClose={() => setAdding(false)}
          onAdded={person => { setAdding(false); load().then(() => setEditing({ ...person, pos: null, editable: true })) }} />
      )}
      {editing && <EditStaff person={editing} data={data} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </Layout>
  )
}

function BranchSelect({ data, value, onChange }) {
  if (!data?.can_pick_branch) return null
  return (
    <label className="block text-sm font-semibold">Branch
      <select className="input mt-1 py-2" value={value || ''} onChange={e => onChange(e.target.value || null)}>
        <option value="">No branch (kitchen / all branches)</option>
        {data.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </label>
  )
}

function AddPerson({ data, me, onClose, onAdded }) {
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [branch, setBranch] = useState(me?.user.branch_id || null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const { person } = await api('manager/staff', { method: 'POST', body: { action: 'add', name, username, branch_id: branch } })
      onAdded(person)
    } catch (err) {
      setError(err.message); setBusy(false)
    }
  }

  return (
    <Modal title="Add a person" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <input className="input" placeholder="Full name" value={name} onChange={e => setName(e.target.value)} autoFocus />
        <input className="input" placeholder="Username (for signing in)" autoCapitalize="none" value={username}
          onChange={e => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))} />
        <BranchSelect data={data} value={branch} onChange={setBranch} />
        <p className="text-xs text-gray-500">Next you'll choose their roles and PIN.</p>
        <ErrorText>{error}</ErrorText>
        <button className="btn-primary w-full" disabled={busy || !name.trim() || username.length < 3}>{busy ? 'Adding…' : 'Add'}</button>
      </form>
    </Modal>
  )
}

function EditStaff({ person, data, onClose, onSaved }) {
  const [picked, setPicked] = useState(person.pos?.pos_roles || [])
  const [branch, setBranch] = useState(person.pos?.branch_id ?? person.branch_id ?? null)
  const [store, setStore] = useState(person.pos?.location_id ?? null)
  const [pin, setPin] = useState('')
  const [active, setActive] = useState(person.pos ? person.pos.is_active : true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const choices = data.roles.filter(r => data.assignable.includes(r.key))
  const toggle = k => setPicked(p => (p.includes(k) ? p.filter(x => x !== k) : [...p, k]))
  const SCOPE = { all: 'All branches', branch: 'One branch', kitchen: 'A kitchen', warehouse: 'The warehouse' }
  // Kitchen / warehouse roles work at one place: pick which.
  const scopes = data.roles.filter(r => picked.includes(r.key)).map(r => r.scope)
  const storeKinds = [...(scopes.includes('kitchen') ? ['central', 'satellite'] : []), ...(scopes.includes('warehouse') ? ['warehouse'] : [])]
  const storeChoices = (data.stores || []).filter(l => storeKinds.includes(l.kind))

  async function remove() {
    if (!confirm(`Remove ${person.name}? They can no longer sign in. If they have sales or deliveries on record, those keep their name.`)) return
    setBusy(true); setError('')
    try {
      const { removed } = await api('manager/staff', { method: 'POST', body: { action: 'remove', staff_id: person.id } })
      if (removed === 'disabled') alert(`${person.name} has history, so they were switched off and hidden instead of deleted. Tick "Show removed people" to restore them.`)
      onSaved()
    } catch (err) {
      setError(err.message); setBusy(false)
    }
  }

  async function save(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api('manager/staff', { method: 'POST', body: { staff_id: person.id, roles: picked, pin: pin || undefined, is_active: active, branch_id: branch, location_id: storeKinds.length ? store : null } })
      onSaved()
    } catch (err) {
      setError(err.message); setBusy(false)
    }
  }

  return (
    <Modal title={person.name} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <label className="block text-sm font-semibold">Roles <span className="font-normal text-gray-500">(tick all they do)</span></label>
        <div className="grid grid-cols-2 gap-2">
          {choices.map(r => {
            const on = picked.includes(r.key)
            return (
              <button type="button" key={r.key} onClick={() => toggle(r.key)} aria-pressed={on}
                className={`flex items-start gap-2 rounded-xl border p-3 text-left ${on ? 'border-brand-dark bg-brand-dark text-white' : 'border-brand-muted bg-white'}`}>
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${on ? 'border-white bg-white text-brand-dark' : 'border-gray-400'}`}>{on ? '✓' : ''}</span>
                <span>
                  <span className="block font-bold">{r.name}</span>
                  <span className={`block text-xs ${on ? 'text-white/70' : 'text-gray-500'}`}>{SCOPE[r.scope]}</span>
                </span>
              </button>
            )
          })}
        </div>
        <BranchSelect data={data} value={branch} onChange={setBranch} />
        {storeKinds.length > 0 && (
          <label className="block text-sm font-semibold">Works at
            <select className="input mt-1 py-2" value={store || ''} onChange={e => setStore(e.target.value || null)}>
              <option value="">Choose the kitchen / warehouse…</option>
              {storeChoices.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        )}
        <label className="block text-sm font-semibold">{person.pos ? 'New PIN (leave blank to keep)' : 'PIN (4–6 digits)'}</label>
        <input className="input tracking-[0.4em]" type="password" inputMode="numeric" value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} />
        {person.pos && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Login enabled
          </label>
        )}
        <ErrorText>{error}</ErrorText>
        <button className="btn-primary w-full" disabled={busy || !picked.length || (!person.pos && pin.length < 4) || (storeKinds.length > 0 && !store)}>{busy ? 'Saving…' : 'Save'}</button>
        {person.is_active !== false && (
          <button type="button" className="w-full py-2 text-sm font-semibold text-red-600" onClick={remove} disabled={busy}>Remove {person.name}</button>
        )}
      </form>
    </Modal>
  )
}
