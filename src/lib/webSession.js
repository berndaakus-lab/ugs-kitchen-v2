// Server-only: signed httpOnly sessions for the website.
//   • ugs_staff — admin / staff / delivery logins (admin.jsx, delivery.jsx)
//   • ugs_cust  — a signed-in customer
// The browser never talks to the private tables directly any more: every read
// and write of orders, customers and staff goes through /api/* with these.
import crypto from 'crypto'
import { SignJWT, jwtVerify } from 'jose'
import { createClient } from '@supabase/supabase-js'

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
// user: { id (staff.id, null for the owner), name, role: 'admin'|'staff'|'delivery', branch_id }
export async function setStaffSession(res, user) {
  addCookie(res, cookie(STAFF_COOKIE, await sign({ ...user, kind: 'staff' }, STAFF_AGE), STAFF_AGE))
}
export const clearStaffSession = res => addCookie(res, cookie(STAFF_COOKIE, '', 0))
export const readStaff = req => read(req, STAFF_COOKIE, 'staff')

// Wrap an API route: only signed-in staff with one of `roles` (admin always passes).
export function withStaff(handler, { roles } = {}) {
  return async (req, res) => {
    const user = await readStaff(req)
    if (!user) return res.status(401).json({ message: 'Please sign in again.' })
    if (roles && user.role !== 'admin' && !roles.includes(user.role)) {
      return res.status(403).json({ message: 'You are not allowed to do that.' })
    }
    // A disabled staff account loses access at once, not when its cookie expires.
    if (user.id) {
      const { data } = await db.from('staff').select('is_active').eq('id', user.id).maybeSingle()
      if (!data?.is_active) {
        clearStaffSession(res)
        return res.status(401).json({ message: 'Account is disabled. Contact admin.' })
      }
    }
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
