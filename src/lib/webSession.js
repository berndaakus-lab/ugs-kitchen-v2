// Server-only: signed httpOnly sessions for the website.
//   • ugs_staff — admin / staff / delivery logins (admin.jsx, delivery.jsx)
//   • ugs_cust  — a signed-in customer
// The browser never talks to the private tables directly any more: every read
// and write of orders, customers and staff goes through /api/* with these.
import crypto from 'crypto'
import { SignJWT, jwtVerify } from 'jose'
import { createClient } from '@supabase/supabase-js'
import { ALL_PERMISSIONS, resolveAccess, can } from './permissions'

export const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const STAFF_COOKIE = 'ugs_staff'
const CUST_COOKIE  = 'ugs_cust'
const STAFF_AGE    = 14 * 60 * 60          // one long day
const CUST_AGE     = 60 * 24 * 60 * 60     // 60 days

// WEB_SESSION_SECRET if set; otherwise derived from the service-role key, so
// nothing new has to be configured for this to work.
function secretBytes() {
  const s = process.env.WEB_SESSION_SECRET
    || crypto.createHash('sha256').update('ugs-web-session:' + (process.env.SUPABASE_SERVICE_ROLE_KEY || '')).digest('hex')
  if (!process.env.WEB_SESSION_SECRET && !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set.')
  return new TextEncoder().encode(s)
}

function cookie(name, value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}

function addCookie(res, c) {
  const prev = res.getHeader('Set-Cookie')
  res.setHeader('Set-Cookie', [...(Array.isArray(prev) ? prev : prev ? [prev] : []), c])
}

async function sign(payload, maxAge) {
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${maxAge}s`).sign(secretBytes())
}

async function read(req, name, kind) {
  const token = req.cookies?.[name]
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secretBytes())
    return payload.kind === kind ? payload : null
  } catch {
    return null
  }
}

// ── Staff ──────────────────────────────────────────────────────
// Session: { sid (pos_staff.id) } for staff, or { owner: true } for the owner's
// break-glass login (ADMIN_PIN). What they may do is loaded from their roles
// (pos_role_defs, shared with the POS) on every request.
export async function setStaffSession(res, session) {
  addCookie(res, cookie(STAFF_COOKIE, await sign({ ...session, kind: 'staff' }, STAFF_AGE), STAFF_AGE))
}
export const clearStaffSession = res => addCookie(res, cookie(STAFF_COOKIE, '', 0))
export const readStaff = req => read(req, STAFF_COOKIE, 'staff')

const OWNER = { id: null, name: 'Admin', isAdmin: true, perms: ALL_PERMISSIONS, scopeAll: true, branch_id: null, roleNames: ['Admin'], active: true }

// The person behind a staff session, with what they may do right now.
export async function staffUser(session) {
  if (!session) return null
  if (session.owner) return { ...OWNER }
  if (!session.sid) return null
  const { data: ps } = await db.from('pos_staff')
    .select('id, staff_id, pos_role, pos_roles, branch_id, is_active, staff:staff_id(name, is_active)')
    .eq('id', session.sid).maybeSingle()
  if (!ps || !ps.is_active || !ps.staff?.is_active) return null
  const keys = ps.pos_roles?.length ? ps.pos_roles : [ps.pos_role]
  const { data: defs } = await db.from('pos_role_defs').select('*').in('key', keys)
  const access = resolveAccess(defs || [])
  return {
    id: ps.staff_id, sid: ps.id, name: ps.staff.name, ...access,
    // all-branch people pick a branch on the page; everyone else is held to theirs
    branch_id: access.scopeAll ? null : ps.branch_id,
    active: true,
  }
}

export { can }

// Wrap an API route: signed-in staff with any of the given permissions (Admin always passes).
export function withStaff(handler, { perms } = {}) {
  return async (req, res) => {
    const user = await staffUser(await readStaff(req))
    if (!user) {
      clearStaffSession(res)
      return res.status(401).json({ message: 'Please sign in again.' })
    }
    if (perms && !can(user, ...perms)) return res.status(403).json({ message: 'You are not allowed to do that.' })
    req.user = user
    try {
      return await handler(req, res)
    } catch (err) {
      console.error('[staff api]', err?.message || err)
      return res.status(500).json({ message: 'Something went wrong. Please try again.' })
    }
  }
}

// ── Customers ──────────────────────────────────────────────────
export async function setCustomerSession(res, customer) {
  addCookie(res, cookie(CUST_COOKIE, await sign({ id: customer.id, kind: 'customer' }, CUST_AGE), CUST_AGE))
}
export const clearCustomerSession = res => addCookie(res, cookie(CUST_COOKIE, '', 0))
export const readCustomer = req => read(req, CUST_COOKIE, 'customer')

// What the browser may know about a customer (never the password).
export const CUSTOMER_FIELDS = 'id, name, phone, username, contact_phone, avatar_url'
export const publicCustomer = c => c && ({
  id: c.id, name: c.name, phone: c.phone, username: c.username ?? null,
  contact_phone: c.contact_phone ?? null, avatar_url: c.avatar_url ?? null,
})

// ── Orders ─────────────────────────────────────────────────────
// A token handed to whoever placed an order, so they (and only they) can pay
// for it and see it before they are signed in.
export function orderToken(orderId) {
  return crypto.createHmac('sha256', secretBytes()).update('order:' + orderId).digest('base64url').slice(0, 32)
}
export function checkOrderToken(orderId, token) {
  if (!orderId || typeof token !== 'string') return false
  const want = Buffer.from(orderToken(orderId))
  const got  = Buffer.from(token)
  return want.length === got.length && crypto.timingSafeEqual(want, got)
}

export const cleanPhone = p => String(p || '').replace(/\s/g, '')
export const validPhone = p => /^0[2-5][0-9]{8}$/.test(cleanPhone(p))
