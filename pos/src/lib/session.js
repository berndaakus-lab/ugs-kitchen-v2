// Signed httpOnly session cookie for POS staff (server-only).
import { SignJWT, jwtVerify } from 'jose'

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

// Managers (one branch) and admins (all branches) may use every screen.
export const isElevated = role => role === 'manager' || role === 'admin'

// Wrap an API handler: requires a session, optionally one of `roles`.
export function withAuth(handler, { roles } = {}) {
  return async (req, res) => {
    const user = await readSession(req)
    if (!user) return res.status(401).json({ message: 'Please log in.' })
    if (roles && !isElevated(user.role) && !roles.includes(user.role)) {
      return res.status(403).json({ message: 'Not allowed for your role.' })
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
}

export function sendDbError(res, err) {
  const msg = err?.message || String(err)
  const key = Object.keys(DB_MESSAGES).find(k => msg.startsWith(k))
  if (key) {
    const [status, text] = DB_MESSAGES[key]
    return res.status(status).json({ message: text, code: key })
  }
  console.error('[pos]', msg)
  return res.status(500).json({ message: msg || 'Something went wrong.' })
}
