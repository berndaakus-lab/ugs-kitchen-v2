import Head from 'next/head'
import Link from 'next/link'
import { useState, useEffect, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAdminPush } from '../hooks/usePush'
import {
  ShoppingBag, Clock, XCircle,
  TrendingUp, RefreshCw, LogOut, Eye,
  Star, CheckCircle2, Trash2, MessageSquare,
  UtensilsCrossed, Plus, Pencil, ChevronLeft, ChevronRight, X, ToggleLeft, ToggleRight,
  Users, ShieldCheck, ShieldOff, Download, FileSpreadsheet, CalendarDays, Calendar, Tag
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
    'Delivered By':  o.delivered_by ?? '',
    'Delivered At':  o.delivered_at ? new Date(o.delivered_at).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' }) : '',
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

// ── Category Manager (image + name + description) ─────────────
function CategoryImageManager({ categories, onUpdate }) {
  const [open,      setOpen]      = useState(false)
  const [uploading, setUploading] = useState({}) // { [id]: bool }
  const [previews,  setPreviews]  = useState({}) // { [id]: localObjectURL }
  const [imgErrors, setImgErrors] = useState({}) // { [id]: string }
  const [editing,   setEditing]   = useState(null) // cat being text-edited
  const [saving,    setSaving]    = useState(false)

  async function handleFileChange(cat, e) {
    const file = e.target.files?.[0]
    if (!file) return
    const localUrl = URL.createObjectURL(file)
    setPreviews(p => ({ ...p, [cat.id]: localUrl }))
    setImgErrors(p => ({ ...p, [cat.id]: '' }))
    setUploading(p => ({ ...p, [cat.id]: true }))
    try {
      const form = new FormData()
      form.append('categoryId', cat.id)
      form.append('file', file)
      const res = await fetch('/api/admin/upload-category-image', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Upload failed.')
      onUpdate()
    } catch (err) {
      setImgErrors(p => ({ ...p, [cat.id]: err.message }))
      setPreviews(p => { const n = { ...p }; delete n[cat.id]; return n })
    } finally {
      setUploading(p => ({ ...p, [cat.id]: false }))
      e.target.value = ''
    }
  }

  async function saveTextEdits() {
    if (!editing) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/update-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId:  editing.id,
          name:        editing.name,
          description: editing.description,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).message)
      onUpdate()
      setEditing(null)
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-brand-muted overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-brand-dark"
      >
        <span>🗂️ Manage Categories</span>
        <span className="text-gray-400 text-xs font-normal">{open ? 'hide' : 'manage'}</span>
      </button>

      {open && (
        <div className="border-t border-brand-muted divide-y divide-brand-muted">
          {categories.map(cat => {
            const preview = previews[cat.id]
            const imgSrc  = preview || cat.image
            const busy    = uploading[cat.id]
            const isEditing = editing?.id === cat.id

            return (
              <div key={cat.id} className="px-4 py-3 space-y-2">
                <div className="flex items-center gap-3">
                  {/* Image thumbnail + upload */}
                  <div className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-brand-cream">
                    {imgSrc ? (
                      <img src={imgSrc} alt={cat.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xl">🍽️</div>
                    )}
                    {busy && (
                      <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                        <span className="text-brand-orange text-xs font-bold animate-pulse">…</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-brand-dark truncate">{cat.name}</p>
                    {cat.description && !isEditing && (
                      <p className="text-[11px] text-gray-400 truncate mt-0.5">{cat.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <label className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-lg cursor-pointer transition-colors ${busy ? 'opacity-50 pointer-events-none' : 'bg-brand-muted text-brand-brown hover:bg-brand-brown hover:text-white'}`}>
                        {busy ? 'Uploading…' : imgSrc ? '📷 Change photo' : '📷 Upload photo'}
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={e => handleFileChange(cat, e)} />
                      </label>
                      {!isEditing && (
                        <button
                          onClick={() => setEditing({ id: cat.id, name: cat.name ?? '', description: cat.description ?? '' })}
                          className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-brand-muted text-brand-brown hover:bg-brand-brown hover:text-white transition-colors"
                        >
                          ✏️ Edit text
                        </button>
                      )}
                    </div>
                    {imgErrors[cat.id] && (
                      <p className="text-red-500 text-[11px] mt-1">{imgErrors[cat.id]}</p>
                    )}
                  </div>
                </div>

                {/* Inline text editor */}
                {isEditing && (
                  <div className="bg-brand-cream rounded-xl p-3 space-y-2">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Category Name</label>
                      <input
                        value={editing.name}
                        onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:border-brand-orange bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Description <span className="normal-case font-normal">(shown to customers)</span></label>
                      <textarea
                        value={editing.description}
                        onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
                        rows={2}
                        placeholder="e.g. Choice of fried rice, jollof or spaghetti with chicken"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-orange bg-white resize-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={saveTextEdits}
                        disabled={saving || !editing.name.trim()}
                        className="flex-1 text-xs font-bold bg-brand-brown text-white rounded-lg py-2 disabled:opacity-50"
                      >
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="px-4 text-xs font-bold text-gray-500 bg-white border border-gray-200 rounded-lg py-2"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          <div className="px-4 py-2.5 bg-brand-cream">
            <p className="text-[11px] text-gray-500 font-semibold">Photos: 800 × 600 px · JPG or WebP · under 300 KB</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Order Detail Modal ────────────────────────────────────────
function OrderModal({ order, onClose, onStatusChange, onAddTime }) {
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
          {(() => {
            const parts = (order.delivery_location ?? '').split('\n')
            const zone  = parts[0]
            const link  = parts[1]
            return (
              <div className="flex items-start justify-between gap-2">
                <span className="text-gray-500 flex-shrink-0">Location</span>
                <div className="text-right">
                  <span className="font-semibold text-brand-dark">{zone}</span>
                  {link && (
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-end gap-1 mt-1 text-xs font-bold text-blue-600 underline"
                    >
                      📍 Open in Google Maps
                    </a>
                  )}
                </div>
              </div>
            )
          })()}
          <Row label="MoMo"     value={order.momo_number} />
          <Row label="Time"     value={`${formatDate(order.created_at)} · ${formatTime(order.created_at)}`} />
          <Row label="Total"    value={formatGHS(order.total_amount)} bold />
          {order.delivered_by && (
            <Row label="Delivered by" value={`${order.delivered_by}${order.delivered_at ? ' · ' + formatTime(order.delivered_at) : ''}`} />
          )}
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

        {/* Bump wait time — only useful while order is still being prepared */}
        {['paid', 'preparing'].includes(order.status) && onAddTime && (
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
              Extend Wait Time <span className="text-gray-300 font-normal normal-case">(currently {order.wait_time_minutes ?? 30} min)</span>
            </p>
            <div className="flex gap-2">
              {[5, 10, 15].map(mins => (
                <button
                  key={mins}
                  onClick={() => onAddTime(order.id, mins)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold border-2 border-brand-orange text-brand-orange active:bg-orange-50 transition-colors"
                >
                  +{mins} min
                </button>
              ))}
            </div>
          </div>
        )}

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
            <div className="flex gap-2">
              {[
                { value: 'staff',    label: '👨‍🍳 Kitchen',  color: 'border-blue-400 bg-blue-50 text-blue-600' },
                { value: 'delivery', label: '🛵 Delivery',   color: 'border-green-500 bg-green-50 text-green-700' },
                { value: 'admin',    label: '🛡 Admin',      color: 'border-brand-orange bg-orange-50 text-brand-orange' },
              ].map(({ value, label, color }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set('role', value)}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-xs border-2 transition-colors
                    ${form.role === value ? color : 'border-gray-200 bg-white text-gray-500'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {form.role === 'admin' && (
              <p className="text-[11px] text-brand-orange font-semibold mt-2">
                ⚠️ Admin can access all tabs including Menu, Reviews, and Staff management.
              </p>
            )}
            {form.role === 'delivery' && (
              <p className="text-[11px] text-green-700 font-semibold mt-2">
                🛵 Delivery accounts log in at /delivery — they only see active delivery orders.
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
  // Subscribe for push after login — works for both admin and staff roles
  useAdminPush(!!currentUser)
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
  const [menuSearch,  setMenuSearch]  = useState('')
  const [categories,  setCategories]  = useState([])
  const [menuForm,    setMenuForm]    = useState(null)   // null=closed, {}=add, item=edit
  const [formSaving,  setFormSaving]  = useState(false)

  // Staff tab state (admin only)
  const [staffList,    setStaffList]    = useState([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [staffForm,    setStaffForm]    = useState(null)  // null=closed, {}=add, item=edit
  const [staffSaving,  setStaffSaving]  = useState(false)
  const [staffError,   setStaffError]   = useState('')

  // Promos tab state (admin only)
  const [promos,       setPromos]       = useState([])
  const [promosLoading,setPromosLoading]= useState(false)
  const [promoForm,    setPromoForm]    = useState(null)  // null=closed, {}=add, item=edit
  const [promoSaving,      setPromoSaving]      = useState(false)
  const [promoError,       setPromoError]       = useState('')
  const [promoImgUploading,setPromoImgUploading]= useState(false)

  const isAdmin = currentUser?.role === 'admin'

  // Export state
  const [exportOpen,    setExportOpen]    = useState(false)
  const [exporting,     setExporting]     = useState(false)
  const [exportFrom,    setExportFrom]    = useState('')
  const [exportTo,      setExportTo]      = useState('')
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

    async function fetchRange(start, end) {
      let query = supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
      if (start) query = query.gte('created_at', start)
      if (end)   query = query.lte('created_at', end)
      const staffBranch = currentUser?.branch_id
      if (staffBranch) query = query.eq('branch_id', staffBranch)
      else if (branchFilter !== 'all') query = query.eq('branch_id', branchFilter)
      const { data } = await query
      return data ?? []
    }

    if (type === 'day') {
      const rows = ordersToRows(orders, branchLabel)
      if (!rows.length) { alert('No orders for this day.'); setExporting(false); return }
      downloadExcel(rows, `UGs_Orders_${selectedDate}.xlsx`)

    } else if (type === 'month') {
      const [y, m] = selectedDate.split('-')
      const lastDay = new Date(y, m, 0).getDate()
      const data = await fetchRange(`${y}-${m}-01T00:00:00Z`, `${y}-${m}-${String(lastDay).padStart(2,'0')}T23:59:59Z`)
      const rows = ordersToRows(data, branchLabel)
      if (!rows.length) { alert('No orders for this month.'); setExporting(false); return }
      downloadExcel(rows, `UGs_Orders_${y}-${m}.xlsx`)

    } else if (type === 'range') {
      if (!exportFrom || !exportTo) { alert('Please select both a start and end date.'); setExporting(false); return }
      if (exportFrom > exportTo)    { alert('Start date must be before end date.');      setExporting(false); return }
      const data = await fetchRange(`${exportFrom}T00:00:00Z`, `${exportTo}T23:59:59Z`)
      const rows = ordersToRows(data, branchLabel)
      if (!rows.length) { alert('No orders in this date range.'); setExporting(false); return }
      downloadExcel(rows, `UGs_Orders_${exportFrom}_to_${exportTo}.xlsx`)

    } else if (type === 'all') {
      const data = await fetchRange(null, null)
      const rows = ordersToRows(data, branchLabel)
      if (!rows.length) { alert('No orders found.'); setExporting(false); return }
      downloadExcel(rows, `UGs_Orders_ALL.xlsx`)
    }

    setExporting(false)
  }

  // Load branches once on login
  useEffect(() => {
    if (!currentUser) return
    supabase.from('branches').select('id, name, slug').eq('is_active', true).order('sort_order')
      .then(({ data }) => setBranches(data ?? []))
  }, [currentUser])

  // Staff and delivery can only see today (GMT). Admin sees the selected date.
  const isStaffOrDelivery = currentUser?.role === 'staff' || currentUser?.role === 'delivery'
  const todayGMT = new Date().toISOString().split('T')[0]
  const activeDate = isStaffOrDelivery ? todayGMT : selectedDate

  const fetchOrders = useCallback(async () => {
    setRefreshing(true)
    const date  = (currentUser?.role === 'staff' || currentUser?.role === 'delivery')
      ? new Date().toISOString().split('T')[0]
      : selectedDate
    const start = `${date}T00:00:00Z`
    const end   = `${date}T23:59:59Z`

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
    if (menuSearch.trim()) query = query.ilike('name', `%${menuSearch.trim()}%`)
    const { data, count } = await query
    setMenuItems(data ?? [])
    setMenuTotal(count ?? 0)
    setMenuLoading(false)
  }, [menuPage, menuBranch, menuSearch])

  const fetchCategories = useCallback(async () => {
    let query = supabase.from('categories').select('id, name, description, branch_id, image, sort_order').order('sort_order')
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

  const fetchPromos = useCallback(async () => {
    setPromosLoading(true)
    const { data } = await supabase.from('promos').select('*').order('created_at', { ascending: false })
    setPromos(data ?? [])
    setPromosLoading(false)
  }, [])

  useEffect(() => {
    if (currentUser && activeTab === 'promos' && isAdmin) fetchPromos()
  }, [currentUser, activeTab, isAdmin, fetchPromos])

  async function handlePromoToggle(id, current) {
    await supabase.from('promos').update({ active: !current }).eq('id', id)
    fetchPromos()
  }

  async function handlePromoDelete(id) {
    if (!confirm('Delete this promo permanently?')) return
    await supabase.from('promos').delete().eq('id', id)
    fetchPromos()
  }

  async function handlePromoSave() {
    setPromoError('')
    if (!promoForm?.title?.trim()) { setPromoError('Title is required.'); return }
    setPromoSaving(true)
    const payload = {
      title:    promoForm.title.trim(),
      subtitle: promoForm.subtitle?.trim() || null,
      code:     promoForm.code?.trim().toUpperCase() || null,
      active:   promoForm.active ?? true,
      ends_at:  promoForm.ends_at || null,
    }
    const { error } = promoForm.id
      ? await supabase.from('promos').update(payload).eq('id', promoForm.id)
      : await supabase.from('promos').insert(payload)
    setPromoSaving(false)
    if (error) { setPromoError(error.message); return }
    setPromoForm(null)
    fetchPromos()
  }

  async function handlePromoImageUpload(e, promoId) {
    const file = e.target.files?.[0]
    if (!file || !promoId) return
    setPromoImgUploading(true)
    const form = new FormData()
    form.append('promoId', promoId)
    form.append('file', file)
    const res = await fetch('/api/admin/upload-promo-image', { method: 'POST', body: form })
    const data = await res.json()
    setPromoImgUploading(false)
    if (res.ok) { setPromoForm(p => ({ ...p, image: data.imageUrl })); fetchPromos() }
    else setPromoError(data.message || 'Image upload failed.')
    e.target.value = ''
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

  async function handleAddTime(orderId, extraMinutes) {
    const current = selectedOrder?.wait_time_minutes ?? 30
    const newMins = current + extraMinutes
    const res = await fetch('/api/admin/update-order', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ orderId, wait_time_minutes: newMins }),
    })
    if (!res.ok) return
    setSelectedOrder(prev => prev ? { ...prev, wait_time_minutes: newMins } : null)
    fetchOrders()
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

    // SMS + push are sent server-side in update-order.js — nothing extra needed here
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
          {isAdmin && (
            <button
              onClick={() => setActiveTab('promos')}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-sm transition-colors
                ${activeTab === 'promos' ? 'bg-brand-dark text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
            >
              <Tag size={15} className="text-yellow-400" /> Promos
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
            {/* Staff and delivery are locked to today — hide the date picker */}
            {isStaffOrDelivery ? (
              <div className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-2.5 bg-gray-50 text-sm font-semibold text-gray-500 text-center">
                📅 Today only
              </div>
            ) : (
              <>
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
              </>
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
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl border border-brand-muted z-50 overflow-hidden">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 px-4 pt-3 pb-1">Export as Excel</p>

                    <button
                      onClick={() => handleExport('day')}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-brand-dark hover:bg-brand-cream active:bg-brand-cream transition-colors"
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
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-brand-dark hover:bg-brand-cream active:bg-brand-cream transition-colors"
                    >
                      <Calendar size={16} className="text-brand-orange flex-shrink-0" />
                      <div className="text-left">
                        <p className="font-bold">Monthly Report</p>
                        <p className="text-xs text-gray-400">{new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GH', { month: 'long', year: 'numeric' })}</p>
                      </div>
                    </button>

                    <div className="border-t border-gray-100" />
                    {/* Custom date range */}
                    <div className="px-4 py-3 space-y-2">
                      <p className="text-xs font-bold text-brand-dark flex items-center gap-1.5">
                        <FileSpreadsheet size={14} className="text-brand-orange" /> Custom Date Range
                      </p>
                      <div className="flex gap-2 items-center">
                        <input
                          type="date"
                          value={exportFrom}
                          onChange={e => setExportFrom(e.target.value)}
                          className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-semibold outline-none focus:border-brand-orange"
                        />
                        <span className="text-xs text-gray-400 flex-shrink-0">to</span>
                        <input
                          type="date"
                          value={exportTo}
                          onChange={e => setExportTo(e.target.value)}
                          className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-semibold outline-none focus:border-brand-orange"
                        />
                      </div>
                      <button
                        onClick={() => handleExport('range')}
                        className="w-full bg-brand-orange text-white text-xs font-extrabold rounded-lg py-2 active:bg-brand-brown transition-colors"
                      >
                        Download Range
                      </button>
                    </div>

                    <div className="border-t border-gray-100" />
                    <button
                      onClick={() => handleExport('all')}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-brand-dark hover:bg-brand-cream active:bg-brand-cream transition-colors"
                    >
                      <Download size={16} className="text-brand-orange flex-shrink-0" />
                      <div className="text-left">
                        <p className="font-bold">All Orders</p>
                        <p className="text-xs text-gray-400">Every order ever — no date filter</p>
                      </div>
                    </button>

                    <div className="border-t border-gray-100" />
                    <p className="text-[10px] text-gray-400 px-4 py-2 leading-relaxed">
                      Downloads an .xlsx file for Excel or Google Sheets.
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

              {/* Search */}
              <div className="relative">
                <input
                  type="search"
                  value={menuSearch}
                  onChange={e => { setMenuSearch(e.target.value); setMenuPage(0) }}
                  placeholder="Search menu items…"
                  className="w-full border-2 border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm font-semibold outline-none focus:border-brand-orange transition-colors"
                />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                {menuSearch && (
                  <button
                    onClick={() => { setMenuSearch(''); setMenuPage(0) }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
                  >×</button>
                )}
              </div>

              {/* Category image manager */}
              {categories.length > 0 && (
                <CategoryImageManager categories={categories} onUpdate={fetchCategories} />
              )}

              {/* Count + pagination info */}
              {menuTotal > 0 && (
                <p className="text-xs text-gray-400 font-semibold">
                  {menuSearch.trim()
                    ? `${menuTotal} result${menuTotal !== 1 ? 's' : ''} for "${menuSearch.trim()}"`
                    : `Showing ${menuPage * MENU_PAGE_SIZE + 1}–${Math.min((menuPage + 1) * MENU_PAGE_SIZE, menuTotal)} of ${menuTotal} items`}
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
                          ${member.role === 'admin' ? 'bg-orange-100 text-brand-orange' : member.role === 'delivery' ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-600'}`}>
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-brand-dark text-sm">{member.name}</p>
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full
                              ${member.role === 'admin' ? 'bg-orange-100 text-brand-orange' : member.role === 'delivery' ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-600'}`}>
                              {member.role === 'admin' ? '🛡 Admin' : member.role === 'delivery' ? '🛵 Delivery' : '👨‍🍳 Staff'}
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

          {/* ── PROMOS TAB ───────────────────────────────────── */}
          {activeTab === 'promos' && isAdmin && (
            <div className="space-y-4">

              {/* Add / Edit promo form */}
              {promoForm ? (
                <div className="bg-white rounded-2xl p-5 border border-brand-muted shadow-sm space-y-4">
                  <h3 className="font-extrabold text-brand-dark">{promoForm.id ? 'Edit Promo' : 'New Promo'}</h3>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Title *</label>
                    <input
                      value={promoForm.title ?? ''}
                      onChange={e => setPromoForm(p => ({ ...p, title: e.target.value }))}
                      placeholder="e.g. 🎉 Launch Special!"
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-brand-orange transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Subtitle <span className="normal-case font-normal text-gray-400">(optional)</span></label>
                    <input
                      value={promoForm.subtitle ?? ''}
                      onChange={e => setPromoForm(p => ({ ...p, subtitle: e.target.value }))}
                      placeholder="e.g. Order online and get free delivery this week!"
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-brand-orange transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Promo Code <span className="normal-case font-normal text-gray-400">(optional, shown to customer)</span></label>
                    <input
                      value={promoForm.code ?? ''}
                      onChange={e => setPromoForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                      placeholder="e.g. LAUNCH10"
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold tracking-widest outline-none focus:border-brand-orange transition-colors uppercase"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">End Date & Time <span className="normal-case font-normal text-gray-400">(optional — auto-hides when reached)</span></label>
                    <input
                      type="datetime-local"
                      value={promoForm.ends_at ? promoForm.ends_at.slice(0, 16) : ''}
                      onChange={e => setPromoForm(p => ({ ...p, ends_at: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-brand-orange transition-colors"
                    />
                    {promoForm.ends_at && new Date(promoForm.ends_at) < new Date() && (
                      <p className="text-red-400 text-xs font-semibold mt-1 pl-1">⚠️ This date is in the past — promo will be hidden.</p>
                    )}
                  </div>

                  {/* Image upload — only available after promo is saved (has an id) */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                      Promo Image <span className="normal-case font-normal text-gray-400">(optional)</span>
                    </label>
                    {promoForm.id ? (
                      <label className="cursor-pointer block">
                        {promoForm.image ? (
                          <div className="relative rounded-2xl overflow-hidden h-36 bg-gray-100">
                            <img src={promoForm.image} alt="Promo" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                              <span className="text-white text-xs font-bold">Tap to change</span>
                            </div>
                          </div>
                        ) : (
                          <div className="h-36 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-2 bg-gray-50 active:bg-gray-100">
                            {promoImgUploading ? (
                              <p className="text-xs text-gray-400 font-semibold animate-pulse">Uploading…</p>
                            ) : (
                              <>
                                <span className="text-2xl">🖼️</span>
                                <p className="text-xs text-gray-400 font-semibold">Tap to upload image</p>
                                <p className="text-[10px] text-gray-300">JPG, PNG or WebP · max 5 MB</p>
                              </>
                            )}
                          </div>
                        )}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={e => handlePromoImageUpload(e, promoForm.id)}
                        />
                      </label>
                    ) : (
                      <p className="text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3 font-semibold">
                        💡 Save the promo first, then you can add an image.
                      </p>
                    )}
                  </div>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <div
                      onClick={() => setPromoForm(p => ({ ...p, active: !p.active }))}
                      className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${promoForm.active !== false ? 'bg-green-500' : 'bg-gray-300'}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${promoForm.active !== false ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                    <span className="text-sm font-semibold text-brand-dark">Show on homepage immediately</span>
                  </label>

                  {promoError && <p className="text-red-500 text-sm font-semibold bg-red-50 rounded-xl px-4 py-2">{promoError}</p>}

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handlePromoSave}
                      disabled={promoSaving}
                      className="flex-1 bg-brand-brown text-white font-extrabold rounded-xl py-3 text-sm disabled:opacity-60"
                    >
                      {promoSaving ? 'Saving…' : promoForm.id ? 'Save Changes' : 'Create Promo'}
                    </button>
                    <button
                      onClick={() => { setPromoForm(null); setPromoError('') }}
                      className="px-4 bg-brand-muted rounded-xl font-bold text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setPromoForm({ title: '', subtitle: '', code: '', active: true })}
                  className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-brand-orange/40 rounded-2xl py-4 text-brand-orange font-bold text-sm active:bg-brand-orange/5"
                >
                  <Plus size={16} /> Create New Promo
                </button>
              )}

              {/* Promo list */}
              {promosLoading ? (
                <div className="space-y-3">
                  {[...Array(2)].map((_, i) => <div key={i} className="bg-white rounded-2xl h-24 animate-pulse" />)}
                </div>
              ) : promos.length === 0 ? (
                <div className="text-center py-16">
                  <Tag size={40} className="text-yellow-200 mx-auto mb-3" />
                  <p className="text-gray-400 font-semibold">No promos yet</p>
                  <p className="text-gray-400 text-xs mt-1">Create one to show a banner to customers</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {promos.map(promo => (
                    <div key={promo.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${promo.active ? 'border-green-200' : 'border-brand-muted'}`}>
                      {promo.image && (
                        <img src={promo.image} alt={promo.title} className="w-full h-32 object-cover" />
                      )}
                      <div className="p-4 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-extrabold text-brand-dark text-sm">{promo.title}</p>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${promo.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {promo.active ? '🟢 Live' : '⏸ Hidden'}
                            </span>
                          </div>
                          {promo.subtitle && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{promo.subtitle}</p>}
                          {promo.code && (
                            <span className="inline-block mt-1.5 bg-brand-orange/10 text-brand-orange text-xs font-extrabold tracking-widest px-2 py-0.5 rounded-lg">
                              {promo.code}
                            </span>
                          )}
                          {promo.ends_at && (
                            <p className={`text-[11px] mt-1 font-semibold ${new Date(promo.ends_at) < new Date() ? 'text-red-400' : 'text-gray-400'}`}>
                              {new Date(promo.ends_at) < new Date() ? '⏰ Expired' : '⏰ Ends'} {new Date(promo.ends_at).toLocaleString('en-GH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => handlePromoToggle(promo.id, promo.active)}
                            title={promo.active ? 'Hide' : 'Show'}
                            className="w-8 h-8 rounded-lg bg-brand-muted flex items-center justify-center"
                          >
                            {promo.active ? <ToggleRight size={16} className="text-green-600" /> : <ToggleLeft size={16} className="text-gray-400" />}
                          </button>
                          <button
                            onClick={() => setPromoForm(promo)}
                            title="Edit"
                            className="w-8 h-8 rounded-lg bg-brand-muted flex items-center justify-center"
                          >
                            <Pencil size={14} className="text-gray-500" />
                          </button>
                          <button
                            onClick={() => handlePromoDelete(promo.id)}
                            title="Delete"
                            className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center"
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
        onAddTime={handleAddTime}
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
