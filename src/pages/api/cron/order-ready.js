// GET /api/cron/order-ready
// Called by Vercel Cron every 5 minutes (see vercel.json).
// Finds paid/preparing orders that are 30+ minutes old and haven't had a reminder sent,
// then sends a single "your food should be ready soon" SMS to the customer.
//
// Cost-saving design:
//   - Only 1 reminder SMS per order (reminded_at column guards against re-sends)
//   - Only fires if order is still in-progress (not ready/delivered/cancelled)
//   - Batches all qualifying orders in one DB query

import { createClient } from '@supabase/supabase-js'
import { sendSMS, msgReadyReminder } from '../../../lib/sms'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  // Vercel Cron sends GET; protect against random callers with a shared secret
  const authHeader = req.headers.authorization
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()

  // Find orders: paid or preparing, older than 30 mins, no reminder sent yet
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, customer_name, momo_number, delivery_location, total_amount, items')
    .in('status', ['paid', 'preparing'])
    .lt('paid_at', thirtyMinsAgo)
    .is('reminded_at', null)
    .limit(20) // Safety cap — never blast more than 20 at once

  if (error) {
    console.error('[cron/order-ready] DB query failed:', error.message)
    return res.status(500).json({ message: error.message })
  }

  if (!orders || orders.length === 0) {
    return res.status(200).json({ sent: 0 })
  }

  let sent = 0
  for (const order of orders) {
    // Mark reminded_at first (optimistic lock) to avoid double-send if cron overlaps
    const { error: updateErr } = await supabase
      .from('orders')
      .update({ reminded_at: new Date().toISOString() })
      .eq('id', order.id)
      .is('reminded_at', null) // Only update if not already set (race guard)

    if (updateErr) {
      console.warn(`[cron/order-ready] Could not lock order ${order.id}:`, updateErr.message)
      continue
    }

    const result = await sendSMS({
      to:      order.momo_number,
      message: msgReadyReminder(order),
    })

    if (result.ok) sent++
  }

  console.log(`[cron/order-ready] Sent ${sent}/${orders.length} reminders`)
  return res.status(200).json({ sent, total: orders.length })
}
