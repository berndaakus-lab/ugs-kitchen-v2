import { useState, useEffect, useRef } from 'react'
import { X, Minus, Plus, ChevronDown, Loader2 } from 'lucide-react'
import { useCart } from '../context/CartContext'
import { supabase } from '../lib/supabase'
import { notifyOwner } from '../lib/whatsapp'

const DELIVERY_LOCATIONS = [
  'Ayigya',
  'Ayigya Zongo',
  'Kotei',
  'KNUST Campus',
  'Bomso',
  'Oduom',
  'Boadi',
  'Emena',
  'Pick-Up (No Delivery)',
]

function formatGHS(amount) {
  return `GH₵ ${Number(amount).toFixed(2)}`
}

function formatMoMo(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0,3)} ${digits.slice(3)}`
  return `${digits.slice(0,3)} ${digits.slice(3,6)} ${digits.slice(6)}`
}

export default function OrderDrawer({ onPaymentSuccess }) {
  const { items, totalAmount, isOpen, closeDrawer, addItem, decrement, clearCart } = useCart()

  const [name, setName]         = useState('')
  const [location, setLocation] = useState('')
  const [momoNum, setMomoNum]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const drawerRef               = useRef(null)

  // Close on backdrop click
  function handleBackdrop(e) {
    if (drawerRef.current && !drawerRef.current.contains(e.target)) {
      closeDrawer()
    }
  }

  // Lock body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  async function handlePlaceOrder() {
    setError('')
    const phone = momoNum.replace(/\s/g, '')
    if (!name.trim())        return setError('Please enter your name.')
    if (!location)           return setError('Please select a delivery location.')
    if (phone.length !== 10) return setError('Enter a valid 10-digit MoMo number.')
    if (items.length === 0)  return setError('Your cart is empty.')

    setLoading(true)
    try {
      // 1. Persist order to Supabase
      const { data: order, error: dbErr } = await supabase
        .from('orders')
        .insert({
          customer_name:     name.trim(),
          delivery_location: location,
          momo_number:       phone,
          items:             items,
          total_amount:      totalAmount,
          status:            'pending',
        })
        .select()
        .single()

      if (dbErr) throw new Error(dbErr.message)

      // 2. Trigger Paystack MoMo charge via our API route
      const res = await fetch('/api/initiate-payment', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          orderId:     order.id,
          phone,
          amount:      totalAmount,
          customerName: name.trim(),
        }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.message || 'Payment initiation failed.')

      // 3. Poll via Supabase Realtime AND directly via Paystack verify
      pollOrderStatus(order.id, result.reference)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  function pollOrderStatus(orderId, reference) {
    let resolved = false

    function handleSuccess(orderData) {
      if (resolved) return
      resolved = true
      channel.unsubscribe()
      clearInterval(pollInterval)
      clearTimeout(timeoutId)
      setLoading(false)
      clearCart()
      closeDrawer()
      onPaymentSuccess(orderData)
      notifyOwner(orderData)
    }

    function handleFailed() {
      if (resolved) return
      resolved = true
      channel.unsubscribe()
      clearInterval(pollInterval)
      clearTimeout(timeoutId)
      setLoading(false)
      setError('Payment failed or was declined. Please try again.')
    }

    // Layer 1 — Supabase Realtime (fires instantly when webhook updates the DB)
    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        payload => {
          const status = payload.new.status
          if (status === 'paid')   handleSuccess(payload.new)
          if (status === 'failed') handleFailed()
        }
      )
      .subscribe()

    // Layer 2 — Direct Paystack verify polling every 5s (covers test mode + webhook delays)
    const pollInterval = setInterval(async () => {
      if (resolved || !reference) return
      try {
        const res = await fetch(
          `/api/verify-payment?reference=${reference}&orderId=${orderId}`
        )
        const data = await res.json()
        if (data.status === 'paid') {
          // Fetch the full order row to pass to success screen
          const { data: order } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single()
          handleSuccess(order)
        } else if (data.status === 'failed') {
          handleFailed()
        }
      } catch {
        // Silent — keep polling
      }
    }, 5000)

    // Layer 3 — Hard timeout after 3 minutes
    const timeoutId = setTimeout(() => {
      if (resolved) return
      resolved = true
      channel.unsubscribe()
      clearInterval(pollInterval)
      setLoading(false)
      setError('Payment timed out. Check your phone and try again.')
    }, 180_000)
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm"
      onMouseDown={handleBackdrop}
    >
      <div
        ref={drawerRef}
        className="w-full max-w-lg bg-white rounded-t-3xl shadow-drawer animate-slide-up max-h-[92dvh] flex flex-col"
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1.5 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-xl font-extrabold text-brand-dark">Your Order</h2>
          <button
            onClick={closeDrawer}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-brand-muted active:bg-gray-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {/* Cart items */}
          <div className="space-y-3">
            {items.map(item => (
              <div key={item.id} className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-brand-dark text-sm leading-tight">{item.name}</p>
                  {item.description && (
                    <p className="text-xs text-gray-400 leading-snug mt-0.5">{item.description}</p>
                  )}
                  <p className="text-brand-orange font-semibold text-sm mt-1">
                    {formatGHS(item.price)} × {item.quantity} = {formatGHS(item.price * item.quantity)}
                  </p>
                </div>
                <div className="flex items-center gap-2 bg-brand-muted rounded-xl px-2 py-1">
                  <button
                    onClick={() => decrement(item.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white shadow-sm"
                  >
                    <Minus size={12} strokeWidth={3} />
                  </button>
                  <span className="w-5 text-center font-extrabold text-sm">{item.quantity}</span>
                  <button
                    onClick={() => addItem(item)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-brand-orange text-white shadow-sm"
                  >
                    <Plus size={12} strokeWidth={3} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-dashed border-gray-200" />

          {/* Total */}
          <div className="flex items-center justify-between">
            <span className="text-gray-500 font-medium">Total</span>
            <span className="text-xl font-extrabold text-brand-dark">
              {formatGHS(totalAmount)}
            </span>
          </div>

          {/* Form */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                Your Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Kwame Mensah"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base font-semibold outline-none focus:border-brand-orange transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                Delivery Location
              </label>
              <div className="relative">
                <select
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base font-semibold outline-none focus:border-brand-orange appearance-none bg-white transition-colors"
                >
                  <option value="">Select location…</option>
                  {DELIVERY_LOCATIONS.map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
                <ChevronDown
                  size={18}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                MoMo Number
              </label>
              <input
                type="tel"
                inputMode="numeric"
                value={momoNum}
                onChange={e => setMomoNum(formatMoMo(e.target.value))}
                placeholder="024 XXX XXXX"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base font-semibold tracking-widest outline-none focus:border-brand-orange transition-colors"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                MTN, Vodafone, or AirtelTigo MoMo number
              </p>
            </div>
          </div>

          {error && (
            <p className="text-red-500 text-sm font-semibold bg-red-50 rounded-xl px-4 py-3 animate-fade-in">
              {error}
            </p>
          )}
        </div>

        {/* CTA */}
        <div className="px-5 pb-6 pt-3 border-t border-gray-100">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 size={32} className="animate-spin text-brand-orange" />
              <p className="font-bold text-brand-dark text-center">
                Check your phone for the payment prompt…
              </p>
              <p className="text-xs text-gray-400 text-center">
                Enter your MoMo PIN to complete the order.
              </p>
            </div>
          ) : (
            <button
              onClick={handlePlaceOrder}
              className="w-full bg-brand-orange text-white font-extrabold rounded-2xl py-4 text-lg active:bg-orange-700 transition-colors shadow-lg"
            >
              Place Order & Pay {formatGHS(totalAmount)}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
