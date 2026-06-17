import Head from 'next/head'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { ArrowLeft, ShoppingBag, RotateCcw, Clock, CheckCircle2, XCircle, Loader2, UtensilsCrossed } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'

// Show countdown for paid + preparing orders; fires auto-ready when elapsed
function PreparingCountdown({ order }) {
  const startMs   = new Date(order.paid_at ?? order.created_at).getTime()
  const totalSecs = (order.wait_time_minutes ?? 30) * 60
  const endMs     = startMs + totalSecs * 1000

  const [remaining, setRemaining] = useState(() => Math.max(0, Math.floor((endMs - Date.now()) / 1000)))
  const firedRef = useRef(false)

  useEffect(() => {
    if (remaining <= 0 && !firedRef.current) {
      firedRef.current = true
      fetch('/api/auto-ready', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orderId: order.id }),
      }).catch(() => {})
      return
    }
    if (remaining <= 0) return
    const id = setInterval(() => {
      const left = Math.max(0, Math.floor((endMs - Date.now()) / 1000))
      setRemaining(left)
    }, 1000)
    return () => clearInterval(id)
  }, [endMs, remaining, order.id])

  const pct  = Math.min(100, Math.round(((totalSecs - remaining) / totalSecs) * 100))
  const circ = 2 * Math.PI * 20
  const dash = (pct / 100) * circ
  const mm   = Math.floor(remaining / 60).toString().padStart(2, '0')
  const ss   = (remaining % 60).toString().padStart(2, '0')

  if (remaining <= 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-3">
        <UtensilsCrossed size={14} className="text-brand-orange" />
        <p className="text-xs font-bold text-brand-orange">Almost ready — hang tight!</p>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="relative w-12 h-12 flex-shrink-0">
        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" fill="none" stroke="#F5EDE0" strokeWidth="4" />
          <circle
            cx="24" cy="24" r="20"
            fill="none" stroke="#F38F1D" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            style={{ transition: 'stroke-dasharray 1s linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-extrabold text-brand-dark leading-none">{mm}:{ss}</span>
        </div>
      </div>
      <div>
        <p className="text-xs font-extrabold text-brand-dark">
          {order.status === 'preparing' ? 'Cooking your food' : 'Order confirmed — kitchen queued'}
        </p>
        <p className="text-[11px] text-gray-400">Est. {order.wait_time_minutes ?? 30} min total</p>
      </div>
    </div>
  )
}

function formatGHS(amount) {
  return `GH₵ ${Number(amount).toFixed(2)}`
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-GH', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const STATUS_STYLES = {
  pending:          { label: 'Pending',         bg: 'bg-gray-100',   text: 'text-gray-600',   icon: Clock },
  awaiting_payment: { label: 'Awaiting Payment', bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Clock },
  paid:             { label: 'Paid',             bg: 'bg-blue-100',   text: 'text-blue-700',   icon: CheckCircle2 },
  preparing:        { label: 'Preparing',        bg: 'bg-orange-100', text: 'text-orange-700', icon: Loader2 },
  ready:            { label: 'Ready 🎉',         bg: 'bg-green-100',  text: 'text-green-700',  icon: CheckCircle2 },
  delivered:        { label: 'Delivered',        bg: 'bg-green-100',  text: 'text-green-800',  icon: CheckCircle2 },
  failed:           { label: 'Failed',           bg: 'bg-red-100',    text: 'text-red-600',    icon: XCircle },
  cancelled:        { label: 'Cancelled',        bg: 'bg-red-100',    text: 'text-red-600',    icon: XCircle },
}

const ACTIVE_STATUSES = ['paid', 'preparing']

export default function OrdersPage() {
  const router = useRouter()
  const { customer, isLoggedIn, loading: authLoading } = useAuth()
  const { addItem } = useCart()

  const [orders,    setOrders]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [reordered, setReordered] = useState(null)

  useEffect(() => {
    if (authLoading) return
    if (!isLoggedIn) { router.replace('/?signin=1'); return }
    loadOrders()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isLoggedIn])

  async function loadOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('momo_number', customer.phone)
      .order('created_at', { ascending: false })
      .limit(50)
    setOrders(data ?? [])
    setLoading(false)
  }

  // Realtime: listen to ALL order updates, patch matching ones into local state
  useEffect(() => {
    if (!isLoggedIn || !customer || orders.length === 0) return

    const channel = supabase
      .channel(`customer-orders-${customer.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        payload => {
          setOrders(prev =>
            prev.map(o => o.id === payload.new.id ? { ...o, ...payload.new } : o)
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, customer, orders.length])

  function handleReorder(order) {
    const items = order.items ?? []
    items.forEach(item => {
      for (let i = 0; i < item.quantity; i++) addItem(item)
    })
    setReordered(order.id)
    setTimeout(() => router.push('/?opencart=1'), 600)
  }

  if (authLoading || (isLoggedIn && loading)) {
    return (
      <div className="min-h-screen bg-brand-cream flex items-center justify-center">
        <Loader2 size={36} className="animate-spin text-brand-orange" />
      </div>
    )
  }

  if (!isLoggedIn) return null

  return (
    <>
      <Head>
        <title>My Orders · UGs Kitchen</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>

      <div className="min-h-screen bg-brand-cream">
        <header className="sticky top-0 z-30 bg-brand-cream/95 backdrop-blur border-b border-brand-muted">
          <div className="max-w-lg mx-auto flex items-center gap-3 px-4 h-[60px]">
            <Link href="/" className="w-9 h-9 flex items-center justify-center rounded-full bg-brand-muted">
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="font-extrabold text-brand-dark text-base leading-tight">My Orders</h1>
              <p className="text-[11px] text-gray-400">Hi, {customer?.name?.split(' ')[0]} 👋</p>
            </div>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-5 space-y-4">
          {orders.length === 0 ? (
            <div className="text-center py-20">
              <ShoppingBag size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="font-bold text-gray-400 text-lg">No orders yet</p>
              <p className="text-sm text-gray-400 mt-1">Your order history will appear here.</p>
              <Link href="/" className="inline-block mt-6 bg-brand-brown text-white font-extrabold rounded-2xl px-6 py-3 text-base">
                Order Now
              </Link>
            </div>
          ) : (
            orders.map(order => {
              const s    = STATUS_STYLES[order.status] ?? STATUS_STYLES.pending
              const Icon = s.icon
              const isActive = ACTIVE_STATUSES.includes(order.status)

              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-2xl shadow-sm overflow-hidden border-2 transition-colors ${
                    isActive ? 'border-brand-orange/40' : 'border-brand-muted'
                  }`}
                >
                  {/* Order header */}
                  <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-gray-400">{formatDate(order.created_at)}</p>
                      <p className="font-extrabold text-brand-dark text-base mt-0.5">
                        {formatGHS(order.total_amount)}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">📍 {order.delivery_location}</p>
                    </div>
                    <span className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-xl ${s.bg} ${s.text}`}>
                      <Icon size={12} className={order.status === 'preparing' ? 'animate-spin' : ''} />
                      {s.label}
                    </span>
                  </div>

                  {/* Items */}
                  <div className="border-t border-brand-muted px-4 py-3 space-y-1">
                    {(order.items ?? []).map((item, i) => (
                      <div key={i} className="flex justify-between items-center text-sm">
                        <span className="text-gray-700 font-medium">{item.quantity}× {item.name}</span>
                        <span className="text-brand-orange font-semibold">{formatGHS(item.price * item.quantity)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Live countdown — shown for paid + preparing */}
                  {isActive && order.wait_time_minutes && (
                    <div className="border-t border-brand-muted">
                      <PreparingCountdown order={order} />
                    </div>
                  )}

                  {/* Ready banner */}
                  {order.status === 'ready' && (
                    <div className="border-t border-brand-muted px-4 py-3 bg-green-50 flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
                      <p className="text-xs font-bold text-green-700">
                        Your order is ready! {/pick.?up/i.test(order.delivery_location) ? 'Please come collect it.' : 'On its way to you!'}
                      </p>
                    </div>
                  )}

                  {/* Notes */}
                  {order.notes && (
                    <div className="px-4 pb-3">
                      <p className="text-xs text-gray-500 bg-yellow-50 rounded-xl px-3 py-2">
                        📝 {order.notes}
                      </p>
                    </div>
                  )}

                  {/* Reorder */}
                  <div className="px-4 pb-4">
                    <button
                      onClick={() => handleReorder(order)}
                      disabled={reordered === order.id}
                      className={`w-full flex items-center justify-center gap-2 rounded-2xl py-3 font-extrabold text-sm transition-colors
                        ${reordered === order.id ? 'bg-green-100 text-green-700' : 'bg-brand-muted text-brand-dark active:bg-gray-200'}`}
                    >
                      <RotateCcw size={15} />
                      {reordered === order.id ? 'Added to cart!' : 'Reorder'}
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </main>
      </div>
    </>
  )
}
