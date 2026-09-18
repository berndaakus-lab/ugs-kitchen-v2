import Head from 'next/head'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { MapPin, CheckCircle2, RefreshCw, LogOut, Package } from 'lucide-react'
import { useAdminPush } from '../hooks/usePush'

// Statuses that mean the order needs the delivery guy's attention
const DELIVERY_STATUSES = ['paid', 'preparing', 'ready']

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function formatGHS(amount) {
  return `GH₵ ${Number(amount).toFixed(2)}`
}

// ── Login ─────────────────────────────────────────────────────

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('')
  const [pin,      setPin]      = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const u = username.trim().toLowerCase()
    const { data, error: dbErr } = await supabase
      .from('staff')
      .select('id, name, pin, role, is_active, branch_id')
      .eq('username', u)
      .single()

    setLoading(false)

    if (dbErr || !data) { setError('Account not found.'); setPin(''); return }
    if (!data.is_active) { setError('Account is disabled.'); setPin(''); return }
    if (data.pin !== pin) { setError('Wrong PIN.'); setPin(''); return }

    onLogin({ role: data.role, name: data.name, branch_id: data.branch_id ?? null })
  }

  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center px-6">
      <div className="bg-white rounded-3xl p-8 w-full max-w-xs shadow-xl text-center">
        <img src="/logo-ugs.jpeg" alt="UGs Kitchen" className="w-14 h-14 object-contain mx-auto mb-4" />
        <h1 className="text-xl font-extrabold text-brand-dark mb-1">Delivery Login</h1>
        <p className="text-xs text-gray-400 mb-6">UGs Kitchen · Delivery</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Username"
            autoCapitalize="none"
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-center font-bold text-sm outline-none focus:border-brand-orange transition-colors"
            autoFocus
            required
          />
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="PIN"
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-center font-bold text-lg tracking-widest outline-none focus:border-brand-orange transition-colors"
            required
          />
          {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-orange text-white font-extrabold rounded-xl py-3 text-sm disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Status badge ──────────────────────────────────────────────

const STATUS_STYLE = {
  paid:      'bg-blue-100 text-blue-700',
  preparing: 'bg-yellow-100 text-yellow-700',
  ready:     'bg-green-100 text-green-700',
}
const STATUS_LABEL = {
  paid:      '💳 Paid',
  preparing: '👨‍🍳 Preparing',
  ready:     '🎉 Ready',
}

// ── Order card ────────────────────────────────────────────────

function OrderCard({ order, onDeliver, delivering }) {
  const parts    = (order.delivery_location ?? '').split('\n')
  const zone     = parts[0]
  const mapsLink = parts[1]
  const isPickup = zone.toLowerCase().includes('pick')
  const ref      = `#${String(order.id).slice(-6).toUpperCase()}`

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-brand-muted overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <p className="font-extrabold text-brand-dark text-base leading-tight">{order.customer_name}</p>
          <p className="text-xs text-gray-400 mt-0.5">{ref} · {formatTime(order.created_at)}</p>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${STATUS_STYLE[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
      </div>

      {/* Location */}
      <div className="px-4 pb-3">
        {isPickup ? (
          <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 mt-1">
            <Package size={16} className="text-gray-400 flex-shrink-0" />
            <span className="text-sm font-bold text-gray-600">Pick-Up — no delivery needed</span>
          </div>
        ) : (
          <div className="mt-1 space-y-1.5">
            <div className="flex items-center gap-2 bg-brand-cream rounded-xl px-3 py-2.5">
              <MapPin size={16} className="text-brand-orange flex-shrink-0" />
              <span className="text-sm font-bold text-brand-dark">{zone}</span>
            </div>
            {mapsLink && (
              <a
                href={mapsLink}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-blue-600 text-white font-extrabold text-sm rounded-xl py-2.5 active:bg-blue-700"
              >
                <MapPin size={15} />
                Open in Google Maps
              </a>
            )}
          </div>
        )}
      </div>

      {/* Items */}
      <div className="border-t border-gray-100 px-4 py-3 space-y-1">
        {order.items?.map((item, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-gray-700">{item.quantity}× {item.name}</span>
            <span className="font-semibold text-brand-dark">{formatGHS(item.price * item.quantity)}</span>
          </div>
        ))}
        <div className="flex justify-between text-sm pt-1 border-t border-gray-100">
          <span className="font-bold text-gray-500">Total</span>
          <span className="font-extrabold text-brand-orange">{formatGHS(order.total_amount)}</span>
        </div>
      </div>

      {/* Notes */}
      {order.notes && (
        <div className="mx-4 mb-3 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2">
          <p className="text-xs text-yellow-800">📝 {order.notes}</p>
        </div>
      )}

      {/* Mark delivered */}
      <div className="px-4 pb-4">
        <button
          onClick={() => onDeliver(order.id)}
          disabled={delivering === order.id}
          className="w-full flex items-center justify-center gap-2 bg-green-600 text-white font-extrabold rounded-xl py-3 text-sm active:bg-green-700 disabled:opacity-50 transition-colors"
        >
          <CheckCircle2 size={17} />
          {delivering === order.id ? 'Marking…' : 'Mark as Delivered'}
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────

export default function DeliveryPage() {
  const [currentUser, setCurrentUser] = useState(null)
  const [orders,      setOrders]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [delivering,  setDelivering]  = useState(null)

  useAdminPush(!!currentUser)

  const fetchOrders = useCallback(async () => {
    // Always today in GMT — clears at midnight GMT
    const todayGMT = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('orders')
      .select('id, customer_name, delivery_location, items, total_amount, notes, status, created_at')
      .in('status', DELIVERY_STATUSES)
      .gte('created_at', `${todayGMT}T00:00:00Z`)
      .lte('created_at', `${todayGMT}T23:59:59Z`)
      .order('created_at', { ascending: true })
    setOrders(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!currentUser) return
    fetchOrders()

    // Real-time: any order change refreshes the list
    const channel = supabase
      .channel('delivery-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [currentUser, fetchOrders])

  async function handleDeliver(orderId) {
    setDelivering(orderId)
    await fetch('/api/admin/update-order', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ orderId, status: 'delivered' }),
    })
    setDelivering(null)
    fetchOrders()
  }

  async function handleRefresh() {
    setRefreshing(true)
    await fetchOrders()
    setRefreshing(false)
  }

  if (!currentUser) return <LoginScreen onLogin={setCurrentUser} />

  // Filter out pick-up orders — delivery guy doesn't need those
  const deliveryOrders = orders.filter(o => !o.delivery_location?.toLowerCase().includes('pick'))
  const pickupOrders   = orders.filter(o =>  o.delivery_location?.toLowerCase().includes('pick'))

  return (
    <>
      <Head>
        <title>Delivery · UGs Kitchen</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-brand-cream">
        {/* Top bar */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
          <div>
            <p className="font-extrabold text-brand-dark text-base leading-tight">🛵 Delivery</p>
            <p className="text-xs text-gray-400">{currentUser.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="w-9 h-9 rounded-xl bg-brand-cream flex items-center justify-center active:bg-gray-200"
            >
              <RefreshCw size={16} className={`text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setCurrentUser(null)}
              className="w-9 h-9 rounded-xl bg-brand-cream flex items-center justify-center active:bg-gray-200"
            >
              <LogOut size={16} className="text-gray-500" />
            </button>
          </div>
        </div>

        <div className="max-w-lg mx-auto px-4 py-5 space-y-4">

          {loading ? (
            <div className="text-center py-16 text-gray-400 font-semibold text-sm">Loading orders…</div>
          ) : deliveryOrders.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">✅</p>
              <p className="font-extrabold text-brand-dark text-lg">All clear!</p>
              <p className="text-sm text-gray-400 mt-1">No pending deliveries right now.</p>
            </div>
          ) : (
            <>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                {deliveryOrders.length} order{deliveryOrders.length !== 1 ? 's' : ''} to deliver
              </p>
              {deliveryOrders.map(order => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onDeliver={handleDeliver}
                  delivering={delivering}
                />
              ))}
            </>
          )}

          {/* Pick-up orders — shown separately so the delivery guy can still see them */}
          {pickupOrders.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
                Pick-Up Orders ({pickupOrders.length})
              </p>
              {pickupOrders.map(order => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onDeliver={handleDeliver}
                  delivering={delivering}
                />
              ))}
            </div>
          )}

        </div>
      </div>
    </>
  )
}
