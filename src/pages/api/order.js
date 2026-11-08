// GET /api/order?id=<orderId>&token=<order token>
// The order, for the browser that placed it (e.g. the receipt after payment).
import { db, checkOrderToken } from '../../lib/webSession'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const { id, token } = req.query
  if (!checkOrderToken(id, token)) return res.status(403).json({ message: 'Not allowed.' })
  const { data, error } = await db.from('orders').select('*').eq('id', id).maybeSingle()
  if (error || !data) return res.status(404).json({ message: 'Order not found' })
  return res.status(200).json({ order: data })
}
