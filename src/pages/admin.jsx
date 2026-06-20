import Head from 'next/head'
import Link from 'next/link'
import { useState, useEffect, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { sendSMSClient, smsPhone, STATUS_SMS } from '../lib/sms'
import {
  ShoppingBag, Clock, XCircle,
  TrendingUp, RefreshCw, LogOut, Eye,
  Star, CheckCircle2, Trash2, MessageSquare,
  UtensilsCrossed, Plus, Pencil, ChevronLeft, ChevronRight, X, ToggleLeft, ToggleRight,
  Users, ShieldCheck, ShieldOff, Download, FileSpreadsheet, CalendarDays, Calendar
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

// ── Export helpers ────────────────────────────────────────────
function ordersToRows(orders, branchName = '') {
  return orders.map(o => ({
    'Order ID':      `#${String(o.id).slice(-6).toUpperCase()}`,
    'Date':          new Date(o.created_at).toLocaleDateString('en-GH'),
    'Time':          new Date(o.created_at).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' }),
    'Customer':      o.customer_name,
    'Location':      o.delivery_location,
    'MoMo Number':   o.momo_number,
    'Items':         (o.items ?? []).map(i => `${i.quantity}x ${i.name}`).join(', '),
    'Total (GH₵)':   Number(o.total_amount).toFixed(2),
    'Status':        o.status,
    'Channel':       o.payment_channel ?? '',
    'Branch':        branchName || o.branch_id || '',
    'Notes':         o.notes ?? '',
  }))
}

function downloadExcel(rows, filename) {
  const ws = XLSX.utils.json_to_sheet(rows)
  // Auto column widths
  const colWidths = Object.keys(rows[0] ?? {}).map(k => ({
    wch: Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length), 10)
  }))
  ws['!cols'] = colWidths
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Orders')
  XLSX.writeFile(wb, filename)
}

// ── Login Screen ──────────────────────────────────────────────
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
    const adminUser = (process.env.NEXT_PUBLIC_ADMIN_USERNAME || 'admin').toLowerCase()

    // ── Admin: match env credentials
    if (u === adminUser) {
      if (pin === process.env.NEXT_PUBLIC_ADMIN_PIN) {
        onLogin({ role: 'admin', name: 'Admin' })
      } else {
        setError('Wrong PIN. Try again.')
        setPin('')
      }
      setLoading(false)
      return
    }

    // ── Kitchen staff: look up in DB
    const { data, error: dbErr } = await supabase
      .from('staff')
      .select('id, name, pin, role, is_active, branch_id')
      .eq('username', u)
      .single()

    if (dbErr || !data) {
      setError('Account not found.')
      setLoading(false)
      setPin('')
      return
    }
    if (!data.is_active) {
      setError('Account is disabled. Contact admin.')
      setLoading(false)
      setPin('')
      return
    }
    if (data.pin !== pin) {
      setError('Wrong PIN. Try again.')
      setLoading(false)
      setPin('')
      return
    }

    onLogin({ role: data.role, name: data.name, branch_id: data.branch_id ?? null })
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center px-6">
      <div className="bg-white rounded-3xl p-8 w-full max-w-xs shadow-xl text-center">
        <img src="/logo-ugs.jpeg" alt="UGs Kitchen" className="w-14 h-14 object-contain mx-auto mb-4" />
        <h1 className="text-xl font-extrabold text-brand-dark mb-1">Kitchen Staff Login</h1>
        <p className="text-xs text-gray-400 mb-6">UGs Kitchen · Staff &amp; Admin</p>

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
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-center text-2xl tracking-widest font-bold outline-none focus:border-brand-orange transition-colors"
            required
          />
          {error && <p className="text-red-500 text-sm font-semibold">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-brown text-white font-extrabold rounded-xl py-3 active:bg-brand-dark disabled:opacity-60 transition-colors"
          >
            {loading ? 'Checking…' : 'Enter'}
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

// ── Category Image Manager ────────────────────────────────────
function CategoryImageManager({ categories, onUpdate }) {
  const [open,    setOpen]    = useState(false)
  const [editing, setEditing] = useState({}) // { [id]: imageUrl }
  const [saving,  setSaving]  = useState({}) // { [id]: bool }

  function startEdit(cat) {
    setEditing(prev => ({ ...prev, [cat.id]: cat.image ?? '' }))
  }

  async function saveImage(cat) {
    setSaving(prev => ({ ...prev, [cat.id]: true }))
    await fetch('/api/admin/update-category', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ categoryId: cat.id, image: editing[cat.id] || null }),
    })
    setSaving(prev => ({ ...prev, [cat.id]: false }))
    setEditing(prev => { const n = { ...prev }; delete n[cat.id]; return n })
    onUpdate()
  }

  return (
    <div className="bg-white rounded-2xl border border-brand-muted overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-brand-dark"
      >
        <span>📂 Category Images</span>
        <span className="text-gray-400 text-xs font-normal">{open ? 'hide' : 'manage'}</span>
      </button>

      {open && (
        <div className="border-t border-brand-muted divide-y divide-brand-muted">
          {categories.map(cat => (
            <div key={cat.id} className="px-4 py-3 flex items-center gap-3">
              {/* Current image preview */}
              {cat.image ? (
                <img src={cat.image} alt={cat.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-brand-cream flex items-center justify-center flex-shrink-0 text-lg">🍽️</div>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-brand-dark mb-1">{cat.name}</p>
                {editing[cat.id] !== undefined ? (
                  <div className="flex gap-2">
                    <input
                      value={editing[cat.id]}
                      onChange={e => setEditing(prev => ({ ...prev, [cat.id]: e.target.value }))}
                      placeholder="Paste Supabase image URL…"
                      className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-brand-orange"
                    />
                    <button
                      onClick={() => saveImage(cat)}
                      disabled={saving[cat.id]}
                      className="text-xs font-bold text-white bg-brand-brown px-3 py-1.5 rounded-lg disabled:opacity-50"
                    >
                      {saving[cat.id] ? '…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditing(prev => { const n = { ...prev }; delete n[cat.id]; return n })}
                      className="text-xs text-gray-400 px-2"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button onClick={() => startEdit(cat)} className="text-xs text-brand-orange font-semibold">
                    {cat.image ? 'Change image' : '+ Add image'}
                  </button>
                )}
              </div>
            </div>
          ))}
          <div className="px-4 py-2 bg-brand-cream">
            <p className="text-[11px] text-gray-400">
              Upload images to Supabase → Storage → menu-images, then paste the public URL here.
            </p>
          </div>
        </div>
      )}
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
                    ? 'border-brand-brown bg-brand-brown text-white'
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

          {/* Sort order + Prep time row */}
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
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Prep Time (mins)</label>
              <input
                type="number"
                min="1"
                max="120"
                value={form.wait_time_minutes ?? 30}
                onChange={e => set('wait_time_minutes', e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none focus:border-brand-orange"
              />
            </div>
          </div>

          {/* Image URL */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Image URL</label>
            <input
              value={form.image ?? ''}
              onChange={e => set('image', e.target.value)}
              placeholder="https://…"
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none focus:border-brand-orange"
            />
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
              <Star size={14} fill={form.is_popular ? '#F38F1D' : 'none'} stroke={form.is_popular ? '#F38F1D' : 'currentColor'} />
              Popular
            </button>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-brand-brown text-white font-extrabold rounded-xl py-3 active:bg-brand-dark disabled:opacity-60 transition-colors"
          >
            {saving ? 'Saving…' : isNew ? 'Add Item' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Staff Form Modal ──────────────────────────────────────────
function StaffFormModal({ item, branches, onSave, onClose, saving }) {
  const isNew = !item.id
  const [form, setForm] = useState(item)
  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.username.trim()) return
    if (isNew && !form.pin) return
    onSave(form)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-w-lg p-6 animate-slide-up max-h-[90dvh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-extrabold">{isNew ? 'Add Staff Account' : 'Edit Staff'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-brand-muted flex items-center justify-center">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Full Name *</label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Ama Boateng"
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none focus:border-brand-orange"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Username *</label>
            <input
              value={form.username}
              onChange={e => set('username', e.target.value.toLowerCase())}
              placeholder="e.g. ama"
              autoCapitalize="none"
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none focus:border-brand-orange"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
              PIN {isNew ? '*' : '(leave blank to keep current)'}
            </label>
            <input
              type="password"
              inputMode="numeric"
              value={form.pin}
              onChange={e => set('pin', e.target.value)}
              placeholder="4-digit PIN"
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-center text-xl tracking-widest font-bold outline-none focus:border-brand-orange"
              required={isNew}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Assigned Branch</label>
            <select
              value={form.branch_id ?? ''}
              onChange={e => set('branch_id', e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none focus:border-brand-orange bg-white"
            >
              <option value="">All Branches</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">Staff will only see orders for their assigned branch.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Role *</label>
            <div className="flex gap-3">
              {['staff', 'admin'].map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => set('role', r)}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition-colors
                    ${form.role === r
                      ? r === 'admin' ? 'border-brand-orange bg-orange-50 text-brand-orange' : 'border-blue-400 bg-blue-50 text-blue-600'
                      : 'border-gray-200 bg-white text-gray-500'}`}
                >
                  {r === 'admin' ? '🛡 Admin' : '👨‍🍳 Kitchen Staff'}
                </button>
              ))}
            </div>
            {form.role === 'admin' && (
              <p className="text-[11px] text-brand-orange font-semibold mt-2">
                ⚠️ Admin can access all tabs including Menu, Reviews, and Staff management.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-brand-brown text-white font-extrabold rounded-xl py-3 active:bg-brand-dark disabled:opacity-60 transition-colors"
          >
            {saving ? 'Saving…' : isNew ? 'Create Account' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Main Admin Dashboard ──────────────────────────────────────
export default function AdminPage() {
  const [currentUser,    setCurrentUser]    = useState(null)   // { role, name }
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

  // Staff tab state (admin only)
  const [staffList,    setStaffList]    = useState([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [staffForm,    setStaffForm]    = useState(null)  // null=closed, {}=add, item=edit
  const [staffSaving,  setStaffSaving]  = useState(false)
  const [staffError,   setStaffError]   = useState('')

  const isAdmin = currentUser?.role === 'admin'

  // Export state
  const [exportOpen,    setExportOpen]    = useState(false)
  const [exporting,     setExporting]     = useState(false)
  const exportRef = useRef(null)

  // Close export dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleExport(type) {
    setExportOpen(false)
    setExporting(true)

    const branchLabel = branches.find(b => b.id === (currentUser?.branch_id || branchFilter))?.name ?? ''

    if (type === 'day') {
      // Use already-loaded orders (already filtered by date + branch)
      const rows = ordersToRows(orders, branchLabel)
      if (!rows.length) { alert('No orders for this day.'); setExporting(false); return }
      downloadExcel(rows, `UGs_Orders_${selectedDate}.xlsx`)
    } else {
      // Monthly: fetch full month
      const [y, m] = selectedDate.split('-')
      const start  = `${y}-${m}-01T00:00:00`
      const lastDay = new Date(y, m, 0).getDate()
      const end    = `${y}-${m}-${String(lastDay).padStart(2,'0')}T23:59:59`

      let query = supabase
        .from('orders')
        .select('*')
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false })

      const staffBranch = currentUser?.branch_id
      if (staffBranch) {
        query = query.eq('branch_id', staffBranch)
      } else if (branchFilter !== 'all') {
        query = query.eq('branch_id', branchFilter)
      }

      const { data } = await query
      const rows = ordersToRows(data ?? [], branchLabel)
      if (!rows.length) { alert('No orders for this month.'); setExporting(false); return }
      const monthLabel = new Date(`${y}-${m}-01`).toLocaleDateString('en-GH', { month: 'long', year: 'numeric' })
      downloadExcel(rows, `UGs_Orders_${y}-${m}.xlsx`)
    }

    setExporting(false)
  }

  // Load branches once on login
  useEffect(() => {
    if (!currentUser) return
    supabase.from('branches').select('id, name, slug').eq('is_active', true).order('sort_order')
      .then(({ data }) => setBranches(data ?? []))
  }, [currentUser])

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

    // Staff with an assigned branch: always lock to that branch
    const staffBranch = currentUser?.branch_id
    if (staffBranch) {
      query = query.eq('branch_id', staffBranch)
    } else if (branchFilter !== 'all') {
      // Admin free-filtering by branch
      query = query.eq('branch_id', branchFilter)
    }

    const { data } = await query
    setOrders(data ?? [])
    setLoading(false)
    setRefreshing(false)
  }, [selectedDate, branchFilter, currentUser])

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
    let query = supabase.from('categories').select('id, name, branch_id, image, sort_order').order('sort_order')
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
    if (currentUser) { fetchOrders(); fetchReviews() }
  }, [currentUser, fetchOrders, fetchReviews])

  useEffect(() => {
    if (currentUser && activeTab === 'menu') { fetchMenuItems(); fetchCategories() }
  }, [currentUser, activeTab, fetchMenuItems, fetchCategories])

  // Realtime — new orders and reviews appear instantly
  useEffect(() => {
    if (!currentUser) return
    const channel = supabase
      .channel('admin-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, fetchReviews)
      .subscribe()
    return () => channel.unsubscribe()
  }, [currentUser, fetchOrders, fetchReviews])

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
      name:              formData.name.trim(),
      description:       formData.description?.trim() || null,
      price:             parseFloat(formData.price),
      image:             formData.image?.trim() || null,
      is_available:      formData.is_available,
      is_popular:        formData.is_popular,
      sort_order:        parseInt(formData.sort_order) || 0,
      category_id:       formData.category_id || null,
      branch_id:         formData.branch_id,
      wait_time_minutes: parseInt(formData.wait_time_minutes) || 30,
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

  // ── Staff CRUD ────────────────────────────────────────────────
  const fetchStaff = useCallback(async () => {
    setStaffLoading(true)
    setStaffError('')
    const { data, error: err } = await supabase
      .from('staff')
      .select('id, name, username, role, is_active, branch_id, created_at, branches(name)')
      .order('created_at', { ascending: false })
    if (err) {
      setStaffError(err.message)
    } else {
      setStaffList(data ?? [])
    }
    setStaffLoading(false)
  }, [])

  useEffect(() => {
    if (currentUser && activeTab === 'staff' && isAdmin) fetchStaff()
  }, [currentUser, activeTab, isAdmin, fetchStaff])

  async function handleStaffSave(form) {
    setStaffSaving(true)
    setStaffError('')
    const payload = {
      name:      form.name.trim(),
      username:  form.username.trim().toLowerCase(),
      pin:       form.pin,
      role:      form.role,
      is_active: true,
      branch_id: form.branch_id || null,
    }
    if (form.id) {
      if (!form.pin) delete payload.pin   // keep existing PIN if blank on edit
      const { error: err } = await supabase.from('staff').update(payload).eq('id', form.id)
      if (err) { setStaffError(err.message); setStaffSaving(false); return }
    } else {
      const { error: err } = await supabase.from('staff').insert(payload)
      if (err) { setStaffError(err.message); setStaffSaving(false); return }
    }
    setStaffSaving(false)
    setStaffForm(null)
    fetchStaff()
  }

  async function handleStaffDelete(id) {
    if (!confirm('Remove this staff account permanently?')) return
    await supabase.from('staff').delete().eq('id', id)
    fetchStaff()
  }

  async function handleStaffToggle(member) {
    await supabase.from('staff').update({ is_active: !member.is_active }).eq('id', member.id)
    fetchStaff()
  }

  async function handleStatusChange(orderId, newStatus) {
    const res = await fetch('/api/admin/update-order', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ orderId, status: newStatus }),
    })

    if (!res.ok) {
      const { message } = await res.json().catch(() => ({}))
      console.error('[admin] status update failed:', message)
      return
    }

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

  if (!currentUser) return <LoginScreen onLogin={user => setCurrentUser(user)} />

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
                onClick={() => setCurrentUser(null)}
                className="w-9 h-9 rounded-xl bg-brand-muted flex items-center justify-center"
              >
                <LogOut size={16} className="text-brand-dark" />
              </button>
            </div>
          </div>
        </header>

        {/* Role badge */}
        <div className="max-w-lg mx-auto px-4 pt-2">
          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full
            ${isAdmin ? 'bg-brand-orange/10 text-brand-orange' : 'bg-blue-50 text-blue-600'}`}>
            {isAdmin ? <ShieldCheck size={11} /> : <Users size={11} />}
            {isAdmin ? `Admin · ${currentUser.name}` : `Staff · ${currentUser.name}`}
          </span>
        </div>

        {/* Tab switcher */}
        <div className="max-w-lg mx-auto px-4 pt-2 flex gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-sm transition-colors
              ${activeTab === 'orders' ? 'bg-brand-dark text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
          >
            <ShoppingBag size={15} /> Orders
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab('reviews')}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-sm transition-colors
                ${activeTab === 'reviews' ? 'bg-brand-dark text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
            >
              <MessageSquare size={15} /> Reviews
              {reviews.length > 0 && (
                <span className="bg-brand-orange text-white text-[10px] font-extrabold rounded-full w-4 h-4 flex items-center justify-center">
                  {reviews.length}
                </span>
              )}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setActiveTab('menu')}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-sm transition-colors
                ${activeTab === 'menu' ? 'bg-brand-dark text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
            >
              <UtensilsCrossed size={15} /> Menu
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setActiveTab('staff')}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-sm transition-colors
                ${activeTab === 'staff' ? 'bg-brand-dark text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
            >
              <Users size={15} /> Staff
            </button>
          )}
        </div>

        <div className="max-w-lg mx-auto px-4 py-5 space-y-5">

          {/* ── REVIEWS TAB ─────────────────────────────────── */}
          {activeTab === 'reviews' && isAdmin && (
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
                            fill={review.rating >= s ? '#F38F1D' : 'none'}
                            stroke={review.rating >= s ? '#F38F1D' : '#D1D5DB'}
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

          {/* Date picker + Export */}
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
                className="px-3 py-2.5 bg-brand-brown text-white text-sm font-bold rounded-xl flex-shrink-0"
              >
                Today
              </button>
            )}
            {/* Export button — admin only */}
            {isAdmin && (
              <div className="relative flex-shrink-0" ref={exportRef}>
                <button
                  onClick={() => setExportOpen(o => !o)}
                  disabled={exporting}
                  className="flex items-center gap-1.5 px-3 py-2.5 bg-white border-2 border-gray-200 text-brand-dark font-bold text-sm rounded-xl active:bg-gray-50 disabled:opacity-50"
                  title="Export report"
                >
                  {exporting
                    ? <RefreshCw size={15} className="animate-spin" />
                    : <Download size={15} />
                  }
                  <span className="hidden sm:inline">Export</span>
                </button>

                {exportOpen && (
                  <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-xl border border-brand-muted z-50 overflow-hidden">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 px-4 pt-3 pb-1">Export as Excel</p>
                    <button
                      onClick={() => handleExport('day')}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-brand-dark hover:bg-brand-cream active:bg-brand-cream transition-colors"
                    >
                      <CalendarDays size={16} className="text-brand-orange flex-shrink-0" />
                      <div className="text-left">
                        <p className="font-bold">Daily Report</p>
                        <p className="text-xs text-gray-400">{new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      </div>
                    </button>
                    <div className="border-t border-gray-100" />
                    <button
                      onClick={() => handleExport('month')}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-brand-dark hover:bg-brand-cream active:bg-brand-cream transition-colors"
                    >
                      <Calendar size={16} className="text-brand-orange flex-shrink-0" />
                      <div className="text-left">
                        <p className="font-bold">Monthly Report</p>
                        <p className="text-xs text-gray-400">{new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GH', { month: 'long', year: 'numeric' })}</p>
                      </div>
                    </button>
                    <div className="border-t border-gray-100" />
                    <p className="text-[10px] text-gray-400 px-4 py-2 leading-relaxed">
                      Downloads an .xlsx file you can open in Excel or Google Sheets.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Branch filter — admin sees switcher; staff sees their locked branch label */}
          {currentUser?.branch_id ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Branch</span>
              <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-brand-orange text-white">
                {branches.find(b => b.id === currentUser.branch_id)?.name ?? 'Your Branch'}
              </span>
            </div>
          ) : branches.length > 1 && (
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
          {activeTab === 'menu' && isAdmin && (
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
                  onClick={() => setMenuForm({ name: '', description: '', price: '', image: '', is_available: true, is_popular: false, sort_order: 0, category_id: '', branch_id: menuBranch !== 'all' ? menuBranch : (branches[0]?.id ?? ''), wait_time_minutes: 30 })}
                  className="flex-shrink-0 flex items-center gap-1.5 bg-brand-brown text-white font-bold text-sm px-4 py-2 rounded-xl active:bg-brand-dark"
                >
                  <Plus size={15} /> Add Item
                </button>
              </div>

              {/* Category image manager */}
              {categories.length > 0 && (
                <CategoryImageManager categories={categories} onUpdate={fetchCategories} />
              )}

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

          {/* ── STAFF TAB ────────────────────────────────────── */}
          {activeTab === 'staff' && isAdmin && (
            <div className="space-y-4">

              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-xs text-gray-400 font-semibold">{staffList.length} staff member{staffList.length !== 1 ? 's' : ''}</p>
                  <button onClick={fetchStaff} className={`w-7 h-7 rounded-lg bg-brand-muted flex items-center justify-center ${staffLoading ? 'animate-spin' : ''}`}>
                    <RefreshCw size={13} className="text-brand-dark" />
                  </button>
                </div>
                <button
                  onClick={() => setStaffForm({ name: '', username: '', pin: '', role: 'staff', is_active: true, branch_id: '' })}
                  className="flex items-center gap-1.5 bg-brand-brown text-white font-bold text-sm px-4 py-2 rounded-xl active:bg-brand-dark"
                >
                  <Plus size={15} /> Add Staff
                </button>
              </div>

              {/* Error banner */}
              {staffError && (
                <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-600 font-semibold">
                  ⚠️ {staffError}
                  <p className="text-xs font-normal mt-1 text-red-400">Make sure the staff table SQL has been run in Supabase.</p>
                </div>
              )}

              {/* Staff list */}
              {staffLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="bg-white rounded-2xl h-16 animate-pulse" />
                  ))}
                </div>
              ) : staffList.length === 0 ? (
                <div className="text-center py-16">
                  <Users size={40} className="text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-400 font-semibold">No staff accounts yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {staffList.map(member => (
                    <div key={member.id} className="bg-white rounded-2xl p-4 border border-brand-muted shadow-sm">
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-extrabold text-sm
                          ${member.role === 'admin' ? 'bg-orange-100 text-brand-orange' : 'bg-blue-50 text-blue-600'}`}>
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-brand-dark text-sm">{member.name}</p>
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full
                              ${member.role === 'admin' ? 'bg-orange-100 text-brand-orange' : 'bg-blue-50 text-blue-600'}`}>
                              {member.role === 'admin' ? '🛡 Admin' : '👨‍🍳 Staff'}
                            </span>
                            {!member.is_active && (
                              <span className="text-[10px] font-bold bg-red-50 text-red-400 px-2 py-0.5 rounded-full">Disabled</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400">
                            @{member.username}
                            {member.branches?.name && (
                              <> · <span className="text-brand-orange">{member.branches.name.replace('UGs Kitchen — ', '')}</span></>
                            )}
                          </p>
                        </div>
                        {/* Inline actions */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleStaffToggle(member)}
                            title={member.is_active ? 'Disable account' : 'Enable account'}
                            className="w-8 h-8 rounded-lg bg-brand-muted flex items-center justify-center active:bg-gray-200"
                          >
                            {member.is_active
                              ? <ShieldCheck size={15} className="text-green-500" />
                              : <ShieldOff   size={15} className="text-gray-400" />
                            }
                          </button>
                          <button
                            onClick={() => setStaffForm({ ...member, pin: '', branch_id: member.branch_id ?? '' })}
                            title="Edit"
                            className="w-8 h-8 rounded-lg bg-brand-muted flex items-center justify-center active:bg-gray-200"
                          >
                            <Pencil size={14} className="text-gray-500" />
                          </button>
                          <button
                            onClick={() => handleStaffDelete(member.id)}
                            title="Delete"
                            className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center active:bg-red-100"
                          >
                            <Trash2 size={14} className="text-red-400" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
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

      {staffForm && (
        <StaffFormModal
          item={staffForm}
          branches={branches}
          onSave={handleStaffSave}
          onClose={() => setStaffForm(null)}
          saving={staffSaving}
        />
      )}
    </>
  )
}
