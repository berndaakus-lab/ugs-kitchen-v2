import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import Layout, { ErrorText, Modal } from '@/components/Layout'
import { api, useMe } from '@/lib/client'

const ROLES = ['locations']   // permissions that open this page

// The warehouse, the central kitchen, the satellite kitchens, and which
// satellite kitchen supplies each branch.
export default function Locations() {
  const [me] = useMe(ROLES)
  const [locations, setLocations] = useState(null)
  const [editing, setEditing] = useState(null)   // {} = new satellite
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  const load = useCallback(() => api('manager/locations').then(r => setLocations(r.locations)).catch(e => setError(e.message)), [])
  useEffect(() => { if (me) load() }, [me, load])

  const of = kind => (locations || []).filter(l => l.kind === kind)
  const satellites = of('satellite')
  const name = Object.fromEntries((locations || []).map(l => [l.id, l.name]))

  async function assign(branchLoc, satelliteId) {
    setError(''); setSaved('')
    try {
      await api('manager/locations', { method: 'POST', body: { action: 'assign', branch_location_id: branchLoc.id, satellite_id: satelliteId || null } })
      setSaved(`${branchLoc.name} is now supplied by ${name[satelliteId] || 'nobody'}.`)
      load()
    } catch (err) { setError(err.message) }
  }

  const Place = ({ l }) => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <b className="min-w-0 flex-1">{l.name}{!l.is_active && <span className="ml-1 text-xs font-normal text-red-600">(not in use)</span>}</b>
      {l.kind === 'satellite' && <span className="text-xs text-gray-500">supplies {of('branch').filter(b => b.supplied_by === l.id).length} branch(es)</span>}
      <span className="text-xs text-gray-500">{l.alert_phones?.length ? `alerts to ${l.alert_phones.join(', ')}` : 'no alert phones'}</span>
      <button className="text-sm font-semibold text-brand-brown" onClick={() => setEditing(l)}>Edit</button>
    </div>
  )

  return (
    <Layout me={me}>
      <div className="mx-auto max-w-4xl space-y-4 p-3 md:p-4">
        <h1 className="text-2xl font-black">Kitchens & warehouse</h1>
        <p className="text-sm text-gray-600">
          Warehouse → central kitchen (prepared items) → satellite kitchens (cooked food) → their branches.
          Raw ingredients can also go straight from the warehouse to a satellite kitchen.
        </p>
        <ErrorText>{error}</ErrorText>
        {saved && <p className="text-sm font-semibold text-green-700">{saved}</p>}
        {!locations ? <div className="card text-gray-400">Loading…</div> : (
          <>
            <div className="card divide-y">
              <h2 className="pb-1 text-lg font-black">Warehouse & central kitchen</h2>
              {[...of('warehouse'), ...of('central')].map(l => <Place key={l.id} l={l} />)}
            </div>
            <div className="card divide-y">
              <div className="flex items-center gap-2 pb-1">
                <h2 className="text-lg font-black">Satellite kitchens</h2>
                <button className="btn-primary ml-auto px-3 py-2 text-sm" onClick={() => setEditing({})}><Plus size={16} /> Add satellite kitchen</button>
              </div>
              {satellites.map(l => <Place key={l.id} l={l} />)}
            </div>
            <div className="card">
              <h2 className="pb-1 text-lg font-black">Branches</h2>
              <p className="mb-2 text-xs text-gray-500">Each branch gets its cooked food from one satellite kitchen.</p>
              <div className="divide-y text-sm">
                {of('branch').map(b => (
                  <div key={b.id} className="flex flex-wrap items-center gap-2 py-2">
                    <b className="min-w-0 flex-1">{b.name}</b>
                    <select className="input w-auto py-1.5 text-sm" value={b.supplied_by || ''} onChange={e => assign(b, e.target.value)}>
                      <option value="">— no kitchen —</option>
                      {satellites.filter(s => s.is_active || s.id === b.supplied_by).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button className="text-xs font-semibold text-brand-brown" onClick={() => setEditing(b)}>Alert phones</button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      {editing && <PlaceModal place={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </Layout>
  )
}

function PlaceModal({ place, onClose, onSaved }) {
  const [name, setName] = useState(place.name || '')
  const [phones, setPhones] = useState((place.alert_phones || []).join(', '))
  const [active, setActive] = useState(place.is_active !== false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const isBranch = place.kind === 'branch'

  async function save(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api('manager/locations', { method: 'POST', body: { action: 'save', location: { id: place.id, name: isBranch ? place.name : name, alert_phones: phones, is_active: active } } })
      onSaved()
    } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal title={place.id ? place.name : 'New satellite kitchen'} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        {!isBranch && <input className="input" placeholder="Name, e.g. Accra satellite kitchen" value={name} onChange={e => setName(e.target.value)} autoFocus />}
        <label className="block text-sm font-semibold">Low-stock SMS go to
          <input className="input mt-1" placeholder="e.g. 0241234567, 0201234567" value={phones} onChange={e => setPhones(e.target.value)} />
        </label>
        <p className="text-xs text-gray-500">The owner always gets them too (ALERT_PHONES / OWNER_PHONES on the POS server).</p>
        {place.id && !isBranch && (
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> In use</label>
        )}
        <ErrorText>{error}</ErrorText>
        <button className="btn-primary w-full" disabled={busy || (!isBranch && !name.trim())}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </Modal>
  )
}
