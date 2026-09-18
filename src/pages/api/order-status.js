// GET /api/order-status?orderId=<id>
// Returns lightweight order fields used by PayStatus to detect wait_time_minutes updates.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { orderId } = req.query
  if (!orderId) return res.status(400).json({ message: 'Missing orderId' })

  const { data, error } = await supabase
    .from('orders')
    .select('id, status, wait_time_minutes')
    .eq('id', orderId)
    .single()

  if (error || !data) return res.status(404).json({ message: 'Order not found' })

  return res.status(200).json(data)
}
