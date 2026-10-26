import { useEffect, useState } from 'react'
import { UserRound } from 'lucide-react'
import { api } from '@/lib/client'

export const emptyCustomer = { phone: '', name: '', opt_in: false }

// Phone is optional; a half-typed number blocks payment so it's never saved wrong.
export const customerProblem = c =>
  c.phone && c.phone.length !== 10 ? 'Finish the phone number or clear it.' : ''

// What the API expects: nothing when no phone was given.
export const customerPayload = c =>
  c.phone.length === 10 ? { phone: c.phone, name: c.name, opt_in: c.opt_in } : undefined

// Walk-in customer at the till: the cashier only types the phone number.
// The name is never asked: it comes from a previous visit, or from the name
// registered on the customer's MoMo wallet (looked up via Paystack).
// Pass `phone` + hidePhone when the number is typed elsewhere (the MoMo number).
export default function CustomerFields({ value, onChange, phone, hidePhone }) {
  const number = hidePhone ? phone : value.phone
  const [info, setInfo] = useState(null) // { customer, name, name_source } for `number`
  const [looking, setLooking] = useState(false)
  const set = patch => onChange(v => ({ ...v, ...patch }))

  useEffect(() => {
    // onChange is the parent's state setter, so use updater functions: the
    // cashier may tick the promo box while the lookup is still running.
    setInfo(null)
    onChange(v => (v.name ? { ...v, name: '' } : v)) // name belonged to the previous number
    if (!number || number.length !== 10) return
    let live = true
    setLooking(true)
    api(`customers/lookup?phone=${number}`)
      .then(r => {
        if (!live) return
        setInfo(r)
        onChange(v => ({ ...v, name: r.name || '' }))
      })
      .catch(() => {})
      .finally(() => live && setLooking(false))
    return () => { live = false }
  }, [number]) // eslint-disable-line react-hooks/exhaustive-deps

  const known = info?.customer
  return (
    <div className="space-y-2 rounded-xl border border-brand-muted bg-brand-cream/60 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <UserRound size={16} /> Customer
        {known
          ? <span className="ml-auto rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">
              Returning · {known.visits} visit{known.visits === 1 ? '' : 's'}
            </span>
          : <span className="ml-auto text-xs font-normal text-gray-500">{hidePhone ? 'from the MoMo number' : 'optional'}</span>}
      </div>
      {!hidePhone && (
        <input
          className="input py-2 text-base tracking-wider" inputMode="tel" placeholder="Phone 024XXXXXXX"
          value={value.phone} onChange={e => set({ phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
          autoFocus
        />
      )}
      {number?.length === 10 && (
        <>
          <div className="text-sm">
            {looking
              ? <span className="text-gray-500">Looking up name…</span>
              : value.name
                ? <>Name: <b>{value.name}</b> <span className="text-xs text-gray-500">({info?.name_source === 'saved' ? 'saved' : 'from MoMo'})</span></>
                : <span className="text-gray-500">Name not found — the number is still saved.</span>}
          </div>
          {known?.marketing_opt_in
            ? <div className="text-xs font-semibold text-green-700">✓ Already agreed to receive offers by SMS</div>
            : (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={value.opt_in} onChange={e => set({ opt_in: e.target.checked })} />
                <span>Customer agrees to receive offers and promos by SMS <span className="text-gray-500">(ask first)</span></span>
              </label>
            )}
          <div className="text-xs text-gray-500">A thank-you SMS with a review link is sent once payment is done.</div>
        </>
      )}
    </div>
  )
}
