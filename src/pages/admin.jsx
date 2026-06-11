import Head from 'next/head'
import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { sendSMSClient, smsPhone, STATUS_SMS } from '../lib/sms'
import {
  ShoppingBag, Clock, XCircle,
  TrendingUp, RefreshCw, LogOut, Eye,
  Star, CheckCircle2, Trash2, MessageSquare,
  UtensilsCrossed, Plus, Pencil, ChevronLeft, ChevronRight, X, ToggleLeft, ToggleRight
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

        <Link
          href="/"
          className="block mt-5 text-xs text-gray-400 hover:text-gray-600 transition-colors text-center"
        >
          ← Back to Menu
        </Link>
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

        {/* Special instructions */}
        {order.notes && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl px-4 py-3 mb-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-yellow-600 mb-1">
              ⚠️ Special Instructions
            </p>
            <p className="text-sm text-yellow-900 font-semibold">{order.notes}</p>
          </div>
        )}

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

// ── Menu Item Form Modal ──────────────────────────────────────
function MenuItemModal({ item, categories, branches, onSave, onClose, saving }) {
  const isNew = !item.id
  const [form, setForm] = useState(item)

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.price || !form.branch_id) return
    onSave(form)
  }

  // Filter categories to current branch
  const branchCats = categories.filter(c => c.branch_id === form.branch_id)

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-w-lg p-6 animate-slide-up max-h-[90dvh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-extrabold">{isNew ? 'Add Menu Item' : 'Edit Item'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-brand-muted flex items-center justify-center">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Branch (only shown if multiple exist) */}
          {branches.length > 1 && (
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Branch *</label>
              <select
                value={form.branch_id}
                onChange={e => set('branch_id', e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none focus:border-brand-orange bg-white"
                required
              >
                <option value="">Select branch…</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Item Name *</label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Jollof Rice + Chicken"
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none focus:border-brand-orange"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Description</label>
            <textarea
              value={form.description ?? ''}
              onChange={e => set('description', e.target.value)}
              placeholder="Short description…"
              rows={2}
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none focus:border-brand-orange resize-none"
            />
          </div>

          {/* Price + Category row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Price (GH₵) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={e => set('price', e.target.value)}
                placeholder="0.00"
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none focus:border-brand-orange"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Category</label>
              <select
                value={form.category_id ?? ''}
                onChange={e => set('category_id', e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none focus:border-brand-orange bg-white"
              >
                <option value="">None</option>
                {branchCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {/* Sort order + Image URL row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Sort Order</label>
              <input
                type="number"
                min="0"
                value={form.sort_order ?? 0}
                onChange={e => set('sort_order', e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none focus:border-brand-orange"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Image URL</label>
              <input
                value={form.image ?? ''}
                onChange={e => set('image', e.target.value)}
                placeholder="https://…"
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none focus:border-brand-orange"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => set('is_available', !form.is_available)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm border-2 transition-colors
                ${form.is_available ? 'border-green-400 bg-green-50 text-green-700' : 'border-gray-200 bg-white text-gray-500'}`}
            >
              {form.is_available ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
              Available
            </button>
            <button
              type="button"
              onClick={() => set('is_popular', !form.is_popular)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm border-2 transition-colors
                ${form.is_popular ? 'border-brand-orange bg-orange-50 text-brand-orange' : 'border-gray-200 bg-white text-gray-500'}`}
            >
              <Star size={14} fill={form.is_popular ? '#E85D04' : 'none'} stroke={form.is_popular ? '#E85D04' : 'currentColor'} />
              Popular
            </button>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-brand-orange text-white font-extrabold rounded-xl py-3 active:bg-orange-700 disabled:opacity-60 transition-colors"
          >
            {saving ? 'Saving…' : isNew ? 'Add Item' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Main Admin Dashboard ──────────────────────────────────────
export default function AdminPage() {
  const [authed,         setAuthed]         = useState(false)
  const [activeTab,      setActiveTab]      = useState('orders')
  const [orders,         setOrders]         = useState([])
  const [loading,        setLoading]        = useState(true)
  const [selectedDate,   setSelectedDate]   = useState(() => new Date().toISOString().split('T')[0])
  const [selectedOrder,  setSelectedOrder]  = useState(null)
  const [refreshing,     setRefreshing]     = useState(false)
  const [statusFilter,   setStatusFilter]   = useState('all')
  const [reviews,        setReviews]        = useState([])
  const [reviewsLoading, setReviewsLoading] = useState(true)
  const [branches,       setBranches]       = useState([])
  const [branchFilter,   setBranchFilter]   = useState('all')

  // Menu tab state
  const MENU_PAGE_SIZE = 10
  const [menuItems,   setMenuItems]   = useState([])
  const [menuLoading, setMenuLoading] = useState(false)
  const [menuPage,    setMenuPage]    = useState(0)
  const [menuTotal,   setMenuTotal]   = useState(0)
  const [menuBranch,  setMenuBranch]  = useState('all')
  const [categories,  setCategories]  = useState([])
  const [menuForm,    setMenuForm]    = useState(null)   // null=closed, {}=add, item=edit
  const [formSaving,  setFormSaving]  = useState(false)

  // Load branches once on login
  useEffect(() => {
    if (!authed) return
    supabase.from('branches').select('id, name, slug').eq('is_active', true).order('sort_order')
      .then(({ data }) => setBranches(data ?? []))
  }, [authed])

  const fetchOrders = useCallback(async () => {
    setRefreshing(true)
    const start = `${selectedDate}T00:00:00`
    const end   = `${selectedDate}T23:59:59`

    let query = supabase
      .from('orders')
      .select('*')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false })

    if (branchFilter !== 'all') {
      query = query.eq('branch_id', branchFilter)
    }

    const { data } = await query
    setOrders(data ?? [])
    setLoading(false)
    setRefreshing(false)
  }, [selectedDate, branchFilter])

  const fetchMenuItems = useCallback(async () => {
    setMenuLoading(true)
    let query = supabase
      .from('menu_items')
      .select('id, name, description, price, image, is_available, is_popular, sort_order, branch_id, category_id, categories(name)', { count: 'exact' })
      .order('sort_order')
      .range(menuPage * MENU_PAGE_SIZE, menuPage * MENU_PAGE_SIZE + MENU_PAGE_SIZE - 1)
    if (menuBranch !== 'all') query = query.eq('branch_id', menuBranch)
    const { data, count } = await query
    setMenuItems(data ?? [])
    setMenuTotal(count ?? 0)
    setMenuLoading(false)
  }, [menuPage, menuBranch])

  const fetchCategories = useCallback(async () => {
    let query = supabase.from('categories').select('id, name, branch_id').order('sort_order')
    if (menuBranch !== 'all') query = query.eq('branch_id', menuBranch)
    const { data } = await query
    setCategories(data ?? [])
  }, [menuBranch])

  const fetchReviews = useCallback(async () => {
    const { data } = await supabase
      .from('reviews')
      .select('id, customer_name, rating, comment, is_approved, created_at')
      .order('created_at', { ascending: false })
    setReviews(data ?? [])
    setReviewsLoading(false)
  }, [])

  useEffect(() => {
    if (authed) { fetchOrders(); fetchReviews() }
  }, [authed, fetchOrders, fetchReviews])

  useEffect(() => {
    if (authed && activeTab === 'menu') { fetchMenuItems(); fetchCategories() }
  }, [authed, activeTab, fetchMenuItems, fetchCategories])

  // Realtime — new orders and reviews appear instantly
  useEffect(() => {
    if (!authed) return
    const channel = supabase
      .channel('admin-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, fetchReviews)
      .subscribe()
    return () => channel.unsubscribe()
  }, [authed, fetchOrders, fetchReviews])

  async function handleApproveReview(id, current) {
    await supabase.from('reviews').update({ is_approved: !current }).eq('id', id)
    fetchReviews()
  }

  async function handleDeleteReview(id) {
    if (!confirm('Delete this review permanently?')) return
    await supabase.from('reviews').delete().eq('id', id)
    fetchReviews()
  }

  async function handleMenuSave(formData) {
    setFormSaving(true)
    const payload = {
      name:         formData.name.trim(),
      description:  formData.description?.trim() || null,
      price:        parseFloat(formData.price),
      image:        formData.image?.trim() || null,
      is_available: formData.is_available,
      is_popular:   formData.is_popular,
      sort_order:   parseInt(formData.sort_order) || 0,
      category_id:  formData.category_id || null,
      branch_id:    formData.branch_id,
    }
    if (formData.id) {
      await supabase.from('menu_items').update(payload).eq('id', formData.id)
    } else {
      await supabase.from('menu_items').insert(payload)
    }
    setFormSaving(false)
    setMenuForm(null)
    fetchMenuItems()
  }

  async function handleMenuDelete(id) {
    if (!confirm('Delete this menu item? This cannot be undone.')) return
    await supabase.from('menu_items').delete().eq('id', id)
    fetchMenuItems()
  }

  async function handleMenuToggle(item, field) {
    await supabase.from('menu_items').update({ [field]: !item[field] }).eq('id', item.id)
    fetchMenuItems()
  }

  async function handleStatusChange(orderId, newStatus) {
    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId)

    // SMS the customer on key status changes
    const updatedOrder = { ...selectedOrder, status: newStatus }
    const msgBuilder = STATUS_SMS[newStatus]
    if (msgBuilder && smsPhone(updatedOrder)) {
      sendSMSClient({
        to:      smsPhone(updatedOrder),
        message: msgBuilder(updatedOrder),
      })
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
                onClick={() => activeTab === 'orders' ? fetchOrders() : activeTab === 'reviews' ? fetchReviews() : fetchMenuItems()}
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

        {/* Tab switcher */}
        <div className="max-w-lg mx-auto px-4 pt-3 flex gap-2">
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-sm transition-colors
              ${activeTab === 'orders' ? 'bg-brand-dark text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
          >
            <ShoppingBag size={15} /> Orders
          </button>
          <button
            onClick={() => setActiveTab('reviews')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-sm transition-colors
              ${activeTab === 'reviews' ? 'bg-brand-dark text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
          >
            <MessageSquare size={15} /> Reviews
            {reviews.filter(r => r.is_approved).length > 0 && (
              <span className="bg-brand-orange text-white text-[10px] font-extrabold rounded-full w-4 h-4 flex items-center justify-center">
                {reviews.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('menu')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-sm transition-colors
              ${activeTab === 'menu' ? 'bg-brand-dark text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
          >
            <UtensilsCrossed size={15} /> Menu
          </button>
        </div>

        <div className="max-w-lg mx-auto px-4 py-5 space-y-5">

          {/* ── REVIEWS TAB ─────────────────────────────────── */}
          {activeTab === 'reviews' && (
            <div className="space-y-3">
              {reviewsLoading ? (
                [...Array(3)].map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl h-24 animate-pulse" />
                ))
              ) : reviews.length === 0 ? (
                <div className="text-center py-16">
                  <Star size={40} className="text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-400 font-semibold">No reviews yet</p>
                </div>
              ) : reviews.map(review => (
                <div key={review.id} className="bg-white rounded-2xl p-4 border border-brand-muted shadow-sm">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-brand-dark text-sm">{review.customer_name}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${review.is_approved ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {review.is_approved ? '✅ Visible' : '⏸ Hidden'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {[1,2,3,4,5].map(s => (
                          <Star key={s} size={12}
                            fill={review.rating >= s ? '#E85D04' : 'none'}
                            stroke={review.rating >= s ? '#E85D04' : '#D1D5DB'}
                            strokeWidth={1.5}
                          />
                        ))}
                        <span className="text-xs text-gray-400 ml-1">
                          {new Date(review.created_at).toLocaleDateString('en-GH', { day:'numeric', month:'short', year:'numeric' })}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleApproveReview(review.id, review.is_approved)}
                        title={review.is_approved ? 'Hide review' : 'Approve review'}
                        className="w-8 h-8 rounded-lg bg-brand-muted flex items-center justify-center active:bg-gray-200"
                      >
                        <CheckCircle2 size={15} className={review.is_approved ? 'text-green-500' : 'text-gray-400'} />
                      </button>
                      <button
                        onClick={() => handleDeleteReview(review.id)}
                        title="Delete review"
                        className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center active:bg-red-100"
                      >
                        <Trash2 size={15} className="text-red-400" />
                      </button>
                    </div>
                  </div>
                  {review.comment && (
                    <p className="text-sm text-gray-600 leading-relaxed bg-brand-cream rounded-xl px-3 py-2">
                      &ldquo;{review.comment}&rdquo;
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── ORDERS TAB ──────────────────────────────────── */}
          {activeTab === 'orders' && <>

          {/* Date picker + Branch filter */}
          <div className="flex items-center gap-2">
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
                className="px-3 py-2.5 bg-brand-orange text-white text-sm font-bold rounded-xl flex-shrink-0"
              >
                Today
              </button>
            )}
          </div>

          {/* Branch filter — only shown when multiple branches exist */}
          {branches.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              <button
                onClick={() => setBranchFilter('all')}
                className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors
                  ${branchFilter === 'all' ? 'bg-brand-dark text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
              >
                All Branches
              </button>
              {branches.map(b => (
                <button
                  key={b.id}
                  onClick={() => setBranchFilter(b.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors
                    ${branchFilter === b.id ? 'bg-brand-dark text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          )}

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

          </> /* end orders tab */}

          {/* ── MENU TAB ────────────────────────────────────── */}
          {activeTab === 'menu' && (
            <div className="space-y-4">

              {/* Branch filter + Add button */}
              <div className="flex items-center gap-2">
                {branches.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto no-scrollbar flex-1">
                    <button
                      onClick={() => { setMenuBranch('all'); setMenuPage(0) }}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors
                        ${menuBranch === 'all' ? 'bg-brand-dark text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
                    >
                      All
                    </button>
                    {branches.map(b => (
                      <button
                        key={b.id}
                        onClick={() => { setMenuBranch(b.id); setMenuPage(0) }}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors
                          ${menuBranch === b.id ? 'bg-brand-dark text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
                      >
                        {b.name.replace('UGs Kitchen — ', '')}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setMenuForm({ name: '', description: '', price: '', image: '', is_available: true, is_popular: false, sort_order: 0, category_id: '', branch_id: menuBranch !== 'all' ? menuBranch : (branches[0]?.id ?? '') })}
                  className="flex-shrink-0 flex items-center gap-1.5 bg-brand-orange text-white font-bold text-sm px-4 py-2 rounded-xl active:bg-orange-700"
                >
                  <Plus size={15} /> Add Item
                </button>
              </div>

              {/* Count + pagination info */}
              {menuTotal > 0 && (
                <p className="text-xs text-gray-400 font-semibold">
                  Showing {menuPage * MENU_PAGE_SIZE + 1}–{Math.min((menuPage + 1) * MENU_PAGE_SIZE, menuTotal)} of {menuTotal} items
                </p>
              )}

              {/* Menu list */}
              {menuLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="bg-white rounded-2xl h-16 animate-pulse" />
                  ))}
                </div>
              ) : menuItems.length === 0 ? (
                <div className="text-center py-16">
                  <UtensilsCrossed size={40} className="text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-400 font-semibold">No menu items</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {menuItems.map(item => (
                    <div key={item.id} className="bg-white rounded-2xl p-4 border border-brand-muted shadow-sm">
                      <div className="flex items-start gap-3">
                        {/* Image thumbnail */}
                        {item.image ? (
                          <img src={item.image} alt={item.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-brand-cream flex items-center justify-center flex-shrink-0">
                            <UtensilsCrossed size={18} className="text-gray-300" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-bold text-brand-dark text-sm truncate">{item.name}</p>
                            {item.is_popular && (
                              <span className="text-[9px] font-extrabold bg-orange-100 text-brand-orange px-1.5 py-0.5 rounded-full">★ Popular</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400">{item.categories?.name ?? '—'}</p>
                          <p className="text-sm font-extrabold text-brand-orange mt-0.5">{formatGHS(item.price)}</p>
                        </div>
                        {/* Inline actions */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => setMenuForm({ ...item, category_id: item.category_id ?? '', image: item.image ?? '' })}
                            title="Edit item"
                            className="w-8 h-8 rounded-lg bg-brand-muted flex items-center justify-center active:bg-gray-200"
                          >
                            <Pencil size={14} className="text-gray-500" />
                          </button>
                          <button
                            onClick={() => handleMenuDelete(item.id)}
                            title="Delete item"
                            className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center active:bg-red-100"
                          >
                            <Trash2 size={14} className="text-red-400" />
                          </button>
                        </div>
                      </div>
                      {/* Availability toggle pill — full width, clearly labeled */}
                      <button
                        onClick={() => handleMenuToggle(item, 'is_available')}
                        className={`mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-xl font-bold text-xs border-2 transition-colors active:scale-[0.98]
                          ${item.is_available
                            ? 'border-green-300 bg-green-50 text-green-700 active:bg-green-100'
                            : 'border-red-300 bg-red-50 text-red-600 active:bg-red-100'
                          }`}
                      >
                        {item.is_available
                          ? <><ToggleRight size={14} /> Available — tap to mark Out of Stock</>
                          : <><ToggleLeft  size={14} /> Out of Stock — tap to mark Available</>
                        }
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {menuTotal > MENU_PAGE_SIZE && (
                <div className="flex items-center justify-between pt-1">
                  <button
                    disabled={menuPage === 0}
                    onClick={() => setMenuPage(p => p - 1)}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl font-bold text-sm bg-white border border-gray-200 text-gray-600 disabled:opacity-40"
                  >
                    <ChevronLeft size={15} /> Prev
                  </button>
                  <span className="text-xs text-gray-500 font-semibold">
                    Page {menuPage + 1} / {Math.ceil(menuTotal / MENU_PAGE_SIZE)}
                  </span>
                  <button
                    disabled={(menuPage + 1) * MENU_PAGE_SIZE >= menuTotal}
                    onClick={() => setMenuPage(p => p + 1)}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl font-bold text-sm bg-white border border-gray-200 text-gray-600 disabled:opacity-40"
                  >
                    Next <ChevronRight size={15} />
                  </button>
                </div>
              )}

            </div>
          )}

        </div>
      </div>

      <OrderModal
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onStatusChange={handleStatusChange}
      />

      {menuForm && (
        <MenuItemModal
          item={menuForm}
          categories={categories}
          branches={branches}
          onSave={handleMenuSave}
          onClose={() => setMenuForm(null)}
          saving={formSaving}
        />
      )}
    </>
  )
}
