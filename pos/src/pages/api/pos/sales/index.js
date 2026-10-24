import { db, rpc, loadSale, staffNames, today } from '@/lib/supabaseAdmin'
import { withAuth, isElevated } from '@/lib/session'
import { broadcast } from '@/lib/broadcast'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DIRECT_METHODS = ['cash', 'momo_manual', 'card']

export default withAuth(async (req, res) => {
  if (req.method === 'POST') return createSale(req, res)
  if (req.method === 'GET')  return listSales(req, res)
  return res.status(405).json({ message: 'Method not allowed' })
})

// POST { client_ref, items: [{menu_item_id, qty}], payments: [{method, amount, tendered?, reference?}] }
async function createSale(req, res) {
  if (req.user.role !== 'cashier' && !isElevated(req.user.role)) {
    return res.status(403).json({ message: 'Only cashiers can take payments.' })
  }

  const { client_ref, items, payments } = req.body || {}
  if (!UUID.test(client_ref || '')) return res.status(400).json({ message: 'Missing client_ref.' })
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ message: 'Cart is empty.' })
  if (!Array.isArray(payments) || !payments.length) return res.status(400).json({ message: 'Add a payment.' })

  for (const p of payments) {
    if (!DIRECT_METHODS.includes(p.method)) return res.status(400).json({ message: 'Invalid payment method.' })
    if (!(Number(p.amount) > 0)) return res.status(400).json({ message: 'Invalid payment amount.' })
    if (p.method !== 'cash' && !String(p.reference || '').trim()) {
      return res.status(400).json({ message: 'Enter the transaction reference.' })
    }
  }

  const saleId = await rpc('pos_create_sale', {
    p_branch:     req.user.branch_id,
    p_cashier:    req.user.sid,
    p_client_ref: client_ref,
    p_items:      items.map(i => ({ menu_item_id: i.menu_item_id, qty: Number(i.qty) })),
    p_payments:   payments.map(p => ({
      method:    p.method,
      amount:    Number(p.amount),
      tendered:  p.method === 'cash' ? Number(p.tendered ?? p.amount) : null,
      reference: p.reference || null,
    })),
    p_status: 'paid',
  })

  const sale = await loadSale(saleId)
  await broadcast(req.user.branch_id, 'sale_paid', { id: sale.id, ticket_no: sale.ticket_no })
  return res.status(200).json({ sale })
}

// GET ?view=queue   → paid tickets waiting to be served (server screen)
// GET ?view=recent  → today's sales at this branch, newest first (cashier/manager)
// (Managers' all-channel list lives in manager/sales.js.)
async function listSales(req, res) {
  const { view = 'queue' } = req.query
  let q = db
    .from('pos_sales')
    .select('id, ticket_no, status, total, created_at, served_at, cashier_id, served_by_id, pos_sale_items(id, name_snapshot, qty, qty_served)')
    .eq('branch_id', req.user.branch_id)

  if (view === 'queue') {
    q = q.eq('business_date', today()).in('status', ['paid', 'partially_served']).order('created_at', { ascending: true })
  } else if (view === 'recent') {
    q = q.eq('business_date', today()).order('created_at', { ascending: false }).limit(30)
    if (req.user.role === 'cashier') q = q.eq('cashier_id', req.user.sid)
  } else {
    return res.status(400).json({ message: 'Unknown view.' })
  }

  const { data, error } = await q
  if (error) throw error

  const names = await staffNames(data.flatMap(s => [s.cashier_id, s.served_by_id]))
  const sales = data.map(({ pos_sale_items, ...s }) => ({
    ...s,
    items:     pos_sale_items,
    cashier:   names[s.cashier_id] || null,
    served_by: names[s.served_by_id] || null,
  }))
  return res.status(200).json({ sales })
}
