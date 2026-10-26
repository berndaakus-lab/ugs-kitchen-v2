// Server-only: read-only access to the online app's orders, shaped for the POS.
// The POS never changes an online order; status updates stay in the online
// admin / delivery pages so the online SMS flow is unaffected.
import { db } from './supabaseAdmin'
import { normalizePhone } from './phone'

export const PAID_STATUSES = ['paid', 'preparing', 'ready', 'delivered']

const FIELDS = 'id, customer_name, delivery_location, momo_number, contact_phone, items, total_amount, status, payment_channel, paid_at, created_at, notes, branch_id, delivered_by, delivered_at'

// Same number customers see in their SMS: last 6 characters of the id.
export const orderNo = id => `#${String(id).slice(-6).toUpperCase()}`

export function shapeOrder(o) {
  return {
    id:         o.id,
    order_no:   orderNo(o.id),
    customer:   o.customer_name,
    phone:      o.contact_phone || o.momo_number,
    location:   o.delivery_location,
    is_pickup:  String(o.delivery_location || '').toLowerCase().includes('pick'),
    items:      (o.items || []).map((i, n) => ({
      key: `${i.id || n}`, name: i.name, qty: Number(i.quantity) || 1, price: Number(i.price) || 0,
    })),
    total:      Number(o.total_amount),
    status:     o.status,
    payment:    o.payment_channel,
    paid_at:    o.paid_at,
    created_at: o.created_at,
    notes:      o.notes,
    delivered_by: o.delivered_by,
    delivered_at: o.delivered_at,
  }
}

// Pick orders from `orders` (already shaped) for the server's search box:
//   no q        → today's orders
//   q = phone   → that customer's orders
//   q = number  → order number as on the SMS ("#00A1B2", "a1b2", "123") or the full id
export function matchOrders(orders, q, todayStr) {
  q = String(q || '').trim()
  if (!q) return orders.filter(o => (o.paid_at || o.created_at).slice(0, 10) === todayStr)
  if (/^\+?[\d\s-]{9,}$/.test(q)) {
    const phone = normalizePhone(q)
    return phone ? orders.filter(o => normalizePhone(o.phone) === phone) : []
  }
  const code = q.replace(/^#/, '').toUpperCase()
  return orders.filter(o => o.order_no.slice(1).endsWith(code) || String(o.id) === code)
}

// Paid online orders for a branch over the last `days` days, newest first.
export async function recentOrders(branchId, days = 2) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await db
    .from('orders')
    .select(FIELDS)
    .eq('branch_id', branchId)
    .in('status', PAID_STATUSES)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(300)
  if (error) throw error
  return data.map(shapeOrder)
}

export async function getOrder(id, branchId) {
  const { data, error } = await db.from('orders').select(FIELDS).eq('id', id).eq('branch_id', branchId).maybeSingle()
  if (error) throw error
  return data && PAID_STATUSES.includes(data.status) ? shapeOrder(data) : null
}
