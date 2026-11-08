// GET /api/customer/orders            → the signed-in customer's last 50 orders
// GET /api/customer/orders?ids=1,2,3  → just those (only if they are theirs)
// GET /api/customer/orders?count=1    → { count }
import { db, readCustomer } from '../../../lib/webSession'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const session = await readCustomer(req)
  if (!session) return res.status(401).json({ message: 'Not signed in.' })
  const { data: me } = await db.from('customers').select('phone').eq('id', session.id).maybeSingle()
  if (!me) return res.status(401).json({ message: 'Not signed in.' })

  if (req.query.count) {
    const { count } = await db.from('orders').select('id', { count: 'exact', head: true }).eq('momo_number', me.phone)
    return res.status(200).json({ count: count ?? 0 })
  }

  let q = db.from('orders').select('*').eq('momo_number', me.phone)
  if (req.query.ids) {
    const ids = String(req.query.ids).split(',').map(s => s.trim()).filter(Boolean).slice(0, 50)
    q = q.in('id', ids)
  } else {
    q = q.order('created_at', { ascending: false }).limit(50)
  }
  const { data, error } = await q
  if (error) return res.status(500).json({ message: 'Could not load your orders.' })
  return res.status(200).json({ orders: data ?? [] })
}
