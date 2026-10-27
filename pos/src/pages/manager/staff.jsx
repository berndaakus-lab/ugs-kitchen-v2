import { useCallback, useEffect, useState } from 'react'
import Layout, { Modal, ErrorText } from '@/components/Layout'
import { api, roleLabel, useMe } from '@/lib/client'

const ROLES = ['manager']

// POS logins are attached to people already in the online app's staff list
// (add new people there first, in /admin → Staff).
export default function StaffPage() {
  const [me] = useMe(ROLES)
  const [staff, setStaff] = useState([])
  const [roles, setRoles] = useState([])
  const [editing, setEditing] = useState(null)

  const load = useCallback(() => api('manager/staff').then(r => { setStaff(r.staff); setRoles(r.roles) }), [])
  useEffect(() => { if (me) load() }, [me, load])

  return (
    <Layout me={me}>
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <h1 className="text-2xl font-black">POS staff · {me?.user.branch_name}</h1>
        <p className="text-sm text-gray-600">
          Everyone listed comes from the online app's staff list for this branch. Give them a POS role and PIN to let them sign in here.
        </p>
        <div className="card divide-y p-0">
          {staff.map(s => (
            <div key={s.id} className="flex items-center gap-3 p-3">
              <div className="flex-1">
                <div className="font-bold">{s.name} <span className="text-sm font-normal text-gray-500">@{s.username}</span></div>
                <div className="text-sm text-gray-500">
                  {s.pos
                    ? <>POS: <b>{roleLabel(s.pos.pos_roles)}</b>{!s.pos.is_active && ' · disabled'}{s.pos.locked_until && new Date(s.pos.locked_until) > new Date() && ' · locked (wrong PINs)'}</>
                    : 'No POS access'}
                </div>
              </div>
              <button className="btn-ghost px-3 py-2 text-sm" onClick={() => setEditing(s)}>{s.pos ? 'Edit' : 'Give access'}</button>
            </div>
          ))}
          {!staff.length && <div className="p-6 text-center text-gray-400">No staff at this branch.</div>}
        </div>
      </div>
      {editing && <EditStaff person={editing} roles={roles} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </Layout>
  )
}

const ROLE_HINT = {
  cashier: 'Sells and takes payments',
  server:  'Hands over food',
  manager: 'Every screen at this branch',
  admin:   'Every screen at every branch',
}

// Cashier and server can be combined (one person doing both). Manager and
// admin already open every screen, so picking one of them clears the rest.
function toggleRole(current, r) {
  if (r === 'manager' || r === 'admin') return current.includes(r) ? [] : [r]
  const base = current.filter(x => x === 'cashier' || x === 'server')
  return base.includes(r) ? base.filter(x => x !== r) : [...base, r]
}

function EditStaff({ person, roles, onClose, onSaved }) {
  const [picked, setPicked] = useState(person.pos?.pos_roles || ['cashier'])
  const [pin, setPin] = useState('')
  const [active, setActive] = useState(person.pos ? person.pos.is_active : true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await api('manager/staff', { method: 'POST', body: { staff_id: person.id, roles: picked, pin: pin || undefined, is_active: active } })
      onSaved()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={person.name} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <label className="block text-sm font-semibold">
          POS roles <span className="font-normal text-gray-500">(tick both Cashier and Server for someone who does both)</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {roles.map(r => {
            const on = picked.includes(r)
            return (
              <button type="button" key={r} onClick={() => setPicked(p => toggleRole(p, r))} aria-pressed={on}
                className={`flex items-start gap-2 rounded-xl border p-3 text-left ${on ? 'border-brand-dark bg-brand-dark text-white' : 'border-brand-muted bg-white'}`}>
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${on ? 'border-white bg-white text-brand-dark' : 'border-gray-400'}`}>{on ? '✓' : ''}</span>
                <span>
                  <span className="block font-bold capitalize">{r}</span>
                  <span className={`block text-xs ${on ? 'text-white/70' : 'text-gray-500'}`}>{ROLE_HINT[r]}</span>
                </span>
              </button>
            )
          })}
        </div>
        <label className="block text-sm font-semibold">{person.pos ? 'New PIN (leave blank to keep)' : 'PIN (4–6 digits)'}</label>
        <input className="input tracking-[0.4em]" type="password" inputMode="numeric" value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} />
        {person.pos && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> POS access enabled
          </label>
        )}
        <ErrorText>{error}</ErrorText>
        <button className="btn-primary w-full" disabled={busy || !picked.length || (!person.pos && pin.length < 4)}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </Modal>
  )
}
