import Head from 'next/head'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { notifyCustomer } from '../lib/whatsapp'
import {
  ShoppingBag, CheckCircle2, Clock, XCircle,
  TrendingUp, RefreshCw, LogOut, ChevronDown, Eye
} from 'lucide-react'

const STATUS_STYLES = {
  paid:             'bg-green-100 text-green-700',
  preparing:        'bg-blue-100 text-blue-700',
  ready:            'bg-purple-100 text-purple-700',
  delivered:        'bg-gray-100 text-gray-600',
  failed:           'bg-red-100 text-red-600',
  cancelled:        'bg-red-100 text-red-600',
  pending:          'bg-yellow-100 text-yellow-700',
  awaiting_payment: 'bg-yellow-100 text-yellow-700',
}

const STATUS_LABELS = {
  paid:             '✅ Paid',
  preparing:        '👨‍🍳 Preparing',
  ready:            '📦 Ready',
  delivered:        '🛵 Delivered',
  failed:           '❌ Failed',
  cancelled:        '🚫 Cancelled',
  pending:          '⏳ Pending',
  awaiting_payment: '⏳ Awaiting Payment',
}

function formatGHS(amount) {
  return `GH₵ ${Number(amount).toFixed(2)}`
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-GH', { weekday: 'short', day: 'numeric', month: 'short' })
}

// ── Login Screen ──────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [pin, setPin]       = useState('')
  const [error, setError]   = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (pin === process.env.NEXT_PUBLIC_ADMIN_PIN) {
      onLogin()
    } else {
      setError('Wrong PIN. Try again.')
      setPin('')
    }
  }

  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center px-6">
      <div className="bg-white rounded-3xl p-8 w-full max-w-xs shadow-xl text-center">
        <div className="w-14 h-14 bg-brand-orange rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-extrabold text-2xl">U</span>
        </div>
        <h1 className="text-xl font-extrabold text-brand-dark mb-1">Admin Access</h1>
        <p className="text-xs text-gray-400 mb-6">UGs Kitchen · Owner Only</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="Enter PIN"
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-center text-2xl tracking-widest font-bold outline-none focus:border-brand-orange transition-colors"
            autoFocus
          />
          {error && <p className="text-red-500 text-sm font-semibold">{error}</p>}
          <button
            type="submit"
            className="w-full bg-brand-orange text-white font-extrabold rounded-xl py-3 active:bg-orange-700 transition-colors"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Stat Card ─────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color = 'orange' }) {
  const colors = {
    orange: 'bg-orange-50 text-brand-orange',
    green:  'bg-green-50 text-green-600',
    blue:   'bg-blue-50 text-blue-600',
    red:    'bg-red-50 text-red-500',
  }
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-brand-muted">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${colors[color]}`}>
        {icon}
      </div>
      <p className="text-2xl font-extrabold text-brand-dark leading-tight">{value}</p>
      <p className="text-xs font-semibold text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Order Detail Modal ────────────────────────────────────────
function OrderModal({ order, onClose, onStatusChange }) {
  if (!order) return null
  const statusOptions = ['paid','preparing','ready','delivered','failed','cancelled']

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-w-lg p-6 animate-slide-up max-h-[85dvh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold">
            Order #{String(order.id).slice(-6).toUpperCase()}
          </h2>
          <span className={`text-xs font-bold px-2 py-1 rounded-lg ${STATUS_STYLES[order.status] ?? 'bg-gray-100'}`}>
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
        </div>

        {/* Customer info */}
        <div className="bg-brand-cream rounded-2xl p-4 space-y-2 mb-4 text-sm">
          <Row label="Name"     value={order.customer_name} />
          <Row label="Location" value={order.delivery_location} />
          <Row label="MoMo"     value={order.momo_number} />
          <Row label="Time"     value={`${formatDate(order.created_at)} · ${formatTime(order.created_at)}`} />
          <Row label="Total"    value={formatGHS(order.total_amount)} bold />
        </div>

        {/* Items */}
        <div className="space-y-2 mb-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Items</p>
          {order.items?.map((item, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-gray-700">{item.quantity}× {item.name}</span>
              <span className="font-semibold">{formatGHS(item.price * item.quantity)}</span>
            </div>
          ))}
        </div>

        {/* Update status */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Update Status</p>
          <div className="grid grid-cols-2 gap-2">
            {statusOptions.map(s => (
              <button
                key={s}
                onClick={() => onStatusChange(order.id, s)}
                className={`py-2 px-3 rounded-xl text-xs font-bold border-2 transition-colors
                  ${order.status === s
                    ? 'border-brand-orange bg-brand-orange text-white'
                    : 'border-gray-200 text-gray-600 active:bg-gray-50'
                  }`}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, bold }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={`font-semibold text-right ${bold ? 'text-brand-orange text-base' : 'text-brand-dark'}`}>
        {value}
      </span>
    </div>
  )
}

// ── Main Admin Dashboard ──────────────────────────────────────
export default function AdminPage() {
  const [authed,       setAuthed]       = useState(false)
  const [orders,       setOrders]       = useState([])
  const [loading,      setLoading]      = useState(true)
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0])
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [refreshing,   setRefreshing]   = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')

  const fetchOrders = useCallback(async () => {
    setRefreshing(true)
    const start = `${selectedDate}T00:00:00`
    const end   = `${selectedDate}T23:59:59`

    const { data } = await supabase
      .from('orders')
      .select('*')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false })

    setOrders(data ?? [])
    setLoading(false)
    setRefreshing(false)
  }, [selectedDate])

  useEffect(() => {
    if (authed) fetchOrders()
  }, [authed, fetchOrders])

  // Realtime — new orders appear instantly
  useEffect(() => {
    if (!authed) return
    const channel = supabase
      .channel('admin-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .subscribe()
    return () => channel.unsubscribe()
  }, [authed, fetchOrders])

  async function handleStatusChange(orderId, newStatus) {
    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId)

    // Notify the customer on key status changes
    const updatedOrder = { ...selectedOrder, status: newStatus }
    if (['preparing', 'ready', 'delivered', 'cancelled'].includes(newStatus)) {
      notifyCustomer(updatedOrder, newStatus)
    }

    setSelectedOrder(prev => prev ? { ...prev, status: newStatus } : null)
    fetchOrders()
  }

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />

  const filtered = statusFilter === 'all'
    ? orders
    : orders.filter(o => o.status === statusFilter)

  const paidOrders    = orders.filter(o => o.status === 'paid' || o.status === 'delivered' || o.status === 'preparing' || o.status === 'ready')
  const totalRevenue  = paidOrders.reduce((s, o) => s + Number(o.total_amount), 0)
  const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'awaiting_payment')
  const failedOrders  = orders.filter(o => o.status === 'failed' || o.status === 'cancelled')

  const isToday = selectedDate === new Date().toISOString().split('T')[0]

  return (
    <>
      <Head>
        <title>Admin · UGs Kitchen</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <div className="min-h-screen bg-brand-cream">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-white border-b border-brand-muted shadow-sm">
          <div className="max-w-lg mx-auto flex items-center justify-between px-4 h-[60px]">
            <div>
              <p className="font-extrabold text-brand-dark leading-tight">Kitchen Admin</p>
              <p className="text-[11px] text-gray-400">UGs Kitchen · Owner Dashboard</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchOrders}
                className={`w-9 h-9 rounded-xl bg-brand-muted flex items-center justify-center ${refreshing ? 'animate-spin' : ''}`}
              >
                <RefreshCw size={16} className="text-brand-dark" />
              </button>
              <button
                onClick={() => setAuthed(false)}
                className="w-9 h-9 rounded-xl bg-brand-muted flex items-center justify-center"
              >
                <LogOut size={16} className="text-brand-dark" />
              </button>
            </div>
          </div>
        </header>

        <div className="max-w-lg mx-auto px-4 py-5 space-y-5">

          {/* Date picker */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 font-semibold text-sm outline-none focus:border-brand-orange appearance-none bg-white"
              />
            </div>
            {!isToday && (
              <button
                onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                className="px-4 py-2.5 bg-brand-orange text-white text-sm font-bold rounded-xl"
              >
                Today
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<ShoppingBag size={18} />}
              label="Total Orders"
              value={orders.length}
              sub={isToday ? 'Today' : formatDate(selectedDate + 'T00:00:00')}
              color="orange"
            />
            <StatCard
              icon={<TrendingUp size={18} />}
              label="Revenue"
              value={formatGHS(totalRevenue)}
              sub="Paid orders only"
              color="green"
            />
            <StatCard
              icon={<Clock size={18} />}
              label="Pending"
              value={pendingOrders.length}
              sub="Awaiting payment"
              color="blue"
            />
            <StatCard
              icon={<XCircle size={18} />}
              label="Failed"
              value={failedOrders.length}
              sub="Failed / Cancelled"
              color="red"
            />
          </div>

          {/* Status filter tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {['all','paid','preparing','ready','delivered','pending','failed'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors
                  ${statusFilter === s
                    ? 'bg-brand-dark text-white'
                    : 'bg-white border border-gray-200 text-gray-600'
                  }`}
              >
                {s === 'all' ? `All (${orders.length})` : `${STATUS_LABELS[s]} (${orders.filter(o=>o.status===s).length})`}
              </button>
            ))}
          </div>

          {/* Orders list */}
          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl h-20 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <ShoppingBag size={40} className="text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 font-semibold">No orders for this day</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(order => (
                <button
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="w-full bg-white rounded-2xl p-4 shadow-sm border border-brand-muted text-left active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-extrabold text-brand-dark text-sm">
                          #{String(order.id).slice(-6).toUpperCase()}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLES[order.status] ?? 'bg-gray-100'}`}>
                          {STATUS_LABELS[order.status] ?? order.status}
                        </span>
                      </div>
                      <p className="font-semibold text-sm text-brand-dark truncate">{order.customer_name}</p>
                      <p className="text-xs text-gray-400">{order.delivery_location} · {formatTime(order.created_at)}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {order.items?.length} item{order.items?.length !== 1 ? 's' : ''} ·{' '}
                        {order.items?.map(i => i.name).join(', ').slice(0, 40)}
                        {order.items?.map(i => i.name).join(', ').length > 40 ? '…' : ''}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-extrabold text-brand-orange">{formatGHS(order.total_amount)}</p>
                      <Eye size={14} className="text-gray-300 mt-1 ml-auto" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <OrderModal
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onStatusChange={handleStatusChange}
      />
    </>
  )
}
