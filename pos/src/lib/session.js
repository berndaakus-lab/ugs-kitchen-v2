// Signed httpOnly session cookie for POS staff (server-only).
import { SignJWT, jwtVerify } from 'jose'
import { loadAccess } from './access'
import { openShiftFor } from './supabaseAdmin'
import { can } from './permissions'

export { can }

const COOKIE  = 'pos_session'
const MAX_AGE = 14 * 60 * 60 // one long shift

function secret() {
  const s = process.env.POS_SESSION_SECRET
  if (!s || s.length < 32) throw new Error('POS_SESSION_SECRET must be set (32+ chars).')
  return new TextEncoder().encode(s)
}

function cookie(value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`
}

// user: { sid (pos_staff.id), staff_id, name, role, branch_id }
export async function createSession(res, user) {
  const token = await new SignJWT(user)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret())
  res.setHeader('Set-Cookie', cookie(token, MAX_AGE))
}

export function clearSession(res) {
  res.setHeader('Set-Cookie', cookie('', 0))
}

export async function readSession(req) {
  const token = req.cookies?.[COOKIE]
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret())
    return payload
  } catch {
    return null
  }
}

// What each person may do comes from their roles (lib/access.js), loaded on
// every request: req.user gets perms, isAdmin, scopeAll, kitchen, runsShift …
//
//   withAuth(handler, { perms: ['sell'] })         any of these permissions
//   withAuth(handler, { perms: ['sell'], shift: true })
//       … and, if the person runs on shift, a write needs their shift open
//   withAuth(handler, { all: true })               all-branch people only
export function withAuth(handler, { perms, shift, all } = {}) {
  return async (req, res) => {
    const session = await readSession(req)
    if (!session) return res.status(401).json({ message: 'Please log in.' })
    const access = await loadAccess(session.sid)
    if (!access?.active) {
      clearSession(res)
      return res.status(401).json({ message: 'Your login is disabled. Ask a manager.' })
    }
    const user = { ...session, ...access }
    if (perms && !can(user, ...perms)) return res.status(403).json({ message: 'Not allowed for your role.' })
    if (all && !user.scopeAll) return res.status(403).json({ message: 'Not allowed for your role.' })
    if (shift && user.runsShift && req.method !== 'GET' && !(await openShiftFor(user.sid))) {
      return res.status(409).json({ message: 'Start your shift first (My shift).', code: 'NO_SHIFT' })
    }
    req.user = user
    try {
      return await handler(req, res)
    } catch (err) {
      return sendDbError(res, err)
    }
  }
}

// Map known exceptions raised by the pos_* SQL functions to friendly messages.
const DB_MESSAGES = {
  NO_OPEN_SHIFT:      [409, 'Open a shift before selling.'],
  UNKNOWN_ROLE:       [400, 'That role no longer exists. Refresh the page.'],
  BRANCH_REQUIRED:    [400, 'Choose a branch: one of these roles works at one branch.'],
  ITEM_UNAVAILABLE:   [409, 'One or more items are no longer available. Refresh the menu.'],
  PAYMENT_MISMATCH:   [400, 'Payment does not match the total.'],
  SALE_NOT_FOUND:     [404, 'Ticket not found.'],
  ALREADY_SERVED:     [409, 'This ticket has already been fully served.'],
  SALE_VOIDED:        [409, 'This ticket was voided. Do not serve.'],
  NOT_PAID:           [409, 'This ticket is not paid.'],
  NOTHING_TO_SERVE:   [400, 'Select at least one item to serve.'],
  OVER_SERVE:         [409, 'Cannot serve more than was paid for.'],
  CANNOT_VOID_SERVED: [409, 'Food has already been served on this ticket — it cannot be voided.'],
  CANNOT_VOID:        [409, 'This sale cannot be voided.'],
  INVALID_PHONE:      [400, 'Enter a valid 10-digit phone number.'],
  NOTHING_TO_SEND:    [400, 'Add at least one item with a quantity.'],
  DISPATCH_NOT_FOUND: [404, 'Delivery not found for this branch.'],
  ALREADY_RECEIVED:   [409, 'This delivery was already confirmed.'],
}

export function sendDbError(res, err) {
  const msg = err?.message || String(err)
  // OUT_OF_STOCK:<dish>:<how many left>
  const oos = msg.match(/^OUT_OF_STOCK:(.+):(-?\d+)$/)
  if (oos) {
    const [, dish, left] = oos
    return res.status(409).json({
      message: Number(left) > 0 ? `Only ${left} ${dish} left.` : `${dish} is sold out.`,
      code: 'OUT_OF_STOCK',
    })
  }
  const key = Object.keys(DB_MESSAGES).find(k => msg.startsWith(k))
  if (key) {
    const [status, text] = DB_MESSAGES[key]
    return res.status(status).json({ message: text, code: key })
  }
  console.error('[pos]', msg)
  return res.status(500).json({ message: msg || 'Something went wrong.' })
}
