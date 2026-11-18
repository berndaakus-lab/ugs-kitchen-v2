// Browser-side helpers for POS pages.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@supabase/supabase-js'
import { can } from './permissions'

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/pos/${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.message || `Request failed (${res.status})`)
    err.status = res.status
    err.code = data.code
    throw err
  }
  return data
}

export const ghs = n => `GH₵ ${Number(n || 0).toFixed(2)}`
export const time = d => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
export const dateTime = d => new Date(d).toLocaleString('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
export const METHOD_LABEL = {
  cash: 'Cash', momo_paystack: 'MoMo (prompt)', momo_manual: 'MoMo (ref)', card: 'Card',
  mobile_money: 'MoMo (online)', // payment_channel on online orders
}

// crypto.randomUUID is missing on older browsers (and on plain-http pages),
// so fall back to building a v4 UUID from getRandomValues.
export const uuid = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// Loads the session; redirects to /login when signed out. `perms` limits the
// page to people with any of those permissions (others go to their home screen).
export function useMe(perms) {
  const router = useRouter()
  const [me, setMe] = useState(null)

  const reload = useCallback(async () => {
    try {
      const data = await api('auth/me')
      if (perms && !can(data.user, ...perms)) {
        router.replace(homeFor(data.user))
        return
      }
      setMe(data)
    } catch (err) {
      if (err.status === 401) router.replace('/login')
    }
  }, [router, perms?.join()]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload() }, [reload])
  return [me, reload]
}

export { can }
export const roleLabel = user => (user?.roleNames || []).join(' + ')

// ── Menu ─────────────────────────────────────────────────────────
// The menu is grouped into sections (top bar); each section's pages show as a
// sub-menu (second bar) and as big buttons on the Start page. A section only
// shows when the person can open at least one of its pages.
const has = (u, s) => (u.scopes || []).includes(s)
const atBranch = u => u.scopeAll || has(u, 'branch')
const atStore = u => u.scopeAll || u.storeRole
// The warehouse / kitchen work screen is named after the person's place.
const storeLabel = u => (u.scopeAll ? 'Warehouse & kitchens' : has(u, 'kitchen') ? 'My kitchen' : has(u, 'warehouse') ? 'Warehouse' : 'Warehouse & kitchens')

export const SECTIONS = [
  { key: 'home', label: 'Home', pages: [
    { href: '/home', label: 'Start', desc: 'Everything you can do, in one place', ok: () => true },
    { href: '/shift', label: 'My shift', desc: 'Start or end your shift and see your report', ok: u => u.runsShift || can(u, 'sell', 'serve') },
  ] },
  { key: 'sales', label: 'Sales', pages: [
    { href: '/cashier', label: 'Sell', desc: 'Take orders and payments at the counter', ok: u => can(u, 'sell') },
    { href: '/server', label: 'Serve', desc: 'Hand out food against tickets', ok: u => can(u, 'serve') },
  ] },
  { key: 'stock', label: 'Stock', pages: [
    { href: '/stock', label: 'Branch stock', desc: 'Confirm food that arrived, see what is left, closing count',
      ok: u => atBranch(u) && can(u, 'stock_receive', 'stock_count', 'stock_adjust', 'stock_setup', 'activity') },
    { href: '/store', label: storeLabel, desc: 'Receive, cook, send on and count at the warehouse or a kitchen',
      ok: u => atStore(u) && can(u, 'stock_send', 'stock_receive', 'stock_count', 'production', 'purchases', 'activity') },
    { href: '/alerts', label: 'Low stock', desc: 'Everything running low, by place',
      ok: u => can(u, 'stock_send', 'stock_receive', 'stock_count', 'production', 'purchases', 'activity', 'reports') },
  ] },
  { key: 'items', label: 'Items & recipes', pages: [
    { href: '/manager/items', label: 'Stock items', desc: 'Add, change or remove ingredients and food you keep in stock',
      ok: u => can(u, 'stock_setup', 'purchases', 'recipes') },
    { href: '/manager/stock', label: 'Dish ingredients', desc: 'What one plate of each dish uses (sets "left" and sold out)',
      ok: u => can(u, 'stock_setup') },
    { href: '/manager/recipes', label: 'Recipes', desc: 'What a kitchen batch uses and makes', ok: u => can(u, 'recipes', 'production', 'food_cost') },
    { href: '/manager/suppliers', label: 'Suppliers', desc: 'Who the warehouse buys from', ok: u => can(u, 'purchases') },
  ] },
  { key: 'reports', label: 'Reports', pages: [
    { href: '/manager', label: 'Today', desc: "Today's sales and stock at a glance", ok: u => can(u, 'reports') },
    { href: '/manager/reports', label: 'Reports', desc: 'Sales, dishes, stock, cash and staff for any dates', ok: u => can(u, 'reports') },
    { href: '/manager/costs', label: 'Food cost', desc: 'What each plate costs against its price', ok: u => can(u, 'food_cost') },
    { href: '/manager/customers', label: 'Customers', desc: 'Walk-in customers and the promo list', ok: u => can(u, 'customers') },
  ] },
  { key: 'settings', label: 'Settings', pages: [
    { href: '/manager/staff', label: 'Staff', desc: 'People, their roles and PINs', ok: u => can(u, 'staff_assign') },
    { href: '/manager/roles', label: 'Roles', desc: 'What each role is allowed to do', ok: u => can(u, 'roles_manage') },
    { href: '/manager/locations', label: 'Places', desc: 'Branches, kitchens and the warehouse, and who supplies whom', ok: u => can(u, 'locations') },
  ] },
]

// The sections and pages this person can open (labels resolved).
export function sectionsFor(user) {
  if (!user) return []
  return SECTIONS.map(s => ({
    ...s,
    pages: s.pages.filter(p => p.ok(user)).map(p => ({ ...p, label: typeof p.label === 'function' ? p.label(user) : p.label })),
  })).filter(s => s.pages.length)
}

// Which section a page belongs to (pages outside the menu, e.g. /alerts or a
// print page, fall back to the closest parent path).
export function sectionOf(pathname) {
  let best = null, len = -1
  for (const s of SECTIONS) for (const p of s.pages) {
    if ((pathname === p.href || pathname.startsWith(`${p.href}/`)) && p.href.length > len) { best = s.key; len = p.href.length }
  }
  return best
}

// Flat list [href, label] of every page this person can open (menu order).
export const screensFor = user => sectionsFor(user).flatMap(s => s.pages.filter(p => p.href !== '/home').map(p => [p.href, p.label]))

// Where a person lands after login: My shift if their role runs on shift and
// it isn't open yet; straight to their page if they only have one kind of
// work (e.g. a cashier); otherwise the Start page.
export function homeFor(user, shift) {
  if (user?.runsShift && shift === null) return '/shift'
  // Counter staff go straight to their screen; managers start on Start.
  if (!can(user, 'reports') && can(user, 'sell')) return '/cashier'
  if (!can(user, 'reports') && can(user, 'serve')) return '/server'
  const work = sectionsFor(user).filter(s => s.key !== 'home')
  if (work.length === 1) return work[0].pages[0].href
  return '/home'
}

// Payment methods the shop uses (cash + MoMo prompt); others still show in
// reports if they ever have a value.
export const shownMethods = byMethod =>
  Object.entries(byMethod).filter(([m, v]) => ['cash', 'momo_paystack'].includes(m) || v > 0)

// Realtime broadcast from the POS API (see lib/broadcast.js), plus a polling
// fallback so screens stay correct if the socket drops.
let browserClient
function realtimeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  browserClient ||= createClient(url, key, { auth: { persistSession: false } })
  return browserClient
}

export function useBranchEvents(branchId, onEvent, pollMs = 5000) {
  const handler = useRef(onEvent)
  handler.current = onEvent

  useEffect(() => {
    if (!branchId) return
    const client = realtimeClient()
    const channel = client
      ?.channel(`pos-${branchId}`)
      .on('broadcast', { event: '*' }, msg => handler.current(msg.event, msg.payload))
      .subscribe()
    const timer = setInterval(() => handler.current('poll', {}), pollMs)
    return () => {
      clearInterval(timer)
      if (channel) client.removeChannel(channel)
    }
  }, [branchId, pollMs])
}
