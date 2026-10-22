import { useState } from 'react'
import { api, ghs } from '@/lib/client'
import { Modal, ErrorText } from './Layout'

// Needs a manager's PIN every time; only allowed before any food is served.
export default function VoidModal({ sale, onClose, onVoided }) {
  const [pin, setPin] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { sale: voided } = await api(`sales/${sale.id}/void`, {
        method: 'POST', body: { manager_pin: pin, reason },
      })
      onVoided?.(voided)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Void ticket ${sale.ticket_no}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-gray-600">
          Refund {ghs(sale.total)} to the customer and take back the food ticket before voiding.
        </p>
        <input className="input" placeholder="Reason" value={reason} onChange={e => setReason(e.target.value)} autoFocus />
        <input
          className="input tracking-[0.4em]"
          placeholder="Manager PIN"
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
        <ErrorText>{error}</ErrorText>
        <button className="btn-danger w-full" disabled={busy || !reason.trim() || pin.length < 4}>
          {busy ? 'Voiding…' : 'Void sale'}
        </button>
      </form>
    </Modal>
  )
}
