// POST /api/push/subscribe
// Saves or updates a push subscription endpoint for admin or customer.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { subscription, role, orderId } = req.body ?? {}
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return res.status(400).json({ message: 'Invalid subscription object' })
  }
  if (!['admin', 'customer'].includes(role)) {
    return res.status(400).json({ message: 'role must be admin or customer' })
  }

  const record = {
    endpoint: subscription.endpoint,
    p256dh:   subscription.keys.p256dh,
    auth:     subscription.keys.auth,
    role,
    order_id: role === 'customer' ? (orderId ?? null) : null,
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(record, { onConflict: 'endpoint' })

  if (error) {
    console.error('[push/subscribe]', error.message)
    return res.status(500).json({ message: error.message })
  }

  return res.status(200).json({ ok: true })
}
