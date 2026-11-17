import { useState } from 'react'
import { Modal, ErrorText } from '@/components/Layout'
import { api } from '@/lib/client'

const KINDS = [['raw', 'Raw ingredient', 'bought, e.g. rice, oil, raw chicken'], ['prepared', 'Prepared item', 'made at the central kitchen'], ['cooked', 'Cooked food', 'what branches sell from']]
export const ALL_UNITS = ['plate', 'piece', 'pack', 'portion', 'scoop', 'can', 'kg', 'litre', 'bottle', 'bag', 'crate', 'tin', 'cylinder']

// One form to add or change a stock item, used on Stock items, Dish
// ingredients and the warehouse / kitchen screen (so nobody has to leave the
// page they're on to add a missing item). onSaved gets the saved item.
export default function ItemModal({ item = {}, units = ALL_UNITS, showCost, defaultKind = 'cooked', onClose, onSaved }) {
  const [f, setF] = useState({
    unit: defaultKind === 'raw' ? 'kg' : 'plate', low_level: 5, is_active: true, kind: defaultKind,
    ...item, unit_cost: item.unit_cost ?? '', batch_yield: item.batch_yield ?? '', batch_label: item.batch_label ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = patch => setF(v => ({ ...v, ...patch }))

  async function save(e) {
    e.preventDefault()
    e.stopPropagation()
    setBusy(true); setError('')
    try {
      const { item: saved } = await api('items', { method: 'POST', body: { action: 'save', item: f } })
      onSaved(saved)
    } catch (err) {
      setError(err.message); setBusy(false)
    }
  }

  return (
    <Modal title={item.id ? `Change ${item.name}` : 'New stock item'} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <label className="block text-sm font-semibold">Name
          <input className="input mt-1 py-2" placeholder="e.g. Raw chicken, Jollof rice" value={f.name || ''} onChange={e => set({ name: e.target.value })} autoFocus />
        </label>
        <div>
          <div className="mb-1 text-sm font-semibold">What is it?</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {KINDS.map(([k, l, hint]) => (
              <button type="button" key={k} onClick={() => set({ kind: k })}
                className={`rounded-xl border p-2 text-left text-sm ${f.kind === k ? 'border-brand-dark bg-brand-dark text-white' : 'border-brand-muted'}`}>
                <b className="block">{l}</b><span className={`text-xs ${f.kind === k ? 'text-white/70' : 'text-gray-500'}`}>{hint}</span>
              </button>
            ))}
          </div>
        </div>
        <label className="block text-sm font-semibold">Counted in
          <select className="input mt-1 py-2" value={f.unit} onChange={e => set({ unit: e.target.value })}>
            {units.map(u => <option key={u} value={u}>{u}s</option>)}
          </select>
        </label>
        <div>
          <div className="text-sm font-semibold">Bag / batch size <span className="font-normal text-gray-500">(optional)</span></div>
          <div className="mt-1 flex gap-2">
            <input className="input py-2" placeholder="e.g. 5 kg bag of rice" value={f.batch_label} onChange={e => set({ batch_label: e.target.value })} />
            <input className="input w-28 py-2" type="number" min="0" step="any" placeholder={`${f.unit}s`} value={f.batch_yield} onChange={e => set({ batch_yield: e.target.value })} />
          </div>
        </div>
        {showCost && (
          <label className="block text-sm font-semibold">Cost per {f.unit} (GH₵) <span className="font-normal text-gray-500">— purchases and recipes keep it up to date</span>
            <input className="input mt-1 py-2" type="number" min="0" step="any" inputMode="decimal" value={f.unit_cost} onChange={e => set({ unit_cost: e.target.value })} />
          </label>
        )}
        <label className="block text-sm font-semibold">Warn when at or below
          <input className="input mt-1 py-2" type="number" min="0" step="any" value={f.low_level} onChange={e => set({ low_level: e.target.value })} />
        </label>
        {item.id && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.is_active} onChange={e => set({ is_active: e.target.checked })} /> In use (untick to archive)
          </label>
        )}
        <ErrorText>{error}</ErrorText>
        <button className="btn-primary w-full" disabled={busy || !String(f.name || '').trim()}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </Modal>
  )
}
