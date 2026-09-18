// GET /api/review/validate?token=<uuid>
// Returns whether the review token is valid, unused, and not expired.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const TOKEN_TTL_DAYS = 1

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { token } = req.query
  if (!token) return res.status(400).json({ valid: false, reason: 'no_token' })

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, customer_name, momo_number, delivered_at, review_token_used_at')
    .eq('review_token', token)
    .single()

  if (error || !order) return res.status(200).json({ valid: false, reason: 'invalid' })

  if (order.review_token_used_at) {
    return res.status(200).json({ valid: false, reason: 'already_used' })
  }

  const deliveredAt = new Date(order.delivered_at ?? order.created_at)
  const expiresAt   = new Date(deliveredAt.getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
  if (Date.now() > expiresAt.getTime()) {
    return res.status(200).json({ valid: false, reason: 'expired' })
  }

  return res.status(200).json({
    valid:         true,
    orderId:       order.id,
    customerName:  order.customer_name,
    momoNumber:    order.momo_number,
  })
}
