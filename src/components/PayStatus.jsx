import { useEffect, useState } from 'react'
import { CheckCircle2, UtensilsCrossed, Clock, Copy, Check, LogIn } from 'lucide-react'
import Link from 'next/link'

const REMINDER_KEY = 'ugs_reminder'

async function fireAutoReady(order) {
  try {
    await fetch('/api/auto-ready', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ orderId: order.id }),
    })
  } catch {}
  localStorage.removeItem(REMINDER_KEY)
}

function formatGHS(amount) {
  return `GH₵ ${Number(amount).toFixed(2)}`
}

function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0')
  const s = (secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      className="ml-2 text-brand-orange hover:text-brand-brown transition-colors"
      title="Copy"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  )
}

export default function PayStatus({ order, onDismiss }) {
  const waitSecs = (order?.wait_time_minutes ?? 30) * 60
  const [remaining, setRemaining] = useState(waitSecs)
  const [done,      setDone]      = useState(false)

  const newAccount = order?._newAccount?.isNew ? order._newAccount : null

  useEffect(() => {
    if (!order) return
    const fireAt = Date.now() + waitSecs * 1000
    localStorage.setItem(REMINDER_KEY, JSON.stringify({ fireAt, order }))

    const interval = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          setDone(true)
          fireAutoReady(order)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order])

  if (!order) return null

  const progress      = Math.round(((waitSecs - remaining) / waitSecs) * 100)
  const circumference = 2 * Math.PI * 38
  const dash          = (progress / 100) * circumference

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/95 px-4 animate-fade-in overflow-y-auto py-6">
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">

        {/* Success header */}
        <div className="text-center mb-5">
          <div className="flex justify-center mb-3">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 size={36} className="text-green-500" strokeWidth={2} />
            </div>
          </div>
          <h1 className="text-2xl font-extrabold text-brand-dark">Order Confirmed! 🎉</h1>
          <p className="text-gray-500 text-sm mt-1">
            Payment received. We&apos;re cooking your food now.
          </p>
        </div>

        {/* Countdown ring */}
        {!done ? (
          <div className="flex flex-col items-center mb-5">
            <div className="relative w-24 h-24">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 88 88">
                <circle cx="44" cy="44" r="38" fill="none" stroke="#F5EDE0" strokeWidth="6" />
                <circle
                  cx="44" cy="44" r="38"
                  fill="none"
                  stroke="#F38F1D"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${circumference}`}
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-extrabold text-brand-dark leading-none">
                  {formatTime(remaining)}
                </span>
                <span className="text-[10px] text-gray-400 font-semibold mt-0.5">left</span>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <UtensilsCrossed size={15} className="text-brand-orange" />
              <p className="text-sm font-bold text-brand-dark">
                Est. wait: {order.wait_time_minutes ?? 30} min
              </p>
            </div>
            <p className="text-xs text-gray-400 mt-1 text-center">
              You&apos;ll receive an SMS when your order is ready
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center mb-5 bg-orange-50 rounded-2xl p-4">
            <Clock size={28} className="text-brand-orange mb-2" />
            <p className="font-extrabold text-brand-dark text-center">Your order should be ready soon!</p>
            <p className="text-xs text-gray-500 text-center mt-1">
              We&apos;ll send you an SMS once it&apos;s confirmed ready.
            </p>
          </div>
        )}

        {/* New account credentials */}
        {newAccount && (
          <div className="mb-5 bg-brand-cream border-2 border-brand-orange/30 rounded-2xl p-4">
            <p className="text-xs font-extrabold uppercase tracking-wider text-brand-orange mb-2">
              🎉 Your account was created!
            </p>
            <p className="text-xs text-gray-500 mb-3">
              Sign in anytime to track orders and reorder. Save these credentials:
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-white rounded-xl px-3 py-2">
                <div>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase">Username</p>
                  <p className="font-extrabold text-brand-dark text-sm">{newAccount.username}</p>
                </div>
                <CopyButton text={newAccount.username} />
              </div>
              <div className="flex items-center justify-between bg-white rounded-xl px-3 py-2">
                <div>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase">Temp Password</p>
                  <p className="font-extrabold text-brand-dark text-sm tracking-widest">{newAccount.tempPassword}</p>
                </div>
                <CopyButton text={newAccount.tempPassword} />
              </div>
            </div>
            <Link
              href="/profile"
              onClick={onDismiss}
              className="mt-3 flex items-center justify-center gap-2 w-full bg-brand-orange text-white font-extrabold rounded-xl py-2.5 text-sm"
            >
              <LogIn size={14} />
              Go to My Profile
            </Link>
          </div>
        )}

        {/* Order summary */}
        <div className="bg-brand-cream rounded-2xl p-4 space-y-2 mb-4">
          <Row label="Name"     value={order.customer_name} />
          <Row label="Location" value={order.delivery_location} />
          <Row label="Total"    value={formatGHS(order.total_amount)} highlight />
          <Row label="Order #"  value={`#${String(order.id).slice(-6).toUpperCase()}`} />
        </div>

        {/* Items list */}
        <div className="mb-5 space-y-2 bg-white border border-brand-muted rounded-2xl p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Your Items</p>
          {order.items?.map((item, i) => (
            <div key={i} className="flex justify-between items-start gap-2">
              <span className="text-sm font-semibold text-brand-dark flex-1">
                {item.quantity}× {item.name}
              </span>
              <span className="text-sm font-bold text-brand-dark whitespace-nowrap">
                {formatGHS(item.price * item.quantity)}
              </span>
            </div>
          ))}
        </div>

        {order.notes && (
          <div className="bg-yellow-50 rounded-xl px-4 py-3 mb-5">
            <p className="text-xs text-brand-dark">
              📝 <span className="font-bold">Note:</span> {order.notes}
            </p>
          </div>
        )}

        <button
          onClick={onDismiss}
          className="w-full bg-brand-brown text-white font-extrabold rounded-2xl py-4 text-base active:bg-brand-dark transition-colors"
        >
          Order More Food
        </button>
      </div>
    </div>
  )
}

function Row({ label, value, highlight }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-gray-500 font-medium">{label}</span>
      <span className={`text-sm font-bold ${highlight ? 'text-brand-orange text-base' : 'text-brand-dark'}`}>
        {value}
      </span>
    </div>
  )
}
